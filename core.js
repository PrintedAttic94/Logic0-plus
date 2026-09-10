// Puzzle Core: no DOM, rendering, input, or platform dependencies.
export const SIZE = 15;
export const Direction = Object.freeze({ UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 });
export const DIR_NAMES = ['↑', '→', '↓', '←'];
const DELTAS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const InstructionTile = Object.freeze({
  FORWARD: 'forward', LEFT: 'left', RIGHT: 'right', TRACK: 'track',
  OBSERVER: 'observer', CLONE: 'clone', CLONE_POINT: 'clonePoint', BARRIER: 'barrier'
});
export const ExecutionTile = Object.freeze({ WHITE: 'white', RED: 'red', BLUE: 'blue', FINISH: 'finish', WALL: 'wall' });
export const WinCondition = Object.freeze({ REACH_FINISH: 'reachFinish', ELIMINATE_INSTRUCTION_ROBOTS: 'eliminateInstructionRobots' });

export function cell(x, y) { return { x, y }; }
export function inBounds({ x, y }, size = SIZE) { return x >= 0 && x < size && y >= 0 && y < size; }
export function key({ x, y }) { return `${x},${y}`; }
export function next(position, direction) { const [x, y] = DELTAS[direction]; return cell(position.x + x, position.y + y); }
export function turn(direction, amount) { return (direction + amount + 4) % 4; }
export function cloneLevel(level) { return JSON.parse(JSON.stringify(level)); }

export function validateLevel(level) {
  const clonePoints = Object.values(level.instruction.tiles).filter((tile) => tile.type === InstructionTile.CLONE_POINT).length;
  const finishes = Object.values(level.execution.tiles).filter((tile) => tile.type === ExecutionTile.FINISH).length;
  const winCondition = level.meta?.winCondition || WinCondition.REACH_FINISH;
  const finishesValid = winCondition === WinCondition.ELIMINATE_INSTRUCTION_ROBOTS ? finishes === 0 : finishes === 1;
  return { valid: clonePoints <= 1 && finishesValid, clonePoints, finishes, winCondition };
}

export function createDemoLevel() {
  const instruction = {};
  // A compact first level: ↑↑ → ↑↑↑↑ reaches the finish.
  ['forward', 'forward', 'forward', 'right', 'forward', 'forward', 'forward', 'forward'].forEach((type, x) => {
    instruction[`${x},0`] = { type, preset: true };
  });
  const execution = {};
  execution['2,14'] = { type: ExecutionTile.WHITE };
  execution['2,13'] = { type: ExecutionTile.WHITE };
  execution['2,12'] = { type: ExecutionTile.WHITE };
  execution['2,11'] = { type: ExecutionTile.WHITE };
  execution['3,11'] = { type: ExecutionTile.WHITE };
  execution['4,11'] = { type: ExecutionTile.WHITE };
  execution['5,11'] = { type: ExecutionTile.WHITE };
  execution['6,11'] = { type: ExecutionTile.FINISH };
  return {
    meta: { id: '001', name: '第一条程序' },
    inventory: { forward: 6, left: 2, right: 2, track: 2, observer: 2, clone: 1, clonePoint: 1 },
    instruction: { tiles: instruction }, execution: { tiles: execution, robot: { position: cell(2, 14), direction: Direction.UP } }
  };
}

export class Simulation {
  constructor(level) { this.level = cloneLevel(level); this.reset(); }
  reset() {
    this.execution = cloneLevel(this.level.execution.robot);
    this.executionSize = this.level.execution.size || SIZE;
    this.active = { position: cell(-1, 0), direction: Direction.RIGHT, id: 0 };
    this.waiting = [];
    this.status = 'ready'; this.steps = 0; this.events = []; this.visuals = []; this.barriersVoid = false;
    this.emit('系统就绪：指令机器人在网格左上方等待。');
  }
  emit(message) { this.events.unshift({ step: this.steps, message }); }
  visual(kind, position, direction = null) { this.visuals.push({ kind, position: cell(position.x, position.y), direction }); }
  begin() { if (this.status !== 'won' && this.status !== 'lost') { this.status = 'running'; this.barriersVoid = true; } }
  tileAtInstruction(position) { const tile = this.level.instruction.tiles[key(position)] || null; return this.barriersVoid && tile?.type === InstructionTile.BARRIER ? null : tile; }
  tileAtExecution(position) { return this.level.execution.tiles[key(position)] || { type: ExecutionTile.WHITE }; }
  isExecutionWall(position) { return !inBounds(position, this.executionSize) || this.tileAtExecution(position).type === ExecutionTile.WALL; }
  step() {
    if (this.status === 'won' || this.status === 'lost') return this.snapshot();
    this.begin();
    if (this.active.halted) return this.snapshot();
    this.steps += 1; this.visuals = [];
    const destination = next(this.active.position, this.active.direction);
    if (!inBounds(destination) || !this.tileAtInstruction(destination)) {
      this.visual(inBounds(destination) ? 'void' : 'edgeVoid', inBounds(destination) ? destination : this.active.position, this.active.direction);
      this.emit('指令机器人坠入虚空。');
      this.destroyActive(); return this.snapshot();
    }
    this.active.position = destination;
    const tile = this.tileAtInstruction(destination);
    this.applyInstructionTile(tile);
    if (this.status === 'running') this.emit(`指令机器人进入 ${tile.type} 地板。`);
    return this.snapshot();
  }
  applyInstructionTile(tile) {
    if (tile.type === InstructionTile.FORWARD) this.command('forward');
    else if (tile.type === InstructionTile.LEFT) this.command('left');
    else if (tile.type === InstructionTile.RIGHT) this.command('right');
    else if (tile.type === InstructionTile.TRACK) { this.active.direction = tile.direction ?? Direction.RIGHT; this.emit(`轨道转向 ${DIR_NAMES[this.active.direction]}。`); }
    else if (tile.type === InstructionTile.OBSERVER) {
      const color = this.tileAtExecution(this.execution.position).type;
      const relative = color === ExecutionTile.WHITE ? 0 : color === ExecutionTile.RED ? 3 : 1;
      this.active.direction = turn(tile.direction ?? Direction.UP, relative);
      this.emit(`观察者读取 ${color}，转向 ${DIR_NAMES[this.active.direction]}。`);
    } else if (tile.type === InstructionTile.CLONE) this.clone();
  }
  command(command) {
    if (command === 'left') { this.execution.direction = turn(this.execution.direction, -1); this.emit('执行机器人左转。'); }
    if (command === 'right') { this.execution.direction = turn(this.execution.direction, 1); this.emit('执行机器人右转。'); }
    if (command === 'forward') {
      const target = next(this.execution.position, this.execution.direction);
      if (this.isExecutionWall(target)) { this.visual('wallBump', this.execution.position); this.emit('执行机器人前方是墙：前进指令未执行。'); }
      else { this.execution.position = target; this.emit(`执行机器人前进至 (${target.x + 1}, ${target.y + 1})。`); }
    }
    if (
      this.level.meta?.winCondition !== WinCondition.ELIMINATE_INSTRUCTION_ROBOTS
      && this.tileAtExecution(this.execution.position).type === ExecutionTile.FINISH
    ) { this.status = 'won'; this.emit('到达终点，关卡完成！'); }
  }
  clone() {
    const pointEntry = Object.entries(this.level.instruction.tiles).find(([, tile]) => tile.type === InstructionTile.CLONE_POINT);
    if (!pointEntry) { this.active.halted = true; this.emit('克隆地板没有克隆位点：指令机器人停在克隆地板上。'); return; }
    const [point] = pointEntry; const [x, y] = point.split(',').map(Number);
    // Waiting robots remain on their own clone tile. A collision can only occur
    // when the active robot subsequently enters that same clone tile.
    const collision = this.waiting.findIndex((robot) => key(robot.position) === key(this.active.position));
    if (collision !== -1) { this.waiting.splice(collision, 1); this.visual('collision', this.active.position); this.emit('克隆地板发生碰撞：两个指令机器人坠毁。'); this.destroyActive(); return; }
    this.waiting.push({ ...this.active, position: cell(this.active.position.x, this.active.position.y) });
    this.active = { position: cell(x, y), direction: this.active.direction, id: this.steps };
    this.emit('克隆完成：原机器人等待，新机器人继续移动。');
  }
  destroyActive() {
    if (this.waiting.length) { this.active = this.waiting.pop(); this.emit('最后一个等待机器人恢复移动。'); }
    else {
      this.active = null;
      if (this.level.meta?.winCondition === WinCondition.ELIMINATE_INSTRUCTION_ROBOTS) {
        this.status = 'won';
        this.emit('所有指令机器人均已歼灭，关卡完成！');
      } else {
        this.status = 'lost';
        this.emit('没有可恢复的指令机器人，关卡失败。');
      }
    }
  }
  snapshot() { return { status: this.status, steps: this.steps, active: this.active && cloneLevel(this.active), waiting: cloneLevel(this.waiting), execution: cloneLevel(this.execution), events: [...this.events], visuals: cloneLevel(this.visuals), barriersVoid: this.barriersVoid }; }
}
