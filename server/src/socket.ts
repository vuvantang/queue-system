import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { getQueueStatus } from './services/ticket.service.js';

let io: Server;

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Client joins an area room
    socket.on('join:area', (areaId: number) => {
      const room = `area:${areaId}`;
      socket.join(room);
      console.log(`${socket.id} joined ${room}`);

      // Send current queue status
      try {
        const status = getQueueStatus(areaId);
        socket.emit('queue:status', status);
      } catch (err) {
        console.error('Error getting queue status:', err);
      }
    });

    socket.on('leave:area', (areaId: number) => {
      socket.leave(`area:${areaId}`);
    });

    socket.on('request:status', (areaId: number) => {
      try {
        const status = getQueueStatus(areaId);
        socket.emit('queue:status', status);
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
