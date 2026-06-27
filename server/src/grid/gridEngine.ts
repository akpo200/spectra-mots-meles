import type { CellConfig, Coordinate, MissionBundle, Placement } from '../types.js';
import { seededRandom } from '../utils/prng.js';
import { buildPath, inBounds } from './paths.js';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class GridEngine {
  readonly rows: number;
  readonly cols: number;
  readonly placements: Placement[];
  private readonly letters: Uint8Array;

  constructor(private readonly bundle: MissionBundle) {
    this.rows = bundle.mission.grid.rows;
    this.cols = bundle.mission.grid.cols;
    this.letters = new Uint8Array(this.rows * this.cols);
    this.fillNoise();
    this.placements = this.placeWords();
  }

  getTile(cell: CellConfig, state: { found: { wordId: string }[] }, row: number, col: number, height: number, width: number): { lines: string[]; found: boolean[][] } {
    const lines: string[] = [];
    const found: boolean[][] = [];

    // On pré-calcule l'ensemble des index absolus de la grille qui appartiennent à des mots trouvés par cette cellule
    const foundIndices = new Set<number>();
    for (const item of state.found) {
      const placement = this.placements.find((p) => p.wordId === item.wordId);
      if (placement) {
        for (const coord of placement.cells) {
          foundIndices.add(coord.row * this.cols + coord.col);
        }
      }
    }

    for (let r = row; r < Math.min(this.rows, row + height); r += 1) {
      let line = '';
      const foundRow: boolean[] = [];
      for (let c = col; c < Math.min(this.cols, col + width); c += 1) {
        const idx = r * this.cols + c;
        line += this.shiftLetter(this.letterAt(r, c), cell.shift);
        foundRow.push(foundIndices.has(idx));
      }
      lines.push(line);
      found.push(foundRow);
    }
    return { lines, found };
  }

  validateSelection(wordId: string, selected: Coordinate[]): boolean {
    const placement = this.placements.find((item) => item.wordId === wordId);
    if (!placement || selected.length !== placement.cells.length) return false;
    return placement.cells.every((cell, index) => cell.row === selected[index].row && cell.col === selected[index].col);
  }

  private fillNoise(): void {
    const random = seededRandom(`${this.bundle.mission.grid.seed}:noise`);
    for (let i = 0; i < this.letters.length; i += 1) {
      this.letters[i] = Math.floor(random() * alphabet.length);
    }
  }

  private placeWords(): Placement[] {
    const random = seededRandom(`${this.bundle.mission.grid.seed}:words`);
    const occupied = new Map<number, string>();
    const placements: Placement[] = [];

    for (const word of this.bundle.words) {
      let placed: Placement | undefined;
      for (let attempt = 0; attempt < 5000 && !placed; attempt += 1) {
        const start = {
          row: Math.floor(random() * this.rows),
          col: Math.floor(random() * this.cols)
        };
        const cells = buildPath(word.path, start, word.answer.length);
        if (!inBounds(cells, this.rows, this.cols)) continue;
        const conflict = cells.some((cell, index) => {
          const key = this.index(cell.row, cell.col);
          return occupied.has(key) && occupied.get(key) !== word.answer[index];
        });
        if (conflict) continue;
        cells.forEach((cell, index) => {
          const key = this.index(cell.row, cell.col);
          occupied.set(key, word.answer[index]);
          this.letters[key] = alphabet.indexOf(word.answer[index]);
        });
        placed = { wordId: word.id, answer: word.answer, path: word.path, cells };
      }
      if (!placed) throw new Error(`Placement impossible pour ${word.id}`);
      placements.push(placed);
    }
    return placements;
  }

  private letterAt(row: number, col: number): string {
    return alphabet[this.letters[this.index(row, col)]];
  }

  private index(row: number, col: number): number {
    return row * this.cols + col;
  }

  private shiftLetter(letter: string, shift: number): string {
    return letter; // Pas de décalage César pour que le jeu soit 100% en français clair
  }
}
