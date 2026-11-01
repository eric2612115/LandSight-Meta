/** The shape of public/data/film.json (written by prepare.mjs from the runs at render time). */
export type Beat = {n: number; id: string; title: string; start: number; end: number; temp: string; kind: 'paper' | 'app'; scene?: string; lead?: number};
export type Caption = {at: number; until: number; kicker: string; text: string; mono?: string};
export type SoundCue = {t: number; name: string; rate: number; volume: number};
export type AppBeat = {beat: number; capture: string | null; source: 'repo' | 'mock'; source_file: string; fallback: string | null; captions: Caption[]; events: SoundCue[]};
export type Canopy = {id: string; x: number; y: number; r: number; open?: boolean};

export type FilmData = {
  generated_at: string;
  beats: Beat[];
  model: {spark: string; sam: string};
  runs: Record<string, {run: string; rules: string}>;
  paper: {
    row: {text: string; qty: number; price: number; unit: string; source: string; display: string};
    drawn: number;
    drawn_source: string;
    sheet: {svg: string; viewBox: number[]; source: string};
    canopies: Canopy[];
    open: Canopy & {pieces: number; gapAngles: number[]; maxGap?: number};
  };
  app: Record<string, AppBeat>;
  narration: Record<string, {voice: string; dir: string; ext?: string; clips: Record<string, number>}>;
  end: {lockup: string; models: string[]; models_source: string};
  music: {open: number; close: number};
};

export type FilmProps = {
  narrator: 'brian' | 'alice';
  repoUrl: string;
  showSourceTag: boolean;
  data?: FilmData;
};
