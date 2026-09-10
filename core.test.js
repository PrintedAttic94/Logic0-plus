import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  Simulation, createDemoLevel, Direction, InstructionTile, ExecutionTile, WinCondition,
  cell, inBounds, key, next, validateLevel,
} from './core.js';

test('demo level wins through its prescribed commands', () => {
  const game = new Simulation(createDemoLevel());
  for (let i = 0; i < 8; i += 1) game.step();
  assert.equal(game.status, 'won');
  assert.deepEqual(game.execution.position, cell(6, 11));
});

test('an execution robot hitting a wall stays alive and the instruction robot continues', () => {
  const level = createDemoLevel();
  level.execution.robot = { position: cell(0, 0), direction: Direction.UP };
  const game = new Simulation(level);
  game.step();
  assert.equal(game.status, 'running');
  assert.deepEqual(game.execution.position, cell(0, 0));
});

test('an internal execution wall blocks forward movement without failing the level', () => {
  const level = createDemoLevel();
  level.execution.robot = { position: cell(4, 4), direction: Direction.RIGHT };
  level.execution.tiles['5,4'] = { type: ExecutionTile.WALL };
  const game = new Simulation(level);
  game.step();
  assert.deepEqual(game.execution.position, cell(4, 4));
  assert.equal(game.status, 'running');
  assert.deepEqual(game.snapshot().visuals, [{ kind: 'wallBump', position: cell(4, 4), direction: null }]);
});

test('a level may use a 20 by 20 execution grid', () => {
  const level = createDemoLevel();
  level.execution.size = 20;
  const game = new Simulation(level);

  assert.equal(game.isExecutionWall(cell(19, 19)), false);
  assert.equal(game.isExecutionWall(cell(20, 19)), true);
});

test('falling into an instruction void emits a visual event at that cell', () => {
  const game = new Simulation({ instruction: { tiles: {} }, execution: { robot: { position: cell(0, 0), direction: Direction.UP }, tiles: { '1,1': { type: ExecutionTile.FINISH } } } });
  game.step();
  assert.deepEqual(game.snapshot().visuals, [{ kind: 'void', position: cell(0, 0), direction: Direction.RIGHT }]);
});

test('eliminating every instruction robot wins an elimination level', () => {
  const level = {
    meta: { winCondition: WinCondition.ELIMINATE_INSTRUCTION_ROBOTS },
    instruction: { tiles: { '0,0': { type: InstructionTile.FORWARD } } },
    execution: { robot: { position: cell(0, 0), direction: Direction.UP }, tiles: {} },
  };
  assert.deepEqual(validateLevel(level), {
    valid: true,
    clonePoints: 0,
    finishes: 0,
    winCondition: WinCondition.ELIMINATE_INSTRUCTION_ROBOTS,
  });

  const game = new Simulation(level);
  game.step();
  game.step();

  assert.equal(game.status, 'won');
  assert.equal(game.active, null);
  assert.deepEqual(game.waiting, []);
  assert.match(game.events[0].message, /均已歼灭/);
});

test('a finish tile cannot satisfy an elimination level', () => {
  const level = {
    meta: { winCondition: WinCondition.ELIMINATE_INSTRUCTION_ROBOTS },
    instruction: { tiles: { '0,0': { type: InstructionTile.FORWARD } } },
    execution: {
      robot: { position: cell(0, 1), direction: Direction.UP },
      tiles: { '0,0': { type: ExecutionTile.FINISH } },
    },
  };
  assert.equal(validateLevel(level).valid, false);

  const game = new Simulation(level);
  game.step();

  assert.equal(game.status, 'running');
  assert.deepEqual(game.execution.position, cell(0, 0));
});

test('losing every instruction robot still fails a normal level', () => {
  const level = {
    instruction: { tiles: {} },
    execution: { robot: { position: cell(0, 0), direction: Direction.UP }, tiles: {} },
  };
  assert.equal(validateLevel(level).valid, false);

  const game = new Simulation(level);
  game.step();

  assert.equal(game.status, 'lost');
});

test('barriers become void at runtime and return on reset', () => {
  const level = { instruction: { tiles: { '0,0': { type: InstructionTile.BARRIER } } }, execution: { robot: { position: cell(0, 0), direction: Direction.UP }, tiles: { '1,1': { type: ExecutionTile.FINISH } } } };
  const game = new Simulation(level);
  assert.equal(game.tileAtInstruction(cell(0, 0)).type, InstructionTile.BARRIER);
  game.begin();
  assert.equal(game.tileAtInstruction(cell(0, 0)), null);
  assert.equal(game.snapshot().barriersVoid, true);
  game.reset();
  assert.equal(game.snapshot().barriersVoid, false);
});

test('observer uses execution tile color to choose one of three relative exits', () => {
  const level = { instruction: { tiles: { '0,0': { type: InstructionTile.OBSERVER, direction: Direction.UP } } }, execution: { robot: { position: cell(2, 2), direction: Direction.UP }, tiles: { '2,2': { type: ExecutionTile.RED }, '4,4': { type: ExecutionTile.FINISH } } } };
  const game = new Simulation(level);
  game.step();
  assert.equal(game.active.direction, Direction.LEFT);
});

test('a clone waits on its clone tile and resumes after its child falls', () => {
  const level = { instruction: { tiles: { '0,0': { type: InstructionTile.CLONE }, '2,2': { type: InstructionTile.CLONE_POINT } } }, execution: { robot: { position: cell(0, 0), direction: Direction.UP }, tiles: { '1,1': { type: ExecutionTile.FINISH } } } };
  const game = new Simulation(level);
  game.step();
  assert.deepEqual(game.active.position, cell(2, 2));
  assert.deepEqual(game.waiting[0].position, cell(0, 0));
  game.step();
  assert.deepEqual(game.active.position, cell(0, 0));
  assert.equal(game.status, 'running');
});

test('a clone without a clone point keeps the instruction robot on the clone tile', () => {
  const level = { instruction: { tiles: { '0,0': { type: InstructionTile.CLONE } } }, execution: { robot: { position: cell(0, 0), direction: Direction.UP }, tiles: { '1,1': { type: ExecutionTile.FINISH } } } };
  const game = new Simulation(level);

  game.step();
  assert.deepEqual(game.active.position, cell(0, 0));
  assert.equal(game.active.halted, true);
  assert.deepEqual(game.waiting, []);
  assert.equal(game.status, 'running');
  assert.ok(game.events.some(({ message }) => /停在克隆地板/.test(message)));

  game.step();
  assert.equal(game.steps, 1);
  assert.deepEqual(game.active.position, cell(0, 0));
  assert.deepEqual(game.execution.position, cell(0, 0));
});

test('a clone point without a clone still lets the instruction robot pass through', () => {
  const level = { instruction: { tiles: { '0,0': { type: InstructionTile.CLONE_POINT }, '1,0': { type: InstructionTile.FORWARD } } }, execution: { robot: { position: cell(0, 1), direction: Direction.UP }, tiles: { '0,0': { type: ExecutionTile.FINISH } } } };
  const game = new Simulation(level);

  game.step();
  assert.deepEqual(game.active.position, cell(0, 0));
  assert.deepEqual(game.execution.position, cell(0, 1));
  assert.equal(game.active.halted, undefined);

  game.step();
  assert.deepEqual(game.active.position, cell(1, 0));
  assert.deepEqual(game.execution.position, cell(0, 0));
});

test('level 10 covers every instruction route and all nine execution rooms', () => {
  const level = JSON.parse(fs.readFileSync(new URL('./levels/10-积木.json', import.meta.url), 'utf8'));
  const game = new Simulation(level);
  const instructionVisits = new Map();
  const observerExits = new Map();
  const visitedRooms = new Set();
  const roomPaths = Array.from({ length: 9 }, () => []);
  const roomCells = Array.from({ length: 9 }, () => new Set());
  const clonePoint = Object.entries(level.instruction.tiles)
    .find(([, tile]) => tile.type === InstructionTile.CLONE_POINT)?.[0];
  const recordInstructionVisit = (positionKey) => {
    instructionVisits.set(positionKey, (instructionVisits.get(positionKey) || 0) + 1);
  };
  const middleTopLeftReds = Array.from({ length: 6 }, (_, y) => level.execution.tiles[`7,${y}`]?.type)
    .filter((type) => type === ExecutionTile.RED).length;
  const centerBottomReds = Array.from({ length: 6 }, (_, x) => level.execution.tiles[`${x + 7},12`]?.type)
    .filter((type) => type === ExecutionTile.RED).length;
  const middleRightEdgeReds = Array.from({ length: 6 }, (_, y) => level.execution.tiles[`19,${y + 7}`]?.type)
    .filter((type) => type === ExecutionTile.RED).length;

  for (let i = 0; i < 3000 && (game.status === 'ready' || game.status === 'running'); i += 1) {
    const destination = next(game.active.position, game.active.direction);
    const instructionTile = inBounds(destination) ? game.tileAtInstruction(destination) : null;
    const waitingBefore = game.waiting.length;

    if (instructionTile) {
      const destinationKey = key(destination);
      recordInstructionVisit(destinationKey);
      if (instructionTile.type === InstructionTile.OBSERVER) {
        const color = game.tileAtExecution(game.execution.position).type;
        const exits = observerExits.get(destinationKey) || { white: 0, red: 0, blue: 0 };
        assert.ok(color in exits, `observer ${destinationKey} read unsupported color ${color}`);
        exits[color] += 1;
        observerExits.set(destinationKey, exits);
      }
    }

    game.step();
    if (
      instructionTile?.type === InstructionTile.CLONE
      && game.waiting.length > waitingBefore
      && game.active
      && key(game.active.position) === clonePoint
    ) {
      recordInstructionVisit(clonePoint);
    }

    const { x, y } = game.execution.position;
    const column = x < 6 ? 0 : x > 6 && x < 13 ? 1 : x > 13 ? 2 : -1;
    const row = y < 6 ? 0 : y > 6 && y < 13 ? 1 : y > 13 ? 2 : -1;
    if (column >= 0 && row >= 0) {
      const room = row * 3 + column;
      const positionKey = `${x},${y}`;
      visitedRooms.add(room);
      if (!roomCells[room].has(positionKey)) {
        roomCells[room].add(positionKey);
        roomPaths[room].push([x - column * 7, y - row * 7]);
      }
    }
  }

  const canonicalPath = (path) => {
    const variants = [];
    for (let transform = 0; transform < 8; transform += 1) {
      variants.push(path.map(([sourceX, sourceY]) => {
        let x = transform & 1 ? 5 - sourceX : sourceX;
        let y = transform & 1 ? sourceY : 5 - sourceY;
        for (let rotation = 0; rotation < (transform >> 1); rotation += 1) [x, y] = [5 - y, x];
        return `${x},${y}`;
      }).join('|'));
    }
    return variants.sort()[0];
  };

  const underVisited = Object.entries(level.instruction.tiles)
    .filter(([, tile]) => tile.type !== InstructionTile.BARRIER)
    .filter(([positionKey]) => (instructionVisits.get(positionKey) || 0) < 3)
    .map(([positionKey, tile]) => ({
      position: positionKey,
      type: tile.type,
      visits: instructionVisits.get(positionKey) || 0,
    }));
  const insufficientObserverExits = Object.entries(level.instruction.tiles)
    .filter(([, tile]) => tile.type === InstructionTile.OBSERVER)
    .flatMap(([positionKey]) => ['white', 'red', 'blue']
      .filter((color) => (observerExits.get(positionKey)?.[color] || 0) < 3)
      .map((color) => ({
        observer: positionKey,
        color,
        exits: observerExits.get(positionKey)?.[color] || 0,
      })));

  assert.equal(game.status, 'won');
  assert.deepEqual(game.execution.position, cell(19, 19));
  assert.deepEqual(underVisited, []);
  assert.deepEqual(insufficientObserverExits, []);
  assert.equal(visitedRooms.size, 9);
  assert.equal(new Set(roomPaths.map(canonicalPath)).size, 9);
  assert.ok(middleTopLeftReds <= 1);
  assert.ok(centerBottomReds <= 2);
  assert.ok(middleRightEdgeReds <= 3);
});
