import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { MissionBundle } from '../types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const cellSchema = z.object({
  cells: z.array(z.object({
    id: z.string(),
    linkCode: z.string().min(6),
    shift: z.number().int().min(0).max(25),
    password: z.string().min(1),
    members: z.array(z.string().min(1))
  }))
});

const wordsSchema = z.object({
  secretMessage: z.string(),
  words: z.array(z.object({
    id: z.string(),
    answer: z.string(),
    category: z.string(),
    path: z.string(),
    reveal: z.array(z.number().int().nonnegative()),
    dependsOn: z.array(z.string())
  }))
});

function readJson<T>(missionDir: string, file: string): T {
  return JSON.parse(fs.readFileSync(path.join(missionDir, file), 'utf8')) as T;
}

export function loadMission(missionId = process.env.MISSION_ID ?? 'operation-festin'): MissionBundle {
  const missionDir = path.join(root, 'missions', missionId);
  const mission = readJson<MissionBundle['mission']>(missionDir, 'config.json');
  const cells = cellSchema.parse(readJson<unknown>(missionDir, 'cells.json')).cells;
  const wordData = wordsSchema.parse(readJson<unknown>(missionDir, 'words.json'));
  const enigmas = readJson<{ enigmas: MissionBundle['enigmas'] }>(missionDir, 'enigmas.json').enigmas;
  const transmissions = readJson<MissionBundle['transmissions']>(missionDir, 'transmissions.json');
  const theme = readJson<Record<string, unknown>>(missionDir, 'theme.json');

  // Charger tous les 122 mots fournis pour la mission (sans limitation)
  const cleanedWords = wordData.words.map(w => ({
    ...w,
    dependsOn: [] // Pas de dépendances pour cette mission
  }));

  // Toutes les énigmes correspondent (1 pour 1 avec les mots)
  const filteredEnigmas = enigmas.filter(e => cleanedWords.some(w => w.id === e.wordId));

  return {
    mission,
    cells,
    words: cleanedWords as MissionBundle['words'],
    secretMessage: wordData.secretMessage,
    enigmas: filteredEnigmas,
    transmissions,
    theme
  };
}
