import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  chordName, createMusicEvents, DATA_SOURCES, scanPath, scanTimeline, DEFAULT_CONFIG, MODES, sampleCell, sampleScanCell,
} from "./musicMapping.js";

const samples = JSON.parse(readFileSync(new URL("../../../../backend/data/tracks.json", import.meta.url)))
  .find((track) => track.id === "ecco2_sst_flow").features;
const config = { ...DEFAULT_CONFIG, mode: "dorian", key: "D", rhythm_grid: "8n", bpm: 80 };
const DURATION = 66.7;

function flatGrid(cell, rows = 4, cols = 6) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => [...cell]));
}
const sample = (t, grid) => ({ t, brightness: 0.2, motion: 0, contrast: 0, color: {}, grid });

test("every scan completes exactly one pass over the track duration", () => {
  const patterns = [
    ["left-to-right", "position", 0, 1],
    ["right-to-left", "position", 1, 0],
    ["clockwise", "angle", 0, 2 * Math.PI],
    ["counter-clockwise", "angle", 0, -2 * Math.PI],
    ["outward", "radius", 0, 1],
    ["inward", "radius", 1, 0],
  ];
  for (const duration of [10, DURATION, 120]) {
    for (const [pattern, key, start, end] of patterns) {
      for (const [time, progress] of [[-1, 0], [0, 0], [duration / 4, 0.25], [duration / 2, 0.5], [duration, 1], [duration + 1, 1]]) {
        const actual = scanPath(time, duration, pattern)[key];
        assert.ok(Math.abs(actual - (start + (end - start) * progress)) < 1e-9, `${pattern} at ${time}/${duration}`);
      }
    }
  }
  assert.throws(() => scanPath(0, 0));
  assert.throws(() => scanPath(0, NaN));
  assert.throws(() => scanPath(NaN, DURATION));
});

test("audio sampling and timeline use the same duration-scaled scan", () => {
  const grid = [[
    [1, 0.5, 1, -1], [1, 0.5, 1, -0.5], [1, 0.5, 1, 0.5], [1, 0.5, 1, 1],
  ]];
  const features = [sample(0, grid)];
  const eventConfig = { ...config, bpm: 120, rhythm_grid: "4n", density_range: [1, 1] };
  for (const [duration, pattern] of [[10, "left-to-right"], [20, "right-to-left"]]) {
    const time = duration / 4;
    const scanned = sampleScanCell(features, time, duration, 0, pattern);
    const expectedPosition = pattern === "left-to-right" ? 0.25 : 0.75;
    assert.deepEqual(scanned, [1, 0.2, 1, sampleCell(features, time, expectedPosition, 0)[3]]);
    const lead = createMusicEvents(eventConfig, features, duration, pattern).leads.find((item) => item.t === time);
    assert.ok(lead);
    assert.ok(Math.abs(lead.pan - scanned[3] * 0.8) < 1e-9);
  }
  const landAndSea = [sample(0, [[[0, 0.5, 1, 0], [0, 0.5, 1, 0], [1, 0.5, 1, 0], [1, 0.5, 1, 0]]])];
  const timeline = scanTimeline(landAndSea, 10, 5);
  assert.equal(timeline[1].presence, 0);
  assert.equal(timeline[3].presence, 1);
  const latitudes = [sample(0, [
    [[1, 0.5, 1, 0], [1, 0.5, 1, 0], [0, 0.5, 1, 0], [0, 0.5, 1, 0]],
    [[0, 0.5, 1, 0], [0, 0.5, 1, 0], [1, 0.5, 1, 0], [1, 0.5, 1, 0]],
  ])];
  assert.equal(createMusicEvents(eventConfig, latitudes, 2).chords[0].warmth, 0.5);
  assert.equal(createMusicEvents(eventConfig, latitudes, 8).chords[0].warmth, 0.75);
});

test("each scan pattern changes the generated sonification", () => {
  const horizontal = createMusicEvents(config, samples, DURATION);
  for (const pattern of ["right-to-left", "clockwise", "counter-clockwise", "outward", "inward"]) {
    const events = createMusicEvents(config, samples, DURATION, pattern);
    assert.ok(events.leads.length > 0, pattern);
    assert.notDeepEqual(events, horizontal, pattern);
  }
  assert.throws(() => createMusicEvents(config, samples, DURATION, "diagonal"));
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

test("brightness and color determine pitch without changing latitude-based harmony", () => {
  const feature = sample(0, flatGrid([1, 0.25, 1, 0]));
  feature.brightness = 0;
  feature.color = {
    red: 0, yellow: 0, green: 0, cyan: 0, blue: 0, magenta: 1, neutral: 0,
  };
  assert.deepEqual(DATA_SOURCES, ["brightness", "color"]);
  const darkEvents = createMusicEvents(config, [feature], 10, "left-to-right", "brightness");
  const colorEvents = createMusicEvents(config, [feature], 10, "left-to-right", "color");
  assert.ok(darkEvents.leads.length > 0);
  assert.equal(colorEvents.leads.length, darkEvents.leads.length);
  assert.ok(colorEvents.leads.every((lead, i) => lead.note > darkEvents.leads[i].note));
  assert.deepEqual(colorEvents.chords, darkEvents.chords);
  const brightFeature = { ...feature, brightness: 1 };
  const brightEvents = createMusicEvents(config, [brightFeature], 10, "left-to-right", "brightness");
  assert.ok(brightEvents.leads.every((lead, i) => lead.note > darkEvents.leads[i].note));
  assert.deepEqual(brightEvents.chords, darkEvents.chords);
  assert.throws(() => createMusicEvents(config, [feature], 10, "left-to-right", "motion"));
  assert.throws(() => createMusicEvents(config, [feature], 10, "left-to-right", "temperature"));
});

test("latitude controls tone color and harmony without changing pitch", () => {
  const gridAt = (row) => {
    const grid = flatGrid([0, 0, 0, 0]);
    grid[row] = grid[row].map(() => [1, 0.5, 1, 0]);
    return grid;
  };
  const north = createMusicEvents(config, [sample(0, gridAt(0))], 10);
  const south = createMusicEvents(config, [sample(0, gridAt(3))], 10);
  assert.ok(north.leads.length && south.leads.length);
  assert.ok(north.leads.every((lead) => lead.warmth === 1));
  assert.ok(south.leads.every((lead) => lead.warmth === 0));
  assert.equal(north.leads[0].note, south.leads[0].note);
  assert.equal(north.chords[0].warmth, 1);
  assert.equal(south.chords[0].warmth, 0);
  assert.notEqual(north.chords[0].root, south.chords[0].root);

  const singleRow = createMusicEvents(config, [sample(0, flatGrid([1, 0.5, 1, 0], 1))], 10);
  assert.ok(singleRow.leads.every((lead) => lead.warmth === 0.5));
  assert.equal(singleRow.chords[0].warmth, 0.5);
});

test("small changes in real image data produce pitch variation", () => {
  for (const source of ["brightness", "color"]) {
    const { leads } = createMusicEvents(config, samples, DURATION, "left-to-right", source);
    assert.ok(new Set(leads.map((lead) => lead.note)).size > 1, source);
  }
});

test("real data produces deterministic, in-range notes on the beat grid", () => {
  const events = createMusicEvents(config, samples, DURATION);
  assert.deepEqual(events, createMusicEvents(config, samples, DURATION));
  assert.ok(events.leads.length > 50);
  assert.ok(events.chords.length > 1);
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

test("lead notes stay in the configured scale", () => {
  const { leads } = createMusicEvents(config, samples, DURATION);
  for (const lead of leads) {
    assert.ok(MODES[config.mode].includes((lead.note - 2 + 12) % 12));
  }
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

test("timeline shows latitude and ocean presence along the scan", () => {
  const strip = scanTimeline(samples, DURATION, 200);
  assert.equal(strip.length, 200);
  assert.ok(strip.every(({ warmth, presence }) => warmth >= 0 && warmth <= 1 && presence >= 0 && presence <= 1));
  const presences = strip.map((point) => point.presence);
  assert.ok(Math.max(...presences) - Math.min(...presences) > 0.15, "land and ocean differ along the scan");
});
