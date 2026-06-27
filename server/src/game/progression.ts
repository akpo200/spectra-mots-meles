import type { EnigmaConfig, MissionBundle, WordConfig } from '../types.js';
import type { CellState } from '../storage/memoryStore.js';

export function unlockedEnigmas(bundle: MissionBundle, state: CellState): EnigmaConfig[] {
  const found = new Set(state.found.map((item) => item.wordId));
  const initial = bundle.enigmas.filter((enigma) => enigma.unlock.initial).slice(0, bundle.mission.initialEnigmas);
  const dependencyUnlocked = bundle.enigmas.filter((enigma) => enigma.unlock.after?.every((id) => found.has(id)));
  const manualUnlocked = bundle.enigmas.filter((enigma) => state.manualUnlocked.includes(enigma.id));
  return uniqueById([...initial, ...dependencyUnlocked, ...manualUnlocked]).filter((enigma) => !found.has(enigma.wordId));
}

export function dependenciesMet(word: WordConfig, state: CellState): boolean {
  const found = new Set(state.found.map((item) => item.wordId));
  return word.dependsOn.every((id) => found.has(id));
}

export function reconstructedMessage(bundle: MissionBundle, state: CellState): string {
  return [...bundle.secretMessage].map((char, index) => {
    if (char === ' ' || char === '-') return char;
    return state.revealedIndexes.includes(index) ? char : '_';
  }).join('');
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
