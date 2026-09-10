import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const directories = { levels: join(root, 'levels'), saves: join(root, 'saves'), cleared: join(root, 'cleared') };
await Promise.all(Object.values(directories).map((directory) => mkdir(directory, { recursive: true })));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const safeName = (value) => String(value).replace(/[\\/:*?"<>|]/g, '-').replace(/\.{2,}/g, '-').trim().slice(0, 72) || 'untitled';
const json = (response, status, data) => { response.writeHead(status, { 'Content-Type': mime['.json'] }); response.end(JSON.stringify(data, null, 2)); };
const body = async (request) => { let text = ''; for await (const chunk of request) text += chunk; return JSON.parse(text || '{}'); };
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const clearFingerprint = (data) => stableJson({
  playerTiles: data.playerTiles,
  playerExecutionTiles: data.playerExecutionTiles ?? data.level?.execution?.tiles,
  inventory: data.inventory,
});
const compareLevelFiles = (left, right) => {
  const leftNumber = left.match(/^(-?\d+)-/);
  const rightNumber = right.match(/^(-?\d+)-/);
  if (leftNumber && rightNumber) {
    const difference = Number(leftNumber[1]) - Number(rightNumber[1]);
    if (difference) return difference;
  } else if (leftNumber) return -1;
  else if (rightNumber) return 1;
  return left.localeCompare(right, 'zh-CN', { numeric: true });
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost'); const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts[0] === 'api') {
      const group = parts[1]; const dir = directories[group]; if (!dir) return json(response, 404, { error: 'Unknown collection' });
      if (group === 'cleared' && parts[2] === 'history') {
        const historyDir = join(dir, safeName(parts[3])); await mkdir(historyDir, { recursive: true });
        if (request.method === 'GET' && parts.length === 4) {
          const files = (await readdir(historyDir)).filter((file) => file.endsWith('.json')).sort().reverse();
          return json(response, 200, files);
        }
        if (request.method === 'GET' && parts.length === 5) return json(response, 200, JSON.parse(await readFile(join(historyDir, `${safeName(parts[4])}.json`), 'utf8')));
        if (request.method === 'POST' && parts.length === 4) {
          const data = await body(request); const fingerprint = clearFingerprint(data); const files = (await readdir(historyDir)).filter((file) => file.endsWith('.json'));
          for (const existing of files) { const saved = JSON.parse(await readFile(join(historyDir, existing), 'utf8')); if (clearFingerprint(saved) === fingerprint) return json(response, 200, { saved: false, duplicate: true, file: `cleared/${safeName(parts[3])}/${existing}` }); }
          const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const file = `clear-${stamp}`;
          await writeFile(join(historyDir, `${file}.json`), `${JSON.stringify(data, null, 2)}\n`);
          return json(response, 201, { saved: true, duplicate: false, file: `cleared/${safeName(parts[3])}/${file}.json` });
        }
        return json(response, 405, { error: 'Method not allowed' });
      }
      if (request.method === 'GET' && parts.length === 2 && group === 'levels') {
        const files = (await readdir(dir)).filter((file) => file.endsWith('.json')).sort(compareLevelFiles); return json(response, 200, files);
      }
      const name = safeName(parts[2] || (group === 'saves' ? 'current-progress' : group === 'cleared' ? 'latest-cleared' : 'untitled'));
      const file = join(dir, `${name}.json`);
      if (request.method === 'GET') return json(response, 200, JSON.parse(await readFile(file, 'utf8')));
      if (request.method === 'PUT') {
        const data = await body(request); let exists = true;
        try { await readFile(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') exists = false; else throw error; }
        if (exists && request.headers['x-overwrite'] !== 'true') return json(response, 409, { error: 'A file with this name already exists', file: `${group}/${name}.json` });
        await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
        return json(response, 200, { ok: true, overwritten: exists, file: `${group}/${name}.json` });
      }
      return json(response, 405, { error: 'Method not allowed' });
    }
    const requested = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = normalize(join(root, requested));
    if (!file.startsWith(root)) return response.end('Forbidden');
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); response.end(content);
  } catch (error) {
    if (!response.headersSent) json(response, error.code === 'ENOENT' ? 404 : 500, { error: error.message });
    else response.end();
  }
}).listen(4173, () => console.log('Logic0+ running at http://localhost:4173'));
