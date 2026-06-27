import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { io, type Socket } from 'socket.io-client';
import './styles.css';

// Un mot dans la liste (côté gauche)
type WordEntry = {
  id: string;
  letterCount: number;
  category: string;
  definition: string | null;
  startCoord: { row: number; col: number } | null;
  found: boolean;
  foundBy: string | null;
};

// Une pastille de mot trouvé dans le canvas (coordonnées relatives au viewport)
type Segment = {
  wordId: string;
  answer: string;
  path: string;
  cells: { row: number; col: number }[];
};

type Enigma = { id: string; wordId: string; text: string };
type FoundWord = { wordId: string; pseudo: string; foundAt: string };
type SessionState = { found: FoundWord[]; paused: boolean; hintsUsed: number };
type Session = {
  mission: string;
  cellId: string;
  pseudo: string;
  grid: { rows: number; cols: number };
  totalWords: number;
  state: SessionState;
  wordList: WordEntry[];
  enigmas: Enigma[];
  message: string;
  online: string[];
};
type AdminCell = {
  id: string;
  activePlayers: number;
  totalPlayers: number;
  found: number;
  total: number;
  paused: boolean;
  hintsUsed: number;
  lastAction?: { action: string; pseudo: string };
  alerts: { severity: string; reason: string }[];
};
type AdminSummary = {
  cells: AdminCell[];
  alerts: { cellId: string; severity: string; reason: string; createdAt: string }[];
  events: { at: string; cellId: string; pseudo: string; action: string }[];
};

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? 'Erreur SPECTRA');
  }
  return response.json() as Promise<T>;
};

function App() {
  const currentPath = window.location.pathname;
  const pathSegments = currentPath.replace(/\/+$/, '').split('/');
  if (currentPath.startsWith('/directrice')) return <DirectorApp />;
  if (currentPath.startsWith('/play/')) return <PlayerApp linkCode={pathSegments.at(-1) ?? ''} />;
  // Page d'accueil : liste de toutes les cellules disponibles
  if (currentPath === '/' || currentPath === '') return <Home />;
  return <NotFound />;
}

// Composant page d'accueil : affiche la liste des cellules (groupes) disponibles
function Home() {
  const [cells, setCells] = useState<{ id: string; linkCode: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Charger la liste publique des cellules depuis le serveur
    api<{ cells: { id: string; linkCode: string }[] }>('/api/play/cells')
      .then((data) => {
        setCells(data.cells);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main className="briefing">
      <div className="grain" />
      <section className="classified">
        <div className="bars">#####################################</div>
        <h1>SPECTRA<br />OPÉRATION FESTIN — NIVEAU OMEGA</h1>
        <p>Sélectionnez votre cellule pour rejoindre la mission.</p>
        {loading ? (
          <p>Chargement des cellules...</p>
        ) : (
          <div className="home-cells">
            {cells.map((cell) => (
              <a
                key={cell.id}
                className="home-cell-btn"
                href={`/play/${cell.linkCode}`}
              >
                <span className="home-cell-id">{cell.id}</span>
                <span className="home-cell-arrow">▶ REJOINDRE</span>
              </a>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

// Fonction utilitaire pour jouer un bip rétro terminal via Web Audio API
function playTerminalBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(850, ctx.currentTime);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch (e) {
    console.warn('Audio non disponible', e);
  }
}

// Composant pour l'effet de décryptage rétro du message secret
function SecretMessage({ message }: { message: string }) {
  const [display, setDisplay] = useState(message);

  useEffect(() => {
    let iterations = 0;
    const target = message;
    const interval = setInterval(() => {
      setDisplay((current) => {
        return [...target].map((char, index) => {
          if (char === ' ' || char === '-') return char;
          if (current[index] === char) return char;
          if (iterations > 6) return char;
          return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
        }).join('');
      });
      iterations++;
      if (iterations > 7) clearInterval(interval);
    }, 70);
    return () => clearInterval(interval);
  }, [message]);

  return <p className="secret">{display}</p>;
}

function PlayerApp({ linkCode }: { linkCode: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [pseudo, setPseudo] = useState('');
  // Champ mot de passe de la cellule (ex: sigma1)
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [transmission, setTransmission] = useState<{ title: string; body: string } | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const [muted, setMuted] = useState(() => localStorage.getItem('spectra_muted') === 'true');
  const [viewport, setViewport] = useState({ row: 0, col: 0, zoom: 1 });
  const [selection, setSelection] = useState<{ row: number; col: number }[]>([]);
  const [flashActive, setFlashActive] = useState(false);

  const locateWord = (startCoord: { row: number; col: number } | null | undefined) => {
    if (!startCoord) return;
    const wrapper = document.querySelector('.grid-canvas-wrapper');
    if (wrapper) {
      const zoom = viewport.zoom;
      const cellSize = Math.max(10, Math.min(32, 18 * zoom));
      const targetX = startCoord.col * cellSize - wrapper.clientWidth / 2;
      const targetY = startCoord.row * cellSize - wrapper.clientHeight / 2;
      wrapper.scrollTo({
        left: Math.max(0, targetX),
        top: Math.max(0, targetY),
        behavior: 'smooth'
      });
      // Sélectionner temporairement le début du mot pour le mettre en surbrillance
      setSelection([{ row: startCoord.row, col: startCoord.col }]);
      showToast(`Localisation du mot dans la grille.`);
    }
  };

  const prevFoundRef = useRef<FoundWord[]>([]);

  const showToast = (message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const [targetCell, setTargetCell] = useState<{ cellId: string; mission: string } | null>(null);

  useEffect(() => {
    localStorage.setItem('spectra_muted', String(muted));
  }, [muted]);

  useEffect(() => {
    // 1. Récupérer les informations de la cellule liée au linkCode de l'URL
    api<{ cellId: string; mission: string }>(`/api/play/${linkCode}`)
      .then((cellInfo) => {
        setTargetCell(cellInfo);
        
        // 2. Récupérer la session active
        api<Session>('/api/session')
          .then(async (data) => {
            // Si la session ne correspond pas à la cellule demandée par le lien, on déconnecte
            if (data.cellId !== cellInfo.cellId) {
              await api('/api/logout', { method: 'POST' }).catch(() => undefined);
              setSession(null);
            } else {
              setSession(data);
              prevFoundRef.current = data.state.found;
            }
          })
          .catch(() => {
            // Pas de session active, le login s'affichera
            setSession(null);
          });
      })
      .catch(() => undefined);
  }, [linkCode]);

  useEffect(() => {
    if (!session) return;
    const socket: Socket = io({ withCredentials: true, auth: { cellId: session.cellId, pseudo: session.pseudo } });
    
    socket.on('cell:update', (payload: any) => {
      setSession((current) => {
        if (!current) return current;
        
        // Détecter si un nouveau mot a été trouvé par la cellule
        const newFound = payload.state.found as FoundWord[];
        const oldFound = prevFoundRef.current;
        if (newFound.length > oldFound.length) {
          if (!muted) playTerminalBeep();
          
          // Identifier les nouveaux mots trouvés pour afficher un Toast descriptif
          const oldKeys = new Set(oldFound.map(f => f.wordId));
          newFound.forEach((item) => {
            if (!oldKeys.has(item.wordId)) {
              showToast(`Agent ${item.pseudo} a décrypté une énigme !`);
            }
          });
          
          // Déclencher un effet de flash visuel
          setFlashActive(true);
          setTimeout(() => setFlashActive(false), 200);
        }
        prevFoundRef.current = newFound;
        return { ...current, ...payload };
      });
    });

    socket.on('transmission', (t) => {
      setTransmission(t);
      if (!muted) playTerminalBeep();
      showToast(`NOUVELLE TRANSMISSION : ${t.title}`);
    });

    return () => socket.disconnect();
  }, [session?.cellId, session?.pseudo, muted]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const fingerprint = {
        screen: `${window.screen.width}x${window.screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language
      };
      // Envoyer le pseudo ET le mot de passe de la cellule pour authentification
      const nextSession = await api<Session>(`/api/play/${linkCode}/login`, {
        method: 'POST',
        body: JSON.stringify({ pseudo, password, fingerprint })
      });
      setSession(nextSession);
      prevFoundRef.current = nextSession.state.found;
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Acces refuse.');
    }
  }

  async function validate(wordId: string) {
    if (!wordId || selection.length === 0) return;
    try {
      const updated = await api<Session>('/api/validate', {
        method: 'POST',
        body: JSON.stringify({ wordId, selection })
      });
      setSelection([]);
      setSession(updated);
      prevFoundRef.current = updated.state.found;
      
      if (!muted) playTerminalBeep();
      setFlashActive(true);
      setTimeout(() => setFlashActive(false), 200);
      showToast(`Félicitations ! Énigme résolue.`);
    } catch (err: any) {
      showToast(err.message || "Erreur de validation");
    }
  }

  if (!session) {
    return (
      <main className="briefing">
        <div className="grain" />
        <section className="classified">
          <div className="bars">#####################################</div>
          <h1>DOSSIER CLASSIFIE<br />OPERATION FESTIN — NIVEAU OMEGA</h1>
          <p>Une archive SPECTRA a été récupérée dans les décombres du QG de Lomé.</p>
          <p>Les agents doivent retrouver les mots-clés cachés afin de reconstruire le rapport détruit.</p>
          <form onSubmit={login} className="login">
            {/* Champ pseudo agent */}
            <input
              value={pseudo}
              onChange={(event) => setPseudo(event.target.value)}
              placeholder="Pseudo agent (ex: Feyçal)"
              autoFocus
              required
            />
            {/* Champ mot de passe de la cellule */}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Mot de passe cellule (ex: sigma1)"
              required
            />
            <button>COMMENCER LA MISSION</button>
          </form>
          {/* Bouton retour à la liste des cellules */}
          <p style={{ marginTop: '16px', fontSize: '12px' }}>
            <a href="/" style={{ color: '#00ff41', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); window.history.pushState(null, '', '/'); window.dispatchEvent(new Event('popstate')); }}>← Retour à la liste des cellules</a>
          </p>
          {error && <p className="danger">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="game-shell">
      <div className="grain" />
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className="toast">{t.message}</div>
        ))}
      </div>
      <aside className="side-panel">
        <header>
          <span>{session.cellId}</span>
          <strong>{Math.round((session.state.found.length / Math.max(1, session.totalWords)) * 100)}%</strong>
        </header>
        <section>
          <h2>Transmission reconstruite</h2>
          <SecretMessage message={session.message} />
        </section>
        <section>
          <h2>Mots à trouver ({session.wordList.length})</h2>
          <div className="enigmas">
            {/* Trier pour mettre les mots restants à chercher au début de la liste */}
            {[...session.wordList]
              .sort((a, b) => (a.found === b.found ? 0 : a.found ? 1 : -1))
              .map((word) => (
                <WordCard 
                  key={word.id} 
                  word={word} 
                  selectionLength={selection.length} 
                  onLocate={() => locateWord(word.startCoord)}
                  onValidate={validate} 
                />
              ))}
          </div>
        </section>
      </aside>
      <GridCanvas 
        session={session} 
        selection={selection} 
        setSelection={setSelection} 
        viewport={viewport}
        setViewport={setViewport}
        onValidate={validate} 
        flashActive={flashActive} 
      />
      <StatusBar session={session} muted={muted} onToggleMute={() => setMuted(!muted)} />
      {transmission && <TransmissionModal payload={transmission} onClose={() => setTransmission(null)} />}
    </main>
  );
}

function WordCard({ 
  word, 
  selectionLength, 
  onLocate,
  onValidate 
}: { 
  word: WordEntry; 
  selectionLength: number; 
  onLocate: () => void;
  onValidate: (wordId: string) => void; 
}) {
  if (word.found) {
    return (
      <article className="enigma enigma-solved" onClick={onLocate} style={{ cursor: 'pointer' }} title="Cliquez pour localiser dans la grille">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>MOT DÉCRYPTÉ — RÉSOLU</span>
          <span style={{ fontSize: '10px', color: '#81c784', fontWeight: 'bold' }}>✓ PAR {word.foundBy?.toUpperCase() ?? 'SPECTRA'}</span>
        </div>
        <p className="enigma-desc" style={{ fontSize: '14px', margin: '6px 0 0', textDecoration: 'line-through', opacity: 0.7, color: '#81c784' }}>
          {word.definition}
        </p>
      </article>
    );
  }

  // Mot masqué (tirets pour chaque lettre du mot)
  const mask = Array.from({ length: word.letterCount }, () => '_').join(' ');

  return (
    <article className="enigma" draggable onDragStart={(event) => event.dataTransfer.setData('wordId', word.id)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>MOT SPECTRA ({word.letterCount} lettres)</span>
        <span style={{ fontSize: '9px', background: 'rgba(0,255,65,0.1)', padding: '2px 5px', borderRadius: '3px', color: '#00ff41' }}>{word.category}</span>
      </div>
      <p style={{ fontSize: '15px', fontWeight: 'bold', letterSpacing: '0.15em', margin: '6px 0', color: '#fff' }}>
        🔑 {mask}
      </p>
      <p style={{ fontSize: '12px', margin: '4px 0 0', color: '#d0f5d8' }}>{word.definition}</p>
      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        {word.startCoord && (
          <button 
            type="button"
            className="enigma-locate-btn"
            onClick={(e) => {
              e.stopPropagation();
              onLocate();
            }}
          >
            🔎 Localiser
          </button>
        )}
        {selectionLength > 0 && (
          <button 
            className="enigma-validate-btn"
            style={{ marginTop: 0, flex: 1 }}
            onClick={(e) => {
              e.stopPropagation();
              onValidate(word.id);
            }}
          >
            Valider ({selectionLength})
          </button>
        )}
      </div>
    </article>
  );
}

function GridCanvas({ 
  session, 
  selection, 
  setSelection, 
  viewport,
  setViewport,
  onValidate, 
  flashActive 
}: { 
  session: Session; 
  selection: { row: number; col: number }[]; 
  setSelection: React.Dispatch<React.SetStateAction<{ row: number; col: number }[]>>; 
  viewport: { row: number; col: number; zoom: number };
  setViewport: React.Dispatch<React.SetStateAction<{ row: number; col: number; zoom: number }>>;
  onValidate: (wordId: string) => Promise<void>; 
  flashActive: boolean; 
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tile, setTile] = useState<{ lines: string[]; found: boolean[][] }>({ lines: [], found: [] });
  const [segments, setSegments] = useState<Segment[]>([]);
  const drag = useRef<{ x: number; y: number; row: number; col: number } | null>(null);
  const cellSize = Math.max(10, Math.min(32, 18 * viewport.zoom));

  useEffect(() => {
    const height = session.grid.rows;
    const width = session.grid.cols;
    
    // Charger la totalité de la grille (pas de viewport glissant)
    api<{ lines: string[]; found: boolean[][] }>(`/api/grid/tile?row=0&col=0&height=${height}&width=${width}`)
      .then((data) => setTile(data))
      .catch(() => undefined);

    // Charger tous les mots trouvés pour toute la grille
    api<{ segments: Segment[] }>(`/api/grid/word-segments?row=0&col=0&height=${height}&width=${width}`)
      .then((data) => setSegments(data.segments))
      .catch(() => undefined);
  }, [session.grid.rows, session.grid.cols, session.state.found]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !tile.lines || tile.lines.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    // Dimensionner le canvas exactement à la taille de la grille en pixels
    canvas.width = session.grid.cols * cellSize * dpr;
    canvas.height = session.grid.rows * cellSize * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // ── Fond crème style papier ──
    ctx.fillStyle = '#f5f0e8';
    ctx.fillRect(0, 0, session.grid.cols * cellSize, session.grid.rows * cellSize);

    // Légères lignes de grille pour faciliter la lecture
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= session.grid.rows; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * cellSize); ctx.lineTo(session.grid.cols * cellSize, r * cellSize); ctx.stroke();
    }
    for (let c = 0; c <= session.grid.cols; c++) {
      ctx.beginPath(); ctx.moveTo(c * cellSize, 0); ctx.lineTo(c * cellSize, session.grid.rows * cellSize); ctx.stroke();
    }

    // ── ÉTAPE 1 : DESSINER LES PASTILLES DE TOUS LES MOTS TROUVÉS ──
    segments.forEach((segment) => {
      if (segment.cells.length === 0) return;

      // Palette de couleurs translucides variées (Cyan, Rose, Vert, Orange, Violet, Bleu)
      const colors = [
        { fill: 'rgba(0, 188, 212, 0.25)', stroke: 'rgba(0, 188, 212, 0.65)' }, // Cyan
        { fill: 'rgba(233, 30, 99, 0.22)', stroke: 'rgba(233, 30, 99, 0.6)' },   // Rose
        { fill: 'rgba(76, 175, 80, 0.25)', stroke: 'rgba(76, 175, 80, 0.65)' },  // Vert
        { fill: 'rgba(255, 152, 0, 0.25)', stroke: 'rgba(255, 152, 0, 0.65)' },  // Orange/Jaune
        { fill: 'rgba(156, 39, 176, 0.22)', stroke: 'rgba(156, 39, 176, 0.6)' }, // Violet
        { fill: 'rgba(33, 150, 243, 0.25)', stroke: 'rgba(33, 150, 243, 0.65)' } // Bleu
      ];
      // Hasher le wordId pour avoir une couleur constante par mot
      const colorIdx = Math.abs(segment.wordId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
      const palette = colors[colorIdx];

      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 1. Tracer la bordure de la pilule
      ctx.lineWidth = cellSize * 0.86;
      ctx.strokeStyle = palette.stroke;
      const first = segment.cells[0];
      ctx.moveTo(first.col * cellSize + cellSize / 2, first.row * cellSize + cellSize / 2);
      for (let i = 1; i < segment.cells.length; i++) {
        const c = segment.cells[i];
        ctx.lineTo(c.col * cellSize + cellSize / 2, c.row * cellSize + cellSize / 2);
      }
      ctx.stroke();

      // 2. Remplir l'intérieur (effet pastille)
      ctx.beginPath();
      ctx.lineWidth = cellSize * 0.74;
      ctx.strokeStyle = palette.fill;
      ctx.moveTo(first.col * cellSize + cellSize / 2, first.row * cellSize + cellSize / 2);
      for (let i = 1; i < segment.cells.length; i++) {
        const c = segment.cells[i];
        ctx.lineTo(c.col * cellSize + cellSize / 2, c.row * cellSize + cellSize / 2);
      }
      ctx.stroke();
    });

    // ── ÉTAPE 2 : DESSINER LES LETTRES ET LA SÉLECTION ACTUELLE ──
    ctx.font = `bold ${Math.max(10, cellSize - 4)}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';

    for (let r = 0; r < tile.lines.length; r += 1) {
      const line = tile.lines[r];
      for (let c = 0; c < line.length; c += 1) {
        const absolute = { row: r, col: c };
        const selected = selection.some((point) => point.row === absolute.row && point.col === absolute.col);

        // Si sélectionné par l'utilisateur courant (bleu vif transparent)
        if (selected) {
          ctx.fillStyle = 'rgba(25, 118, 210, 0.4)';
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
          ctx.fillStyle = '#1565c0'; // Texte bleu foncé sur fond sélection
        } else {
          ctx.fillStyle = '#111122'; // Texte noir/anthracite très lisible
        }

        // Centrer précisément la lettre au milieu de sa cellule
        const char = line[c];
        const charWidth = ctx.measureText(char).width;
        const textHeight = cellSize - 4;
        const xOffset = (cellSize - charWidth) / 2;
        const yOffset = (cellSize - textHeight) / 2;

        ctx.fillText(char, c * cellSize + xOffset, r * cellSize + yOffset);
      }
    }

    // Flash de validation
    if (flashActive) {
      ctx.fillStyle = 'rgba(76, 175, 80, 0.18)';
      ctx.fillRect(0, 0, session.grid.cols * cellSize, session.grid.rows * cellSize);
    }
  }, [cellSize, selection, tile, segments, session.grid.rows, session.grid.cols, flashActive]);

  // Référence vers le point de départ de la sélection (row/col absolus)
  const selStart = useRef<{ row: number; col: number } | null>(null);

  // Calcule la sélection en ligne droite entre un point de départ et un point courant
  // Direction snap : horizontal, vertical, ou diagonale (8 directions possibles)
  function computeStraightLine(startRow: number, startCol: number, endRow: number, endCol: number): { row: number; col: number }[] {
    const dr = endRow - startRow;
    const dc = endCol - startCol;

    if (dr === 0 && dc === 0) return [{ row: startRow, col: startCol }];

    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);

    // Seuil de 0.41 = tan(22.5°) : zone de snap vers la direction la plus proche
    let snapR: number, snapC: number;
    if (absDr < 0.41 * absDc) {
      // Horizontal
      snapR = 0;
      snapC = dc > 0 ? 1 : -1;
    } else if (absDc < 0.41 * absDr) {
      // Vertical
      snapR = dr > 0 ? 1 : -1;
      snapC = 0;
    } else {
      // Diagonale (45°)
      snapR = dr >= 0 ? 1 : -1;
      snapC = dc >= 0 ? 1 : -1;
    }

    const length = Math.max(absDr, absDc) + 1;
    return Array.from({ length }, (_, i) => ({
      row: startRow + snapR * i,
      col: startCol + snapC * i,
    }));
  }

  // Palette de couleurs pour générer le crayon de l'agent
  const colors = ['#00bcd4', '#e91e63', '#4caf50', '#ff9800', '#9c27b0', '#2196f3'];
  const colorIdx = Math.abs(session.pseudo.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
  const agentColor = colors[colorIdx];

  // SVG de crayon (pencil) pointant vers le bas-gauche avec la couleur de l'agent
  const pencilSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="${encodeURIComponent(agentColor)}" stroke="white" stroke-width="1.5"/>
    </svg>
  `;
  const cursorStyle = `url("data:image/svg+xml;utf8,${pencilSvg.trim()}") 0 24, crosshair`;

  return (
    <section
      className="grid-area"
      onDrop={(event) => {
        event.preventDefault();
        onValidate(event.dataTransfer.getData('wordId')).catch(() => undefined);
      }}
      onDragOver={(event) => event.preventDefault()}
    >
      {/* Grand rectangle d'encadrement de la grille avec titre au-dessus */}
      <div className="grid-frame-container">
        <div className="grid-frame-header">
          <span className="grid-frame-title">▲ MOTS MÊLÉS SPECTRA ▲</span>
          <span className="grid-frame-hint">Glissez-déposez ou validez pour décrypter</span>
        </div>
        <div className="grid-canvas-wrapper">
          <canvas
            ref={canvasRef}
            style={{ 
              width: `${session.grid.cols * cellSize}px`, 
              height: `${session.grid.rows * cellSize}px`, 
              flexShrink: 0,
              cursor: cursorStyle
            }}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => {
              // Capturer le canvas pour le suivi hors limite
              (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
              const rect = event.currentTarget.getBoundingClientRect();
              const startRow = Math.floor((event.clientY - rect.top) / cellSize);
              const startCol = Math.floor((event.clientX - rect.left) / cellSize);
              drag.current = { x: event.clientX, y: event.clientY, row: 0, col: 0 };
              // Mémoriser le point de départ de la sélection
              selStart.current = { row: startRow, col: startCol };
              setSelection([{ row: startRow, col: startCol }]);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              if (!selStart.current) return;
              // Calculer la cellule courante sous le pointeur
              const rect = event.currentTarget.getBoundingClientRect();
              const curRow = Math.floor((event.clientY - rect.top) / cellSize);
              const curCol = Math.floor((event.clientX - rect.left) / cellSize);
              // Générer les cellules en ligne droite depuis l'origine de sélection
              const line = computeStraightLine(selStart.current.row, selStart.current.col, curRow, curCol);
              setSelection(line);
            }}
            onPointerUp={() => {
              drag.current = null;
              selStart.current = null;
              api('/api/selection', { method: 'POST', body: JSON.stringify({ count: selection.length }) }).catch(() => undefined);
            }}
            onWheel={(event) => {
              event.preventDefault();
              setViewport((current) => ({ ...current, zoom: clampFloat(current.zoom + (event.deltaY > 0 ? -0.1 : 0.1), 0.7, 1.8) }));
            }}
          />
        </div>
      </div>
      {/* Coordonnées courantes */}
      <div className="coords">Grille : {session.grid.rows}x{session.grid.cols} · {selection.length} sélectionné{selection.length > 1 ? 's' : ''}</div>
      {session.state.paused && <div className="pause">⏸ CELLULE EN PAUSE</div>}
    </section>
  );
}

function StatusBar({ session, muted, onToggleMute }: { session: Session; muted: boolean; onToggleMute: () => void }) {
  return (
    <footer className="status">
      <span>Agent {session.pseudo} | {session.state.found.length} / {session.totalWords} mots trouvés | {session.online.length} connectés | indices {session.state.hintsUsed}</span>
      <button className="sound-toggle" onClick={onToggleMute} title={muted ? 'Activer le son' : 'Désactiver le son'}>
        {muted ? '🔈 MUTED' : '🔊 SOUND'}
      </button>
    </footer>
  );
}

function TransmissionModal({ payload, onClose }: { payload: { title: string; body: string }; onClose: () => void }) {
  return (
    <div className="modal">
      <div className="transmission">
        <h2>{payload.title}</h2>
        <p>{payload.body}</p>
        <button onClick={onClose}>ACCUSER RECEPTION</button>
      </div>
    </div>
  );
}

function DirectorApp() {
  const [password, setPassword] = useState('');
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [credentials, setCredentials] = useState<{
    id: string;
    linkCode: string;
    password: string;
    members: string[];
    connectedNow: string[];
    found: number;
    total: number;
  }[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<AdminSummary>('/api/admin/summary').then(setSummary).catch(() => undefined);
    const socket = io({ withCredentials: true });
    socket.on('admin:update', setSummary);
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    if (summary) {
      api<{ credentials: typeof credentials }>('/api/admin/credentials')
        .then((data) => setCredentials(data.credentials))
        .catch(() => undefined);
    }
  }, [summary]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      setSummary(await api<AdminSummary>('/api/admin/summary'));
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Acces refuse.');
    }
  }

  if (!summary) {
    return (
      <main className="briefing">
        <form className="classified login" onSubmit={login}>
          <h1>SPECTRA - TABLEAU DE COMMANDEMENT</h1>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mot de passe Directrice" />
          <button>OUVRIR LE POSTE</button>
          {error && <p className="danger">{error}</p>}
        </form>
      </main>
    );
  }

  const found = summary.cells.reduce((sum, cell) => sum + cell.found, 0);
  const total = summary.cells.reduce((sum, cell) => sum + cell.total, 0);
  return (
    <main className="director">
      <header>
        <h1>SPECTRA - TABLEAU DE COMMANDEMENT</h1>
        <p>Cellules actives : {summary.cells.filter((cell) => cell.activePlayers > 0).length} / {summary.cells.length} | Joueurs connectes : {summary.cells.reduce((sum, cell) => sum + cell.activePlayers, 0)} | Mots trouves total : {found} / {total}</p>
      </header>
      
      {/* NOUVEAU TABLEAU D'IDENTIFIANTS ET CONNEXIONS ADMIN EN DIRECT */}
      <section className="classified-credentials" style={{ marginTop: '20px', border: '2px solid #1a3a1a', background: '#0d120d', padding: '16px', borderRadius: '6px', overflowX: 'auto' }}>
        <h2 style={{ color: '#00ff41', fontFamily: 'monospace', fontSize: '15px', borderBottom: '1px solid #1a3a1a', paddingBottom: '8px', margin: '0 0 12px 0' }}>▲ IDENTIFIANTS DES CELLULES & ÉTAT DE CONNEXION ▲</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff', fontSize: '12px', fontFamily: 'monospace', minWidth: '700px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #1a3a1a', textAlign: 'left', color: '#7de890' }}>
              <th style={{ padding: '6px 8px' }}>Cellule</th>
              <th style={{ padding: '6px 8px' }}>Lien de jeu</th>
              <th style={{ padding: '6px 8px' }}>Mot de passe</th>
              <th style={{ padding: '6px 8px' }}>Membres autorisés</th>
              <th style={{ padding: '6px 8px' }}>Joueurs en ligne (direct)</th>
              <th style={{ padding: '6px 8px' }}>Mots décryptés</th>
            </tr>
          </thead>
          <tbody>
            {credentials.map((cred) => (
              <tr key={cred.id} style={{ borderBottom: '1px solid #1a3a1a' }}>
                <td style={{ padding: '8px', fontWeight: 'bold', color: '#00ff41' }}>{cred.id}</td>
                <td style={{ padding: '8px' }}>
                  <a href={`/play/${cred.linkCode}`} target="_blank" rel="noreferrer" style={{ color: '#7de890', textDecoration: 'underline' }}>
                    /play/{cred.linkCode}
                  </a>
                </td>
                <td style={{ padding: '8px', color: '#ffd54f' }}>{cred.password}</td>
                <td style={{ padding: '8px', opacity: 0.8 }}>{cred.members.join(', ')}</td>
                <td style={{ padding: '8px' }}>
                  {cred.connectedNow.length > 0 ? (
                    cred.connectedNow.map((p) => (
                      <span key={p} style={{ background: 'rgba(0, 255, 65, 0.15)', color: '#00ff41', border: '1px solid #00ff41', padding: '1px 5px', borderRadius: '3px', marginRight: '4px', fontSize: '10px', display: 'inline-block' }}>
                        ● {p}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: '#ff5252', opacity: 0.5 }}>Hors ligne</span>
                  )}
                </td>
                <td style={{ padding: '8px' }}>{cred.found} / {cred.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ManualDirectorControls cells={summary.cells.map((cell) => cell.id)} />
      <section className="cell-grid" style={{ marginTop: '20px' }}>
        {summary.cells.map((cell) => <DirectorCell key={cell.id} cell={cell} />)}
      </section>
      <section className="event-log">
        <h2>Journal d'evenements</h2>
        {summary.events.map((event) => <p key={`${event.at}-${event.action}`}><time>{new Date(event.at).toLocaleTimeString()}</time>{event.cellId} | {event.pseudo} | {event.action}</p>)}
      </section>
    </main>
  );
}

function ManualDirectorControls({ cells }: { cells: string[] }) {
  const [cellId, setCellId] = useState('all');
  const [message, setMessage] = useState('');
  const [enigmaId, setEnigmaId] = useState('');

  async function sendTransmission() {
    if (!message.trim()) return;
    await api('/api/admin/transmissions', { method: 'POST', body: JSON.stringify({ cellId, title: 'TRANSMISSION DIRECTRICE', body: message }) });
    setMessage('');
  }

  async function sendHint() {
    if (!message.trim() || cellId === 'all') return;
    await api(`/api/admin/cells/${cellId}/hint`, { method: 'POST', body: JSON.stringify({ body: message }) });
    setMessage('');
  }

  async function unlockEnigma() {
    if (!enigmaId.trim() || cellId === 'all') return;
    await api(`/api/admin/cells/${cellId}/unlock`, { method: 'POST', body: JSON.stringify({ enigmaId }) });
    setEnigmaId('');
  }

  return (
    <section className="director-tools">
      <select value={cellId} onChange={(event) => setCellId(event.target.value)}>
        <option value="all">Toutes les cellules</option>
        {cells.map((id) => <option key={id} value={id}>{id}</option>)}
      </select>
      <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Transmission ou indice" />
      <button onClick={() => sendTransmission().catch(() => undefined)}>TRANSMETTRE</button>
      <button onClick={() => sendHint().catch(() => undefined)}>INDICE</button>
      <input value={enigmaId} onChange={(event) => setEnigmaId(event.target.value)} placeholder="ID enigme ex: e-fragment-031" />
      <button onClick={() => unlockEnigma().catch(() => undefined)}>DEBLOQUER</button>
      <button onClick={() => { window.location.href = '/api/admin/export.csv'; }}>EXPORT CSV</button>
    </section>
  );
}

function DirectorCell({ cell }: { cell: AdminCell }) {
  const percent = Math.round((cell.found / Math.max(1, cell.total)) * 100);

  async function pause(paused: boolean) {
    await api(`/api/admin/cells/${cell.id}/pause`, { method: 'POST', body: JSON.stringify({ paused }) });
  }

  async function resetCell() {
    if (!window.confirm(`Reinitialiser ${cell.id} ?`)) return;
    await api(`/api/admin/cells/${cell.id}/reset`, { method: 'POST' });
  }

  return (
    <article className="director-cell">
      <header><strong>{cell.id}</strong><span>{percent}%</span></header>
      <div className="progress"><span style={{ width: `${percent}%` }} /></div>
      <p>Joueurs : {cell.activePlayers} / {cell.totalPlayers}</p>
      <p>Mots trouves : {cell.found} / {cell.total}</p>
      <p>Indices utilises : {cell.hintsUsed}</p>
      <p>Derniere action : {cell.lastAction ? `${cell.lastAction.pseudo} | ${cell.lastAction.action}` : 'aucune'}</p>
      <p>Alertes : {cell.alerts.length ? cell.alerts.map((alert) => alert.reason).join(', ') : 'RAS'}</p>
      <div className="director-actions">
        <button onClick={() => pause(!cell.paused).catch(() => undefined)}>{cell.paused ? 'RELANCER' : 'PAUSE'}</button>
        <button onClick={() => resetCell().catch(() => undefined)}>RESET</button>
      </div>
    </article>
  );
}

function NotFound() {
  return <main className="briefing"><section className="classified"><h1>404</h1><p>Ressource introuvable.</p></section></main>;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function clampFloat(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}

createRoot(document.getElementById('root')!).render(<App />);
