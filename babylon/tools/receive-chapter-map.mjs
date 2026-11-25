// One-shot local sink for export-chapter-map.js, avoiding a base64 copy through
// an agent response. Run, then POST the exported GLB from the Orca game tab.
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
const target = new URL('../../docs/art/chapter-1/chapter-map.glb', import.meta.url);
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5191');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'content-type');
    res.writeHead(204).end();
    return;
  }
  if (req.method !== 'POST' || req.url !== '/chapter-map') {
    res.writeHead(404).end();
    return;
  }
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 128 * 1024 * 1024) throw Error('Map exceeds export limit');
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(8) !== bytes.length)
      throw Error('Invalid GLB');
    await writeFile(target, bytes);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ bytes: size }));
    console.log('Saved chapter-map.glb: ' + size + ' bytes');
    server.close();
  } catch (error) {
    res.writeHead(400).end(error.message);
  }
});
server.listen(5192, '127.0.0.1', () =>
  console.log('Waiting for one GLB on http://127.0.0.1:5192/chapter-map'),
);
