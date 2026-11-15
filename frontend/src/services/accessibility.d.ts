import type { CatalogTrack, FeatureSample } from "../types";
export const PREFERENCE_KEY: string;
export interface AccessibilityPreferences {
  highContrast: boolean;
  reducedMotion: boolean;
  textSize: "standard" | "large" | "extra";
  speechRate: number;
  speechVolume: number;
}
export interface SpeechState { text: string; speaking: boolean; message: string }
export function sanitizePreferences(value: unknown, system?: Partial<AccessibilityPreferences>): AccessibilityPreferences;
export function formatSpokenTime(seconds: number): string;
export const SOUND_LEGEND: string;
export const KEYBOARD_HELP: string;
export function describeTrack(track: CatalogTrack): string;
export function describePage(tracks: CatalogTrack[]): string;
export function currentVisualData(features: FeatureSample[], seconds: number): { brightness: number | null; contrast: number | null; motion: number | null };
export function formatVisualValue(value: number | null): string;
