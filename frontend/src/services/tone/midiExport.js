import { createMusicEvents } from "./musicMapping.js";
import { effectiveMix } from "./listeningTools.js";

const PPQ = 480;
const text = (value) => [...new TextEncoder().encode(value)];
const uint = (value, bytes) => Array.from({ length: bytes }, (_, i) => (value >>> ((bytes - i - 1) * 8)) & 255);
const chunk = (name, bytes) => [...text(name), ...uint(bytes.length, 4), ...bytes];
const PROGRAMS = { piano: 0, electric_piano: 4, bell: 10, marimba: 12, pluck: 24, strings: 48, choir: 52, flute: 73, organ: 19, synth: 88, fm_synth: 89, am_synth: 90 };

function variableLength(value) {
  const bytes = [value & 127];
  while ((value >>>= 7)) bytes.unshift((value & 127) | 128);
  return bytes;
}

const metaText = (kind, value) => {
  const bytes = text(value);
  return [255, kind, ...variableLength(bytes.length), ...bytes];
};

function encodeTrack(events, endTick) {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const bytes = [];
  let previous = 0;
  for (const event of events) {
    bytes.push(...variableLength(event.tick - previous), ...event.bytes);
    previous = event.tick;
  }
  bytes.push(...variableLength(Math.max(0, endTick - previous)), 255, 47, 0);
  return chunk("MTrk", bytes);
}

// Standard MIDI, type 1: tempo + separate melody, latitude, pad, and bass tracks.
// This exports the actual deterministic notes, not a recording or an AI guess.
export function createMidi({ track, config, mix, solo }) {
  const music = createMusicEvents(config, track.features, track.duration);
  const levels = effectiveMix(mix, solo);
  const tick = (seconds) => Math.round(seconds * config.bpm / 60 * PPQ);
  const endTick = tick(track.duration);
  const tempo = Math.round(60000000 / config.bpm);
  const tracks = [encodeTrack([
    { tick: 0, order: 0, bytes: metaText(3, track.title || track.id) },
    { tick: 0, order: 1, bytes: [255, 81, 3, ...uint(tempo, 3)] },
    { tick: 0, order: 2, bytes: [255, 88, 4, 4, 2, 24, 8] },
    { tick: 0, order: 3, bytes: metaText(1, `Earth Frequencies | ${config.key} ${config.mode} | ${config.mood} | ${track.source || "NASA SVS"}`) },
  ], endTick)];
  const subdivision = { "8n": 0.5, "4n": 1, "2n": 2 }[config.note_duration] ?? 1;
  const noteSeconds = 60 / config.bpm * subdivision;

  function addVoice(name, channel, instrument, notes, level) {
    if (level <= 0 || !notes.length) return;
    const events = [
      { tick: 0, order: 0, bytes: metaText(3, name) },
      { tick: 0, order: 1, bytes: [192 | channel, PROGRAMS[instrument] ?? 88] },
    ];
    // Retriggering an overlapping pitch must end its previous note first.
    const active = new Map();
    for (const note of notes) {
      const start = tick(note.t);
      const pitch = Math.max(0, Math.min(127, note.note));
      const old = active.get(pitch);
      if (old && old.tick > start) old.tick = start;
      const end = { tick: Math.min(endTick, Math.max(start + 1, tick(note.t + (note.duration ?? noteSeconds)))), order: 2, bytes: [128 | channel, pitch, 0] };
      events.push(
        { tick: start, order: 3, bytes: [176 | channel, 10, Math.round(64 + (note.pan ?? 0) * 63)] },
        { tick: start, order: 4, bytes: [144 | channel, pitch, Math.max(1, Math.min(127, Math.round(note.velocity * level * 127)))] },
        end,
      );
      active.set(pitch, end);
    }
    tracks.push(encodeTrack(events, endTick));
  }
  addVoice("Melody", 0, config.lead_instrument, music.melody, levels.melody);
  for (let row = 0; row < music.rows; row++) {
    // Channel 10 (index 9) is reserved for percussion in General MIDI.
    const channel = row < 8 ? row + 1 : row + 2;
    addVoice(`Latitude ${row + 1}`, channel % 16, config.lead_instrument, music.leads.filter((n) => n.row === row), levels.texture * 0.45);
  }
  addVoice("Harmony", 10, config.pad_instrument, music.chords.flatMap((c) => c.notes.map((note) => ({ ...c, note }))), levels.harmony * 0.65);
  addVoice("Bass", 11, "synth", music.chords.map((c) => ({ ...c, note: c.bass, duration: c.duration * 0.95 })), levels.harmony * 0.75);
  return new Uint8Array([...chunk("MThd", [...uint(1, 2), ...uint(tracks.length, 2), ...uint(PPQ, 2)]), ...tracks.flat()]);
}

export function downloadMidi(options) {
  const bytes = createMidi(options);
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${options.track.id.replace(/[^a-z0-9_-]/gi, "_")}-${options.config.mood}.mid`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
