import type { AntiCheatEvent, MissionBundle } from '../types.js';
import type { MemoryStore } from '../storage/memoryStore.js';

const scriptAgents = [/curl/i, /python/i, /bot/i, /httpie/i, /wget/i];

export class AntiCheat {
  private validations = new Map<string, number[]>();
  private selections = new Map<string, number[]>();
  private ips = new Map<string, Set<string>>();

  constructor(private readonly bundle: MissionBundle, private readonly store: MemoryStore) {}

  recordRequest(cellId: string, pseudo: string, ip: string, userAgent = ''): void {
    const cells = this.ips.get(ip) ?? new Set<string>();
    cells.add(cellId);
    this.ips.set(ip, cells);
    if (cells.size > 1) this.alert(cellId, pseudo, 'yellow', 'Même IP observée sur plusieurs cellules');
    if (scriptAgents.some((pattern) => pattern.test(userAgent))) this.alert(cellId, pseudo, 'red', 'User-Agent de script détecté');
  }

  recordSelection(cellId: string, pseudo: string, count = 1): void {
    const key = `${cellId}:${pseudo}`;
    const now = Date.now();
    const values = [...(this.selections.get(key) ?? []), ...Array.from({ length: count }, () => now)].filter((t) => now - t < 1000);
    this.selections.set(key, values);
    if (values.length > this.bundle.mission.antiCheat.selectionsPerSecondRed) {
      this.store.getCell(cellId).paused = true;
      this.alert(cellId, pseudo, 'red', 'Plus de 30 sélections par seconde');
    }
  }

  recordValidation(cellId: string, pseudo: string): void {
    const key = `${cellId}:${pseudo}`;
    const now = Date.now();
    const values = [...(this.validations.get(key) ?? []), now].filter((t) => now - t < 60_000);
    const previous = values.at(-2);
    this.validations.set(key, values);
    if (values.length > this.bundle.mission.antiCheat.validationsPerMinuteYellow) this.alert(cellId, pseudo, 'yellow', 'Plus de 10 validations par minute');
    if (previous && now - previous < this.bundle.mission.antiCheat.tooFastValidationSeconds * 1000) this.alert(cellId, pseudo, 'yellow', 'Mots trouvés trop rapides');
    if (values.length >= 50 && now - values[0] < this.bundle.mission.antiCheat.fiftyWordsMinutesRed * 60_000) this.alert(cellId, pseudo, 'red', '50 mots trouvés en moins de 5 minutes');
  }

  private alert(cellId: string, pseudo: string, severity: AntiCheatEvent['severity'], reason: string): void {
    this.store.alert({ cellId, pseudo, severity, reason, createdAt: new Date().toISOString() });
  }
}
