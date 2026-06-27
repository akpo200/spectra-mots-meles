import type { Coordinate, PathKind } from '../types.js';

export function buildPath(kind: PathKind, start: Coordinate, length: number): Coordinate[] {
  // Mots mêlés classiques : uniquement des chemins rectilignes (horizontaux, verticaux ou diagonaux dans les 8 directions)
  if (kind === 'horizontal') return line(start, length, 0, 1);
  if (kind === 'horizontalReverse') return line(start, length, 0, -1);
  if (kind === 'vertical') return line(start, length, 1, 0);
  if (kind === 'verticalReverse') return line(start, length, -1, 0);
  if (kind === 'diagonal') return line(start, length, 1, 1);
  if (kind === 'diagonalReverse') return line(start, length, -1, -1);
  if (kind === 'zigzag') return line(start, length, -1, 1); // Diagonale haut-droite
  if (kind === 'serpent') return line(start, length, 1, -1); // Diagonale bas-gauche
  return line(start, length, 0, 1); // Par défaut horizontal
}

function line(start: Coordinate, length: number, dr: number, dc: number): Coordinate[] {
  return Array.from({ length }, (_, i) => ({ row: start.row + dr * i, col: start.col + dc * i }));
}

function zigzag(start: Coordinate, length: number): Coordinate[] {
  return Array.from({ length }, (_, i) => ({ row: start.row + (i % 2 === 0 ? 0 : 1), col: start.col + i }));
}

function serpent(start: Coordinate, length: number): Coordinate[] {
  const width = Math.max(3, Math.ceil(Math.sqrt(length)));
  return Array.from({ length }, (_, i) => {
    const lane = Math.floor(i / width);
    const offset = i % width;
    return { row: start.row + lane, col: start.col + (lane % 2 === 0 ? offset : width - 1 - offset) };
  });
}

function spiral(start: Coordinate, length: number): Coordinate[] {
  const out: Coordinate[] = [{ ...start }];
  let step = 1;
  let row = start.row;
  let col = start.col;
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  while (out.length < length) {
    for (let d = 0; d < dirs.length && out.length < length; d += 1) {
      const [dr, dc] = dirs[d];
      const repeat = d < 2 ? step : step + 1;
      for (let i = 0; i < repeat && out.length < length; i += 1) {
        row += dr;
        col += dc;
        out.push({ row, col });
      }
    }
    step += 2;
  }
  return out;
}

export function inBounds(path: Coordinate[], rows: number, cols: number): boolean {
  return path.every((p) => p.row >= 0 && p.col >= 0 && p.row < rows && p.col < cols);
}
