// Shared by the mixer, inspector, and MIDI export. No audio context required.
import { SCAN_PERIOD, SCAN_START } from "./musicMapping.js";

export const DEFAULT_MIX = Object.freeze({ melody: 1, texture: 1, harmony: 1 });
export const LAYERS = [
  { id: "melody", label: "Melody", detail: "The most active latitude" },
  { id: "texture", label: "Texture", detail: "All latitude voices" },
  { id: "harmony", label: "Harmony", detail: "Color-shaped chords + bass" },
];

export function effectiveMix(mix = DEFAULT_MIX, solo = null) {
  return Object.fromEntries(Object.keys(DEFAULT_MIX).map((id) => [
    id, solo && solo !== id ? 0 : Math.max(0, Math.min(1, Number(mix[id] ?? 1) || 0)),
  ]));
}

// Pick the closest visit to a longitude, including later revolutions. A short
// clip may never reach that longitude, so don't jump somewhere unrelated.
export function timeForLongitude(u, current, duration, period = SCAN_PERIOD, start = SCAN_START) {
  const first = (((start - u) % 1 + 1) % 1) * period;
  const candidates = [];
  for (let t = first; t < duration; t += period) candidates.push(t);
  return candidates.length ? candidates.reduce((a, b) => Math.abs(a - current) <= Math.abs(b - current) ? a : b) : null;
}

export function dominantCell(cells) {
  return cells.reduce((best, cell, row) => {
    const energy = cell[0] * (0.25 + cell[2]);
    return !best || energy > best.energy ? { row, cell, energy } : best;
  }, null);
}
