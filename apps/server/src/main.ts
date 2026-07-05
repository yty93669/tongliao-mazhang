import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager, type Client } from './room-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const webDist = join(__dirname, '../../web/dist');

const app = express();
app.use(cors());
app.use(express.json());

const manager = new RoomManager();

app.get('/health', (_, res) => res.json({ ok: true }));
app.post('/rooms', (_, res) => res.json({ roomId: manager.createRoom() }));
app.get('/rooms/:roomId/logs', (req, res) => {
  try {
    res.json({ roomId: req.params.roomId, logs: manager.getLogs(req.params.roomId) });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/ws') || req.path.startsWith('/rooms') || req.path.startsWith('/health')) return next();
    res.sendFile(join(webDist, 'index.html'));
  });
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', ws => {
  const client: Client = { ws };

  ws.on('message', buf => {
    try {
      const msg = JSON.parse(buf.toString());
      if (msg.type === 'CREATE_ROOM') {
        const roomId = manager.createRoom();
        ws.send(JSON.stringify({ type: 'ROOM_CREATED', roomId }));
        return;
      }
      if (msg.type === 'JOIN') {
        const joined = manager.joinRoom(client, msg.roomId, msg.name ?? '玩家');
        ws.send(JSON.stringify({ type: 'JOINED', ...joined }));
        return;
      }
      if (msg.type === 'START') {
        manager.start(client.roomId ?? msg.roomId);
        return;
      }
      if (msg.type === 'ACTION') {
        manager.action(client.roomId ?? msg.roomId, client, msg.action);
        return;
      }
      ws.send(JSON.stringify({ type: 'ERROR', error: '未知消息' }));
    } catch (error) {
      ws.send(JSON.stringify({ type: 'ERROR', error: error instanceof Error ? error.message : String(error) }));
    }
  });

  ws.on('close', () => manager.disconnect(client));
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`server listening on http://0.0.0.0:${port}`);
});
