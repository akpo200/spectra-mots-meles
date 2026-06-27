export type PathKind =
  | 'horizontal'
  | 'horizontalReverse'
  | 'vertical'
  | 'verticalReverse'
  | 'diagonal'
  | 'diagonalReverse'
  | 'spiral'
  | 'zigzag'
  | 'serpent';

export interface CellConfig {
  id: string;
  linkCode: string;
  shift: number;
  password: string;
  members: string[];
}

export interface WordConfig {
  id: string;
  answer: string;
  category: string;
  path: PathKind;
  reveal: number[];
  dependsOn: string[];
}

export interface EnigmaConfig {
  id: string;
  wordId: string;
  text: string;
  unlock: { initial?: boolean; after?: string[] };
}

export interface MissionConfig {
  missionId: string;
  title: string;
  grid: { rows: number; cols: number; seed: string };
  initialEnigmas: number;
  antiCheat: Record<string, number>;
  jwt: { accessTokenTtlSeconds: number };
}

export interface MissionBundle {
  mission: MissionConfig;
  cells: CellConfig[];
  words: WordConfig[];
  secretMessage: string;
  enigmas: EnigmaConfig[];
  transmissions: {
    automatic: { progress: number; title: string; body: string }[];
    manualTemplates: string[];
  };
  theme: Record<string, unknown>;
}

export interface Coordinate {
  row: number;
  col: number;
}

export interface Placement {
  wordId: string;
  answer: string;
  path: PathKind;
  cells: Coordinate[];
}

export interface PlayerSession {
  missionId: string;
  cellId: string;
  pseudo: string;
  role: 'player' | 'admin';
}

export interface AntiCheatEvent {
  cellId: string;
  pseudo: string;
  severity: 'yellow' | 'red';
  reason: string;
  createdAt: string;
}
