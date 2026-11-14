import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createMusicEvents, interpolateFeatures } from "./musicMapping.js";

const samples = JSON.parse(readFileSync(new URL("../../../../backend/data/features/ecco2_sst_flow.json", import.meta.url)));
const config = {
  bpm: 80, scale: ["D3", "F3", "G3", "A3", "C4", "D4"], rhythm_grid: "8n",
  density_range: [0.2, 0.8], velocity_range: [0.25, 0.75],
};

test("two-second features interpolate between samples and clamp at endpoints", () => {
  assert.equal(interpolateFeatures(samples, -1), samples[0]);
  assert.equal(interpolateFeatures(samples, 100), samples.at(-1));
  const midpoint = interpolateFeatures(samples, 1);
  assert.equal(midpoint.brightness, (samples[0].brightness + samples[1].brightness) / 2);
  assert.ok(Math.abs(Object.values(midpoint.color).reduce((a, b) => a + b) - 1) < 1e-6);
});

test("real data produces deterministic notes on the beat grid within track duration", () => {
  const events = createMusicEvents(config, samples, 66.7);
  assert.ok(events.length > samples.length);
  assert.deepEqual(events, createMusicEvents(config, samples, 66.7));
  for (const event of events) {
    assert.ok(event.t >= 0 && event.t < 66.7);
    assert.ok(config.scale.includes(event.note));
    assert.ok(event.velocity >= 0.25 && event.velocity <= 0.75);
    assert.ok(event.filterFrequency >= 350 && event.filterFrequency <= 3550);
    assert.ok(Math.abs(event.t / 0.375 - Math.round(event.t / 0.375)) < 1e-9);
  }
});

test("motion changes note density", () => {
  const sparse = createMusicEvents({ ...config, density_range: [0.1, 0.1] }, samples, 66.7);
  const dense = createMusicEvents({ ...config, density_range: [1, 1] }, samples, 66.7);
  assert.ok(dense.length > sparse.length * 5);
});

test("constant, neutral data stays finite without spurious noise", () => {
  const neutral = [{ t: 0, brightness: 0.2, motion: 0, contrast: 0,
    color: { red: 0, yellow: 0, green: 0, cyan: 0, blue: 0, magenta: 0, neutral: 1 } }];
  const events = createMusicEvents(config, neutral, 5);
  assert.ok(events.length);
  assert.ok(events.every((event) => Number.isFinite(event.velocity) && Number.isFinite(event.filterFrequency)));
  assert.equal(new Set(events.map((event) => event.note)).size, 1);
});
