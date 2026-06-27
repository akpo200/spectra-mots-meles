import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMission } from './mission/loadMission.js';
import { GridEngine } from './grid/gridEngine.js';
import { MemoryStore } from './storage/memoryStore.js';
import { AntiCheat } from './security/antiCheat.js';
import { clearSessionCookie, requireAdmin, requireSession, setSessionCookie, signSession, verifyAdminPassword } from './security/auth.js';
import { dependenciesMet, reconstructedMessage, unlockedEnigmas } from './game/progression.js';
import { adminSummary, createRealtime, emitCell } from './realtime.js';
import type { Coordinate, PlayerSession } from './types.js';

const bundle = loadMission();
const grid = new GridEngine(bundle);
const store = new MemoryStore();
const antiCheat = new AntiCheat(bundle, store);

// Simuler le jeu pour CYCY-4 en pré-validant tous les mots (les 120 mots) au lancement
try {
  store.resetCell('CYCY-4');
  bundle.words.forEach((word) => {
    store.markFound('CYCY-4', word.id, 'Cycy', word.reveal);
  });
  console.log('CYCY-4 pré-validé à 100% pour le test.');
} catch (e) {
  console.error('Erreur lors du préchargement de CYCY-4:', e);
}

const app = express();
const server = http.createServer(app);
const io = createRealtime(server, bundle, store);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: clientOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '64kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, mission: bundle.mission.title, grid: { rows: grid.rows, cols: grid.cols } });
});

// Route publique : retourne la liste des cellules (sans CYCY-4 qui est la cellule de test interne)
app.get('/api/play/cells', (_req, res) => {
  const cells = bundle.cells
    .filter((c) => c.id !== 'CYCY-4') // Masquer la cellule de test à l'accueil
    .map((c) => ({ id: c.id, linkCode: c.linkCode }));
  res.json({ cells });
});

app.get('/api/play/:code', (req, res) => {
  const cell = bundle.cells.find((item) => item.linkCode === req.params.code);
  if (!cell) {
    res.status(404).json({ error: 'Ressource introuvable.' });
    return;
  }
  res.json({ mission: bundle.mission.title, linkCode: cell.linkCode, membersCount: cell.members.length, theme: bundle.theme });
});

app.post('/api/play/:code/login', (req, res) => {
  const pseudo = String(req.body?.pseudo ?? '').trim();
  const password = String(req.body?.password ?? '').trim();
  const fingerprint = req.body?.fingerprint ?? {};

  // Trouver la cellule par son linkCode
  const cell = bundle.cells.find((item) => item.linkCode === req.params.code);

  // Vérifier que la cellule existe et que le pseudo appartient à cette cellule
  if (!cell || !cell.members.some((member) => normalize(member) === normalize(pseudo))) {
    res.status(403).json({ error: 'Acces refuse.' });
    return;
  }

  // Vérifier le mot de passe de la cellule
  if (cell.password !== password) {
    res.status(403).json({ error: 'Mot de passe incorrect.' });
    return;
  }

  // Anti-triche : limiter à 6 connexions simultanées maximum par cellule
  // Exception : si ce pseudo est déjà dans la liste des connectés (reconnexion)
  const currentOnline = store.online.get(cell.id) ?? new Map<string, number>();
  const isAlreadyConnected = currentOnline.has(pseudo);
  const maxPlayers = 6; // Maximum 6 joueurs simultanés
  if (!isAlreadyConnected && currentOnline.size >= maxPlayers) {
    antiCheat.recordRequest(cell.id, pseudo, req.ip ?? 'unknown', req.get('user-agent'));
    store.log(cell.id, pseudo, `Connexion refusee : limite de ${maxPlayers} joueurs simultanes atteinte`);
    res.status(429).json({ error: `Limite de ${maxPlayers} joueurs simultanes atteinte pour cette cellule.` });
    return;
  }

  const token = signSession({ missionId: bundle.mission.missionId, cellId: cell.id, pseudo, role: 'player' }, bundle.mission.jwt.accessTokenTtlSeconds);
  setSessionCookie(res, token);
  store.log(cell.id, pseudo, `Connexion (${JSON.stringify(fingerprint).slice(0, 180)})`);
  antiCheat.recordRequest(cell.id, pseudo, req.ip ?? 'unknown', req.get('user-agent'));
  emitCell(io, bundle, store, cell.id);
  res.json(sessionPayload(cell.id, pseudo));
});

app.post('/api/logout', requireSession, (req, res) => {
  const session = res.locals.session as PlayerSession;
  store.log(session.cellId, session.pseudo, 'Deconnexion');
  clearSessionCookie(res);
  emitCell(io, bundle, store, session.cellId);
  res.json({ ok: true });
});

app.get('/api/session', requireSession, (_req, res) => {
  const session = res.locals.session as PlayerSession;
  if (session.role === 'admin') {
    res.json({ role: 'admin' });
    return;
  }
  res.json(sessionPayload(session.cellId, session.pseudo));
});

app.get('/api/grid/tile', requireSession, (req, res) => {
  const session = res.locals.session as PlayerSession;
  const cell = bundle.cells.find((item) => item.id === session.cellId);
  if (!cell) {
    res.status(403).json({ error: 'Acces refuse.' });
    return;
  }
  const row = clamp(Number(req.query.row ?? 0), 0, grid.rows - 1);
  const col = clamp(Number(req.query.col ?? 0), 0, grid.cols - 1);
  const height = clamp(Number(req.query.height ?? 40), 1, 80);
  const width = clamp(Number(req.query.width ?? 60), 1, 120);
  antiCheat.recordRequest(cell.id, session.pseudo, req.ip ?? 'unknown', req.get('user-agent'));
  const state = store.getCell(cell.id);
  const tileResult = grid.getTile(cell, state, row, col, height, width);
  res.json({ row, col, height, width, lines: tileResult.lines, found: tileResult.found });
});

// Renvoie les coordonnées exactes (début/fin) de chaque mot dans le viewport pour le dessin des pastilles
app.get('/api/grid/word-segments', requireSession, (req, res) => {
  const session = res.locals.session as PlayerSession;
  const cell = bundle.cells.find((item) => item.id === session.cellId);
  if (!cell) { res.status(403).json({ error: 'Acces refuse.' }); return; }
  const state = store.getCell(cell.id);
  const foundWordIds = new Set(state.found.map((f) => f.wordId));
  const vRow = clamp(Number(req.query.row ?? 0), 0, grid.rows - 1);
  const vCol = clamp(Number(req.query.col ?? 0), 0, grid.cols - 1);
  const vHeight = clamp(Number(req.query.height ?? 40), 1, 80);
  const vWidth = clamp(Number(req.query.width ?? 60), 1, 120);

  // Pour chaque mot trouvé, renvoyer les coords de TOUTES ses cellules dans le viewport
  const segments = grid.placements
    .filter((p) => foundWordIds.has(p.wordId))
    .map((p) => {
      const cells = p.cells
        .map((coord) => ({ row: coord.row - vRow, col: coord.col - vCol }))
        .filter((c) => c.row >= 0 && c.col >= 0 && c.row < vHeight && c.col < vWidth);
      return { wordId: p.wordId, path: p.path, cells };
    })
    .filter((s) => s.cells.length > 0);

  res.json({ segments });
});

app.post('/api/selection', requireSession, (req, res) => {
  const session = res.locals.session as PlayerSession;
  antiCheat.recordSelection(session.cellId, session.pseudo, Number(req.body?.count ?? 1));
  emitCell(io, bundle, store, session.cellId);
  res.json({ ok: true });
});

app.post('/api/validate', requireSession, (req, res) => {
  const session = res.locals.session as PlayerSession;
  const state = store.getCell(session.cellId);
  if (state.paused) {
    res.status(423).json({ error: 'Cellule en pause.' });
    return;
  }
  const wordId = String(req.body?.wordId ?? '');
  const selection = (req.body?.selection ?? []) as Coordinate[];
  const word = bundle.words.find((item) => item.id === wordId);
  if (!word) {
    store.log(session.cellId, session.pseudo, 'Tentative invalide : mot inconnu');
    res.status(400).json({ error: 'Validation refusee.' });
    return;
  }
  if (!dependenciesMet(word, state)) {
    store.log(session.cellId, session.pseudo, `Tentative invalide : ${word.id} (dependance non resolue)`);
    res.status(409).json({ error: 'Conditions non reunies.' });
    return;
  }
  if (!grid.validateSelection(wordId, selection)) {
    store.log(session.cellId, session.pseudo, `Tentative invalide : ${word.id}`);
    res.status(400).json({ error: 'Validation refusee.' });
    return;
  }
  store.markFound(session.cellId, wordId, session.pseudo, word.reveal);
  antiCheat.recordValidation(session.cellId, session.pseudo);
  triggerAutomaticTransmissions(session.cellId);
  emitCell(io, bundle, store, session.cellId);
  res.json(sessionPayload(session.cellId, session.pseudo));
});

app.post('/api/admin/login', async (req, res) => {
  if (!(await verifyAdminPassword(String(req.body?.password ?? '')))) {
    res.status(403).json({ error: 'Acces refuse.' });
    return;
  }
  const token = signSession({ missionId: bundle.mission.missionId, cellId: 'DIRECTRICE', pseudo: 'Directrice', role: 'admin' }, bundle.mission.jwt.accessTokenTtlSeconds);
  setSessionCookie(res, token);
  res.json({ ok: true });
});

app.get('/api/admin/summary', requireAdmin, (_req, res) => {
  res.json(adminSummary(bundle, store));
});

app.post('/api/admin/cells/:cellId/pause', requireAdmin, (req, res) => {
  const cellId = routeParam(req.params.cellId);
  const state = store.getCell(cellId);
  state.paused = Boolean(req.body?.paused);
  store.log(cellId, 'Directrice', state.paused ? 'Cellule mise en pause' : 'Cellule relancee');
  emitCell(io, bundle, store, cellId);
  res.json({ ok: true });
});

app.post('/api/admin/cells/:cellId/reset', requireAdmin, (req, res) => {
  const cellId = routeParam(req.params.cellId);
  store.resetCell(cellId);
  emitCell(io, bundle, store, cellId);
  res.json({ ok: true });
});

app.post('/api/admin/cells/:cellId/unlock', requireAdmin, (req, res) => {
  const cellId = routeParam(req.params.cellId);
  const enigmaId = String(req.body?.enigmaId ?? '');
  if (!bundle.enigmas.some((enigma) => enigma.id === enigmaId)) {
    res.status(400).json({ error: 'Enigme inconnue.' });
    return;
  }
  store.unlockEnigma(cellId, enigmaId);
  emitCell(io, bundle, store, cellId);
  res.json({ ok: true });
});

app.post('/api/admin/cells/:cellId/hint', requireAdmin, (req, res) => {
  const cellId = routeParam(req.params.cellId);
  const body = String(req.body?.body ?? '').trim();
  if (!body) {
    res.status(400).json({ error: 'Indice vide.' });
    return;
  }
  store.grantHint(cellId, body);
  io.to(`cell:${cellId}`).emit('transmission', { title: 'INDICE SPECTRA - MARCHE NOIR', body });
  emitCell(io, bundle, store, cellId);
  res.json({ ok: true });
});

app.get('/api/admin/export.csv', requireAdmin, (_req, res) => {
  res.header('Content-Type', 'text/csv; charset=utf-8');
  res.header('Content-Disposition', 'attachment; filename="spectra-resultats.csv"');
  res.send(store.exportCsv());
});

// Endpoint admin : identifiants et mots de passe de chaque cellule + joueurs connectés en direct
app.get('/api/admin/credentials', requireAdmin, (_req, res) => {
  const credentials = bundle.cells.map((cell) => {
    const onlineMap = store.online.get(cell.id) ?? new Map<string, number>();
    const state = store.getCell(cell.id);
    return {
      id: cell.id,
      linkCode: cell.linkCode,
      password: cell.password,
      members: cell.members,
      connectedNow: Array.from(onlineMap.keys()),
      found: state.found.length,
      total: bundle.words.length,
    };
  });
  res.json({ credentials });
});

app.post('/api/admin/transmissions', requireAdmin, (req, res) => {
  const target = String(req.body?.cellId ?? 'all');
  const payload = { title: String(req.body?.title ?? 'TRANSMISSION DIRECTRICE'), body: String(req.body?.body ?? '') };
  if (target === 'all') {
    bundle.cells.forEach((cell) => io.to(`cell:${cell.id}`).emit('transmission', payload));
  } else {
    io.to(`cell:${target}`).emit('transmission', payload);
  }
  store.log(target, 'Directrice', 'Transmission manuelle envoyee');
  res.json({ ok: true });
});

if (process.env.NODE_ENV === 'production') {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
  app.use(express.static(root));
  app.get('*', (_req, res) => res.sendFile(path.join(root, 'index.html')));
}

const port = Number(process.env.PORT ?? 4100);
server.listen(port, () => {
  console.log(`SPECTRA actif sur http://localhost:${port}`);
});

function sessionPayload(cellId: string, pseudo: string) {
  const state = store.getCell(cellId);
  // Joindre les mots avec leurs enigmes pour le panneau de gauche
  // IMPORTANT : ne jamais envoyer word.answer pour éviter la triche
  const wordList = bundle.words.map(word => {
    const enigma = bundle.enigmas.find(e => e.wordId === word.id);
    const placement = grid.placements.find((p) => p.wordId === word.id);
    const isFound = state.found.some(f => f.wordId === word.id);
    const foundInfo = state.found.find(f => f.wordId === word.id);
    return {
      id: word.id,
      letterCount: word.answer.length, // Nombre de lettres (mais jamais le mot lui-même)
      category: word.category,
      definition: enigma?.text ?? null,
      startCoord: (isFound && placement) ? placement.cells[0] : null,
      found: isFound,
      foundBy: foundInfo?.pseudo ?? null, // Qui a trouvé ce mot
    };
  });
  return {
    mission: bundle.mission.title,
    cellId,
    pseudo,
    grid: { rows: grid.rows, cols: grid.cols },
    totalWords: bundle.words.length,
    state,
    wordList,
    enigmas: bundle.enigmas,
    message: reconstructedMessage(bundle, state),
    online: Array.from(store.online.get(cellId)?.keys() ?? [])
  };
}

function triggerAutomaticTransmissions(cellId: string): void {
  const state = store.getCell(cellId);
  const progress = Math.floor((state.found.length / bundle.words.length) * 100);
  for (const transmission of bundle.transmissions.automatic) {
    if (progress >= transmission.progress && !state.transmittedProgress.includes(transmission.progress)) {
      state.transmittedProgress.push(transmission.progress);
      io.to(`cell:${cellId}`).emit('transmission', transmission);
      store.log(cellId, 'SPECTRA', `Transmission envoyee (${transmission.progress}%)`);
    }
  }
}

function normalize(value: string): string {
  return value.normalize('NFKD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}
