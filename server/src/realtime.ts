import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import type { MissionBundle } from './types.js';
import type { MemoryStore } from './storage/memoryStore.js';
import { reconstructedMessage, unlockedEnigmas } from './game/progression.js';

export function createRealtime(httpServer: HttpServer, bundle: MissionBundle, store: MemoryStore): Server {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173', credentials: true }
  });

  io.on('connection', (socket) => {
    const { cellId, pseudo } = socket.handshake.auth as { cellId?: string; pseudo?: string };
    if (cellId && pseudo) {
      socket.join(`cell:${cellId}`);
      const players = store.online.get(cellId) ?? new Map<string, number>();
      players.set(pseudo, Date.now());
      store.online.set(cellId, players);
      emitCell(io, bundle, store, cellId);
      socket.on('disconnect', () => {
        players.delete(pseudo);
        emitCell(io, bundle, store, cellId);
      });
    }
    socket.join('admin');
  });

  return io;
}

export function emitCell(io: Server, bundle: MissionBundle, store: MemoryStore, cellId: string): void {
  const state = store.getCell(cellId);
  io.to(`cell:${cellId}`).emit('cell:update', {
    state,
    totalWords: bundle.words.length,
    enigmas: unlockedEnigmas(bundle, state),
    message: reconstructedMessage(bundle, state),
    online: Array.from(store.online.get(cellId)?.keys() ?? [])
  });
  io.to('admin').emit('admin:update', adminSummary(bundle, store));
}

export function adminSummary(bundle: MissionBundle, store: MemoryStore) {
  return {
    cells: bundle.cells.map((cell) => {
      const state = store.getCell(cell.id);
      return {
        id: cell.id,
        activePlayers: store.online.get(cell.id)?.size ?? 0,
        totalPlayers: cell.members.length,
        found: state.found.length,
        total: bundle.words.length,
        paused: state.paused,
        hintsUsed: state.hintsUsed,
        lastAction: store.events.find((event) => event.cellId === cell.id),
        alerts: store.alerts.filter((alert) => alert.cellId === cell.id).slice(0, 5)
      };
    }),
    alerts: store.alerts.slice(0, 20),
    events: store.events.slice(0, 100)
  };
}
