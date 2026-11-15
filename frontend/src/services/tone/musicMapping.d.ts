import type { FeatureSample, MusicConfig } from "../../types";

export const DEFAULT_CONFIG: Omit<MusicConfig, "track_id">;
export const SCAN_PERIOD: number;
export function scanPosition(time: number): number;
export function sampleCell(
  features: FeatureSample[],
  time: number,
  position: number,
  row: number,
): [number, number, number, number];
export function createMusicEvents(
  config: MusicConfig,
  features: FeatureSample[],
  duration: number,
): unknown;
