import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_MIX, dominantCell, effectiveMix, timeForLongitude } from "./listeningTools.js";
import { createMidi } from "./midiExport.js";
import { createMusicEvents, scanPosition } from "./musicMapping.js";
import { deriveStyle } from "./musicStyle.js";

const track = JSON.parse(readFileSync(new URL("../../../../backend/data/tracks.json", import.meta.url)))[0];
const config = deriveStyle(track);

// Independent reader for the Standard MIDI file, including delta times and meta
// lengths. This catches corrupt chunks, stuck notes, and timing errors.
function parseMidi(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset, length) => new TextDecoder().decode(bytes.slice(offset, offset + length));
  assert.equal(ascii(0, 4), "MThd");
  assert.equal(view.getUint32(4), 6);
  assert.equal(view.getUint16(8), 1);
  assert.equal(view.getUint16(12), 480);
  let offset = 14;
  const tracks = [];
  const variable = () => {
    let value = 0;
    let byte;
    do { byte = bytes[offset++]; value = value * 128 + (byte & 127); } while (byte & 128);
    return value;
  };
  for (let i = 0; i < view.getUint16(10); i++) {
    assert.equal(ascii(offset, 4), "MTrk");
    const end = offset + 8 + view.getUint32(offset + 4);
    offset += 8;
    let time = 0;
    const events = [];
    while (offset < end) {
      time += variable();
      const status = bytes[offset++];
      if (status === 255) {
        const kind = bytes[offset++];
        const length = variable();
        events.push({ time, status, kind, data: [...bytes.slice(offset, offset + length)] });
        offset += length;
      } else {
        const length = (status & 240) === 192 ? 1 : 2;
        const data = [...bytes.slice(offset, offset + length)];
        assert.ok(data.every((byte) => byte >= 0 && byte < 128), "MIDI data bytes stay in range");
        events.push({ time, status, data });
        offset += length;
      }
    }
    assert.equal(offset, end);
    assert.equal(events.at(-1).kind, 47, "track ends with End of Track");
    tracks.push(events);
  }
  assert.equal(offset, bytes.length, "all chunks are consumed");
  return tracks;
}

test("mixer solo preserves fader levels and reset defaults", () => {
  const mix = { melody: 0.4, texture: 0.8, harmony: 0.6 };
  assert.deepEqual(effectiveMix(mix, "texture"), { melody: 0, texture: 0.8, harmony: 0 });
  assert.deepEqual(effectiveMix(mix), mix);
  assert.deepEqual(DEFAULT_MIX, { melody: 1, texture: 1, harmony: 1 });
  assert.deepEqual(effectiveMix({ melody: -2, texture: 3, harmony: NaN }), { melody: 0, texture: 1, harmony: 0 });
});

test("map seeking finds the nearest matching revolution and respects clip bounds", () => {
  for (const time of [0, 1.5, 22, 39.5, 50, 65]) {
    const target = timeForLongitude(scanPosition(time), time, 66.7);
    assert.ok(Math.abs(target - time) < 1e-8);
  }
  assert.equal(timeForLongitude(scanPosition(2), 39, 66.7), 42);
  assert.equal(timeForLongitude(0.5, 0, 5), null);
  assert.equal(timeForLongitude(0.1, 0, 0), null);
});

test("inspector identifies the same energy-based melody origin", () => {
  assert.equal(dominantCell([[0.1, 1, 1, 0], [0.8, 0.4, 0.5, 0]]).row, 1);
  assert.equal(dominantCell([[0, 0, 0, 0]]).energy, 0);
});

test("MIDI contains the actual notes, tempo, source, and balanced note lifetimes", () => {
  const bytes = createMidi({ track, config });
  assert.deepEqual(bytes, createMidi({ track, config }));
  const tracks = parseMidi(bytes);
  const tempo = tracks[0].find((event) => event.kind === 81).data;
  assert.equal(tempo.reduce((n, byte) => n * 256 + byte, 0), Math.round(60000000 / config.bpm));
  const description = new TextDecoder().decode(new Uint8Array(tracks[0].find((event) => event.kind === 1).data));
  assert.ok(description.includes(track.source));
  const expected = createMusicEvents(config, track.features, track.duration);
  assert.equal(tracks[1].filter((e) => (e.status & 240) === 144).length, expected.melody.length);
  for (const voice of tracks.slice(1)) {
    const active = new Set();
    for (const event of voice) {
      const type = event.status & 240;
      if (type === 144) {
        assert.ok(!active.has(event.data[0]), "an overlapping pitch is released before retriggering");
        active.add(event.data[0]);
        assert.notEqual(event.status & 15, 9, "melodic voices avoid the percussion channel");
      } else if (type === 128) {
        assert.ok(active.delete(event.data[0]), "every note-off has a matching note-on");
      }
    }
    assert.equal(active.size, 0, "no stuck notes at the end");
  }
});

test("MIDI honors solo and fader levels, including a fully muted mix", () => {
  const solo = parseMidi(createMidi({ track, config, solo: "melody", mix: { ...DEFAULT_MIX, melody: 0.5 } }));
  assert.equal(solo.length, 2);
  const firstNote = solo[1].find((e) => (e.status & 240) === 144);
  const expected = createMusicEvents(config, track.features, track.duration).melody[0];
  assert.equal(firstNote.data[1], Math.round(expected.velocity * 0.5 * 127));
  assert.equal(parseMidi(createMidi({ track, config, mix: { melody: 0, texture: 0, harmony: 0 } })).length, 1);
});
