import { loadMission } from '../server/src/mission/loadMission.js';
import { GridEngine } from '../server/src/grid/gridEngine.js';

const bundle = loadMission(process.env.MISSION_ID ?? 'operation-festin');
const grid = new GridEngine(bundle);

console.log(`Mission: ${bundle.mission.title}`);
console.log(`Grille: ${grid.rows} x ${grid.cols}`);
console.log(`Mots placés: ${grid.placements.length}`);
console.log('Aperçu des placements serveur:');
for (const placement of grid.placements.slice(0, 10)) {
  const first = placement.cells[0];
  console.log(`- ${placement.wordId} (${placement.path}) depuis ${first.row},${first.col}`);
}
