import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { AntiCheatEvent } from '../types.js';

export interface FoundWord {
  wordId: string;
  pseudo: string;
  foundAt: string;
}

export interface CellState {
  cellId: string;
  startedAt: string;
  paused: boolean;
  found: FoundWord[];
  revealedIndexes: number[];
  transmittedProgress: number[];
  manualUnlocked: string[];
  hintsUsed: number;
}

type EventRow = { at: string; cell_id: string; pseudo: string; action: string };
type AlertRow = { cell_id: string; pseudo: string; severity: 'yellow' | 'red'; reason: string; created_at: string };

export class MemoryStore {
  private readonly db: Database.Database;
  private readonly cells = new Map<string, CellState>();
  readonly events: { at: string; cellId: string; pseudo: string; action: string }[] = [];
  readonly alerts: AntiCheatEvent[] = [];
  readonly online = new Map<string, Map<string, number>>();

  constructor() {
    const filename = process.env.DATABASE_URL ?? './data/spectra.sqlite';
    const dir = path.dirname(filename);
    if (dir && dir !== '.') fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(filename);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
    this.loadRecentActivity();
  }

  getCell(cellId: string): CellState {
    let state = this.cells.get(cellId);
    if (state) return state;

    const row = this.db.prepare('select * from cell_state where cell_id = ?').get(cellId) as Record<string, unknown> | undefined;
    if (!row) {
      state = {
        cellId,
        startedAt: new Date().toISOString(),
        paused: false,
        found: [],
        revealedIndexes: [],
        transmittedProgress: [],
        manualUnlocked: [],
        hintsUsed: 0
      };
      this.db.prepare('insert into cell_state (cell_id, started_at, paused, revealed_indexes, transmitted_progress, manual_unlocked, hints_used) values (?, ?, 0, ?, ?, ?, 0)')
        .run(cellId, state.startedAt, '[]', '[]', '[]');
    } else {
      state = {
        cellId,
        startedAt: String(row.started_at),
        paused: Boolean(row.paused),
        found: this.loadFound(cellId),
        revealedIndexes: JSON.parse(String(row.revealed_indexes ?? '[]')) as number[],
        transmittedProgress: JSON.parse(String(row.transmitted_progress ?? '[]')) as number[],
        manualUnlocked: JSON.parse(String(row.manual_unlocked ?? '[]')) as string[],
        hintsUsed: Number(row.hints_used ?? 0)
      };
    }
    this.cells.set(cellId, state);
    return state;
  }

  markFound(cellId: string, wordId: string, pseudo: string, reveal: number[]): void {
    const state = this.getCell(cellId);
    if (!state.found.some((item) => item.wordId === wordId)) {
      const foundAt = new Date().toISOString();
      state.found.push({ wordId, pseudo, foundAt });
      state.revealedIndexes = Array.from(new Set([...state.revealedIndexes, ...reveal])).sort((a, b) => a - b);
      this.db.prepare('insert into found_words (cell_id, word_id, pseudo, found_at) values (?, ?, ?, ?)').run(cellId, wordId, pseudo, foundAt);
      this.saveState(state);
      this.log(cellId, pseudo, `Mot trouvé : ${wordId}`);
    }
  }

  unlockEnigma(cellId: string, enigmaId: string): void {
    const state = this.getCell(cellId);
    if (!state.manualUnlocked.includes(enigmaId)) {
      state.manualUnlocked.push(enigmaId);
      this.saveState(state);
      this.log(cellId, 'Directrice', `Énigme débloquée : ${enigmaId}`);
    }
  }

  grantHint(cellId: string, text: string): void {
    const state = this.getCell(cellId);
    state.hintsUsed += 1;
    this.saveState(state);
    this.log(cellId, 'Directrice', `Indice accordé : ${text}`);
  }

  resetCell(cellId: string): void {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.prepare('delete from found_words where cell_id = ?').run(cellId);
      this.db.prepare('delete from events where cell_id = ?').run(cellId);
      this.db.prepare('delete from alerts where cell_id = ?').run(cellId);
      this.db.prepare('update cell_state set started_at = ?, paused = 0, revealed_indexes = ?, transmitted_progress = ?, manual_unlocked = ?, hints_used = 0 where cell_id = ?')
        .run(now, '[]', '[]', '[]', cellId);
    })();
    this.cells.delete(cellId);
    this.events.splice(0, this.events.length, ...this.events.filter((event) => event.cellId !== cellId));
    this.alerts.splice(0, this.alerts.length, ...this.alerts.filter((alert) => alert.cellId !== cellId));
    this.log(cellId, 'Directrice', 'Cellule réinitialisée');
  }

  log(cellId: string, pseudo: string, action: string): void {
    const event = { at: new Date().toISOString(), cellId, pseudo, action };
    this.events.unshift(event);
    this.events.splice(1000);
    this.db.prepare('insert into events (at, cell_id, pseudo, action) values (?, ?, ?, ?)').run(event.at, cellId, pseudo, action);
  }

  alert(alert: AntiCheatEvent): void {
    this.alerts.unshift(alert);
    this.alerts.splice(500);
    this.db.prepare('insert into alerts (cell_id, pseudo, severity, reason, created_at) values (?, ?, ?, ?, ?)')
      .run(alert.cellId, alert.pseudo, alert.severity, alert.reason, alert.createdAt);
  }

  exportCsv(): string {
    const rows = ['type,at,cell,pseudo,action,severity,reason'];
    for (const event of this.events.slice().reverse()) {
      rows.push(['event', event.at, event.cellId, event.pseudo, event.action, '', ''].map(csv).join(','));
    }
    for (const alert of this.alerts.slice().reverse()) {
      rows.push(['alert', alert.createdAt, alert.cellId, alert.pseudo, '', alert.severity, alert.reason].map(csv).join(','));
    }
    return rows.join('\n');
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists cell_state (
        cell_id text primary key,
        started_at text not null,
        paused integer not null default 0,
        revealed_indexes text not null default '[]',
        transmitted_progress text not null default '[]',
        manual_unlocked text not null default '[]',
        hints_used integer not null default 0
      );
      create table if not exists found_words (
        cell_id text not null,
        word_id text not null,
        pseudo text not null,
        found_at text not null,
        primary key (cell_id, word_id)
      );
      create table if not exists events (
        at text not null,
        cell_id text not null,
        pseudo text not null,
        action text not null
      );
      create table if not exists alerts (
        cell_id text not null,
        pseudo text not null,
        severity text not null,
        reason text not null,
        created_at text not null
      );
    `);
  }

  private loadRecentActivity(): void {
    const events = this.db.prepare('select at, cell_id, pseudo, action from events order by at desc limit 1000').all() as EventRow[];
    this.events.push(...events.map((event) => ({ at: event.at, cellId: event.cell_id, pseudo: event.pseudo, action: event.action })));
    const alerts = this.db.prepare('select cell_id, pseudo, severity, reason, created_at from alerts order by created_at desc limit 500').all() as AlertRow[];
    this.alerts.push(...alerts.map((alert) => ({ cellId: alert.cell_id, pseudo: alert.pseudo, severity: alert.severity, reason: alert.reason, createdAt: alert.created_at })));
  }

  private loadFound(cellId: string): FoundWord[] {
    const rows = this.db.prepare('select word_id, pseudo, found_at from found_words where cell_id = ? order by found_at asc').all(cellId) as { word_id: string; pseudo: string; found_at: string }[];
    return rows.map((row) => ({ wordId: row.word_id, pseudo: row.pseudo, foundAt: row.found_at }));
  }

  private saveState(state: CellState): void {
    this.db.prepare('update cell_state set started_at = ?, paused = ?, revealed_indexes = ?, transmitted_progress = ?, manual_unlocked = ?, hints_used = ? where cell_id = ?')
      .run(state.startedAt, state.paused ? 1 : 0, JSON.stringify(state.revealedIndexes), JSON.stringify(state.transmittedProgress), JSON.stringify(state.manualUnlocked), state.hintsUsed, state.cellId);
  }
}

function csv(value: string): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}
