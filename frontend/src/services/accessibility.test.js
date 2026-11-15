import assert from "node:assert/strict";
import test from "node:test";
import { currentVisualData, describePage, describeTrack, formatSpokenTime, sanitizePreferences } from "./accessibility.js";

test("saved preferences reject invalid values and respect explicit choices over system defaults", () => {
  const settings = sanitizePreferences({ highContrast: false, reducedMotion: "yes", textSize: "huge", speechRate: Infinity, speechVolume: -1 }, { highContrast: true, reducedMotion: true });
  assert.deepEqual(settings, { highContrast: false, reducedMotion: true, textSize: "standard", speechRate: 1, speechVolume: 0 });
  assert.equal(sanitizePreferences(null, { highContrast: true }).highContrast, true);
  assert.equal(sanitizePreferences({ speechRate: 7 }).speechRate, 1.5);
});

const track = { title: "Ocean visualization", description: "<p>Patterns in ocean imagery.</p>", duration: 66.7,
  features: [{ t: 0, brightness: 0.2, contrast: 0.3, motion: 0 }, { t: 2, brightness: 0.4, contrast: 0.5, motion: 0.1 }] };

test("visual values interpolate real timestamps and leave unavailable values explicit", () => {
  const data = currentVisualData(track.features, 1);
  assert.ok(Math.abs(data.brightness - 0.3) < 1e-9);
  assert.equal(data.contrast, 0.4);
  assert.equal(data.motion, 0.05);
  assert.equal(currentVisualData(track.features, -10).brightness, 0.2);
  assert.equal(currentVisualData(track.features, 100).brightness, 0.4);
  assert.equal(currentVisualData([{ t: 0, contrast: 0.2 }], 0).brightness, null);
  assert.equal(currentVisualData([], 0).motion, null);
  assert.equal(currentVisualData([{ t: 0, brightness: 0.2 }, { t: 1 }], 0).brightness, 0.2);
  assert.equal(currentVisualData([{ t: 0, brightness: 0.2 }, { t: 1 }], 0.5).brightness, null);
});

test("reading descriptions include the track, instructions, and truthful sound legend", () => {
  assert.equal(formatSpokenTime(66.7), "1 minute 6 seconds");
  assert.match(describePage([track]), /collection has 1 track/);
  assert.match(describePage([track]), /Tab/);
  assert.match(describeTrack(track), /Patterns in ocean imagery/);
  assert.doesNotMatch(describeTrack(track), /<p>/);
  assert.match(describeTrack(track), /not direct temperature or current-speed measurements/);
});

