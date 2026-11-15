import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  chordName, createMusicEvents, scanTimeline, DEFAULT_CONFIG, MODES, sampleCell, scanPosition, SCAN_PERIOD,
} from "./musicMapping.js";

const samples = JSON.parse(readFileSync(new URL("../../../../backend/data/tracks.json", import.meta.url)))
  .find((track) => track.id === "ecco2_sst_flow").features;
const config = { ...DEFAULT_CONFIG, mode: "dorian", key: "D", rhythm_grid: "8n", bpm: 80 };
const DURATION = 66.7;

function flatGrid(cell, rows = 4, cols = 6) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => [...cell]));
}
const sample = (t, grid) => ({ t, brightness: 0.2, motion: 0, contrast: 0, color: {}, grid });

test("scan line moves westward through every longitude once per period", () => {
  assert.ok(Math.abs(scanPosition(0) - scanPosition(SCAN_PERIOD)) < 1e-9);
  assert.ok(scanPosition(1) < scanPosition(0));
  for (const t of [0, 7.3, 55]) {
    const u = scanPosition(t);
    assert.ok(u >= 0 && u < 1);
  }
});

test("cells interpolate in time and wrap across the date line", () => {
  const cold = flatGrid([1, 0, 0, 0]);
  const warm = flatGrid([1, 1, 1, 0]);
  const features = [sample(0, cold), sample(2, warm)];
  assert.deepEqual(sampleCell(features, 1, 0.5, 0), [1, 0.5, 0.5, 0]);
  assert.deepEqual(sampleCell(features, -1, 0.5, 0), [1, 0, 0, 0]);
  assert.deepEqual(sampleCell(features, 9, 0.5, 0), [1, 1, 1, 0]);
  const edge = flatGrid([0, 0, 0, 0]);
  edge[0][5] = [1, 1, 1, 1];
  // u = 0 sits between the last and first column, half of each.
  assert.deepEqual(sampleCell([sample(0, edge)], 0, 0, 0), [0.5, 0.5, 0.5, 0.5]);
});

test("real data produces deterministic, in-range notes on the beat grid", () => {
  const events = createMusicEvents(config, samples, DURATION);
  assert.deepEqual(events, createMusicEvents(config, samples, DURATION));
  assert.ok(events.leads.length > 50);
  assert.ok(events.chords.length > 5);
  assert.ok(events.chords.every((chord, i) => i === 0 || chord.root !== events.chords[i - 1].root));
  assert.ok(Math.abs(events.chords.at(-1).t + events.chords.at(-1).duration - DURATION) < 1e-9);
  const interval = 60 / config.bpm / 2;
  for (const lead of events.leads) {
    assert.ok(lead.t >= 0 && lead.t < DURATION);
    assert.ok(Math.abs(lead.t / interval - Math.round(lead.t / interval)) < 1e-9);
    assert.ok(lead.velocity >= 0 && lead.velocity <= config.velocity_range[1]);
    assert.ok(lead.pan >= -0.8 && lead.pan <= 0.8);
    assert.ok(Number.isInteger(lead.note));
  }
  for (const chord of events.chords) {
    assert.equal(chord.notes.length, 3);
    assert.ok(chord.notes.at(-1) - chord.notes[0] < 12, "pad voicing stays within an octave");
  }
});

test("lead notes are chord tones, and northern bands sound higher than southern ones", () => {
  const { leads, chords } = createMusicEvents(config, samples, DURATION);
  for (const lead of leads) {
    const chord = chords.findLast((c) => c.t <= lead.t);
    assert.ok(chord.pitchClasses.includes(lead.note % 12));
  }
  const average = (row) => {
    const notes = leads.filter((lead) => lead.row === row).map((lead) => lead.note);
    return notes.reduce((a, b) => a + b, 0) / notes.length;
  };
  assert.ok(average(2) > average(4) && average(4) > average(6));
});

test("land is silent and faster currents play more often", () => {
  const land = createMusicEvents(config, [sample(0, flatGrid([0, 0.5, 1, 0]))], 10);
  assert.equal(land.leads.length, 0);
  const slow = createMusicEvents(config, [sample(0, flatGrid([1, 0.5, 0, 0]))], 10);
  const fast = createMusicEvents(config, [sample(0, flatGrid([1, 0.5, 1, 0]))], 10);
  assert.ok(fast.leads.length > slow.leads.length * 3);
});

test("eastward and westward currents pan to opposite sides", () => {
  const east = createMusicEvents(config, [sample(0, flatGrid([1, 0.5, 1, 1]))], 5);
  const west = createMusicEvents(config, [sample(0, flatGrid([1, 0.5, 1, -1]))], 5);
  assert.ok(east.leads.every((lead) => lead.pan > 0));
  assert.ok(west.leads.every((lead) => lead.pan < 0));
});

test("every mode and the default style produce music", () => {
  for (const mode of Object.keys(MODES)) {
    const events = createMusicEvents({ ...DEFAULT_CONFIG, mode }, samples, DURATION);
    assert.ok(events.leads.length && events.chords.length, mode);
  }
  assert.throws(() => createMusicEvents({ ...config, mode: "locrian" }, samples, DURATION));
  assert.throws(() => createMusicEvents(config, [], DURATION));
});

test("chords are named in any inversion", () => {
  assert.equal(chordName([2, 6, 9]), "D");
  assert.equal(chordName([2, 6, 11]), "Bm");
  assert.equal(chordName([11, 2, 5]), "Bdim");
  assert.equal(chordName([2, 7, 9]), "Dsus4");
});

test("timeline shows warm tropical water and darker land along the scan", () => {
  const strip = scanTimeline(samples, DURATION, 200);
  assert.equal(strip.length, 200);
  assert.ok(strip.every(({ warmth, presence }) => warmth >= 0 && warmth <= 1 && presence >= 0 && presence <= 1));
  const presences = strip.map((point) => point.presence);
  assert.ok(Math.max(...presences) - Math.min(...presences) > 0.15, "land and ocean differ along the scan");
});
