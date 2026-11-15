import type { AccessibilityPreferences, SpeechState } from "./accessibility.js";
export interface AudioResource { url: string; release(): void }
export type AudioLoader = (text: string, options: { signal: AbortSignal }) => Promise<AudioResource>;
export interface NarrationController {
  speak(text: string, preferences?: Partial<AccessibilityPreferences>): Promise<void>;
  updatePreferences(preferences: Partial<AccessibilityPreferences>): void;
  cancel(): void;
  dispose(): void;
}
export function createNarrationLoader(options?: {
  fetchAudio?: typeof fetch;
  makeUrl?(blob: Blob): string;
  revokeUrl?(url: string): void;
  maxEntries?: number;
}): AudioLoader;
export function createNarrationController(options: {
  createAudio(): HTMLAudioElement;
  loadAudio: AudioLoader;
  onState(state: SpeechState): void;
  onDucking?(active: boolean): void;
  startTimeout?: number;
}): NarrationController;
