import type { FeatureSample, MusicConfig } from "../../types";

export const DEFAULT_CONFIG: Omit<MusicConfig, "track_id">;
export const DATA_SOURCES: readonly ["brightness", "color"];
export type DataSource = (typeof DATA_SOURCES)[number];
export type ScanPattern =
  | "left-to-right"
  | "right-to-left"
  | "clockwise"
  | "counter-clockwise"
  | "outward"
  | "inward";
export type ScanPath =
  | { type: "vertical"; position: number }
  | { type: "rotating-line"; angle: number }
  | { type: "ring"; radius: number };
export function scanPath(time: number, duration: number, pattern?: ScanPattern): ScanPath;
export function sampleCell(
  features: FeatureSample[],
  time: number,
  position: number,
  row: number,
): [number, number, number, number];
export function sampleScanCell(
  features: FeatureSample[],
  time: number,
  duration: number,
  row: number,
  pattern?: ScanPattern,
  dataSource?: DataSource,
): [number, number, number, number];
export function createMusicEvents(
  config: MusicConfig,
  features: FeatureSample[],
  duration: number,
  pattern?: ScanPattern,
  dataSource?: DataSource,
): unknown;
export function scanTimeline(
  features: FeatureSample[],
  duration: number,
  steps: number,
  pattern?: ScanPattern,
): { warmth: number; presence: number }[];
