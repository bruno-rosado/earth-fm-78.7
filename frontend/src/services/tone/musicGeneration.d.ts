import type { FeatureSample, MusicConfig } from "../../types";

export interface Playback {
  duration: number;
  getTime(): number;
  isPlaying(): boolean;
  play(): Promise<void>;
  pause(): void;
  seek(seconds: number): void;
  setVolume(value: number): void;
  dispose(): void;
}

export function createPlayback(options: {
  config: MusicConfig;
  features: FeatureSample[];
  duration: number;
  video: HTMLVideoElement | null;
  onEnded?: () => void;
  onVideoError?: () => void;
}): Promise<Playback>;
