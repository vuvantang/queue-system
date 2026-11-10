import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import db from './db.js';
import { getQueueStatus } from './services/ticket.service.js';
import { isOriginAllowed } from './middleware/origin.js';

let io: Server;

const MAX_AREA_ROOMS_PER_SOCKET = 5;

/** Coerce a client-supplied area id to the id of an existing area, or null. */
function toAreaId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,10}$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  const row = db.prepare('SELECT id FROM areas WHERE id = ?').get(n) as { id: number } | undefined;
  return row ? row.id : null;
}

function areaRoomCount(socket: Socket): number {
  let n = 0;
  for (const r of socket.rooms) if (r.startsWith('area:')) n++;
  return n;
}

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    maxHttpBufferSize: 16 * 1024,
    cors: {
      origin: (origin, cb) => cb(null, isOriginAllowed(origin, undefined)),
      methods: ['GET', 'POST'],
    },
    // CORS does not apply to websocket upgrades: enforce the same origin policy here.
    allowRequest: (req, cb) => cb(null, isOriginAllowed(req.headers.origin, req.headers.host)),
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Client joins an area room
    socket.on('join:area', (rawAreaId: unknown) => {
      const areaId = toAreaId(rawAreaId);
      if (areaId === null) return;
      const room = `area:${areaId}`;
      if (!socket.rooms.has(room)) {
        if (areaRoomCount(socket) >= MAX_AREA_ROOMS_PER_SOCKET) return;
        socket.join(room);
        console.log(`${socket.id} joined ${room}`);
      }

      // Send current queue status
      try {
        socket.emit('queue:status', getQueueStatus(areaId));
      } catch (err) {
        console.error('Error getting queue status:', err);
      }
    });

    socket.on('leave:area', (rawAreaId: unknown) => {
      const n = Number(rawAreaId);
      if (Number.isSafeInteger(n) && n > 0) socket.leave(`area:${n}`);
    });

    socket.on('request:status', (rawAreaId: unknown) => {
      const areaId = toAreaId(rawAreaId);
      if (areaId === null) return;
      try {
        socket.emit('queue:status', getQueueStatus(areaId));
      } catch (err) {
        console.error('Error getting queue status:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function broadcast(room: string, event: string, data: any): void {
  if (!io) return;

  if (room === 'all') {
    io.emit(event, data);
  } else {
    io.to(room).emit(event, data);
  }
}
