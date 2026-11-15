export interface CatalogTrack {
  id: string;
  title: string;
  description: string;
  cover: string | null;
  duration: number;
  source: string;
}

export type MusicMode =
  | "major"
  | "minor"
  | "dorian"
  | "mixolydian"
  | "lydian"
  | "pentatonic_major"
  | "pentatonic_minor";

export type Instrument =
  | "synth"
  | "fm_synth"
  | "am_synth"
  | "piano"
  | "electric_piano"
  | "bell"
  | "marimba"
  | "pluck"
  | "strings"
  | "organ"
  | "flute"
  | "choir";

export interface MusicConfig {
  schema_version: 2;
  track_id?: string;
  bpm: number;
  key: string;
  mode: MusicMode;
  low_octave: number;
  lead_instrument: Instrument;
  pad_instrument: Instrument;
  rhythm_grid: "4n" | "8n" | "16n";
  note_duration: "2n" | "4n" | "8n" | "16n";
  density_range: [number, number];
  velocity_range: [number, number];
  pad_level: number;
  reverb: number;
}

export type GridCell = [presence: number, temperature: number, speed: number, flow: number];

export interface FeatureSample {
  t: number;
  brightness: number;
  motion: number;
  contrast: number;
  color: Record<string, number>;
  grid: GridCell[][];
}

export interface TrackDetails extends CatalogTrack {
  video: string;
  nasa_id: number;
  config: MusicConfig | null;
  summary: Record<string, unknown>;
}

export interface Track extends TrackDetails {
  features: FeatureSample[];
}

export interface TrackSearchResults {
  track_id: string;
  engine: "google_ai_mode";
  query: string;
  answer: string;
  sources: { title: string; url: string; snippet: string; source: string }[];
  cached: boolean;
  fetched_at: string;
}
