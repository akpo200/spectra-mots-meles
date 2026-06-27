import { describe, expect, it } from 'vitest';
import { loadMission } from '../mission/loadMission.js';
import { GridEngine } from './gridEngine.js';

describe('GridEngine', () => {
  it('place et valide tous les mots par coordonnées serveur', () => {
    const bundle = loadMission('operation-festin');
    const grid = new GridEngine(bundle);

    for (const placement of grid.placements) {
      expect(grid.validateSelection(placement.wordId, placement.cells)).toBe(true);
      expect(grid.validateSelection(placement.wordId, [...placement.cells].reverse())).toBe(placement.cells.length === 1);
    }
  });

  it('applique le décalage alphabétique par cellule', () => {
    const bundle = loadMission('operation-festin');
    const grid = new GridEngine(bundle);
    const sigma = bundle.cells.find((cell) => cell.id === 'SIGMA-1')!;
    const alpha = bundle.cells.find((cell) => cell.id === 'ALPHA-2')!;
    const a = grid.getTile(sigma, 0, 0, 1, 10)[0];
    const b = grid.getTile(alpha, 0, 0, 1, 10)[0];
    expect(a).not.toEqual(b);
  });
});
