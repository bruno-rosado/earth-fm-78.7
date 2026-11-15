import assert from "node:assert/strict";
import test from "node:test";
import { createNarrationController, createNarrationLoader } from "./narrationAudio.js";

function harness(options = {}) {
  const media = [], states = [], ducking = [], resources = [], loads = [];
  const controller = createNarrationController({
    createAudio() {
      const audio = { currentTime: 0, plays: 0, pauses: 0, srcSets: 0, source: "",
        get src() { return this.source; }, set src(value) { this.source = value; this.srcSets++; },
        async play() { this.plays++; this.onplaying?.(); }, pause() { this.pauses++; },
        removeAttribute() { this.source = ""; }, load() {},
      };
      media.push(audio); return audio;
    },
    async loadAudio(text, { signal }) {
      loads.push({ text, signal });
      const resource = { url: `blob:${resources.length}`, released: 0, release() { this.released++; } };
      resources.push(resource); return resource;
    },
    onState: (state) => states.push(state), onDucking: (active) => ducking.push(active), ...options,
  });
  return { controller, media, states, ducking, resources, loads, last: () => states.at(-1) };
}

test("rapid slider changes keep the same audio, time, source, and uninterrupted play call", async () => {
  const h = harness();
  await h.controller.speak("Read the track description.");
  const audio = h.media[0]; audio.currentTime = 17.6;
  const transitions = h.ducking.length;
  for (let i = 0; i < 200; i++) h.controller.updatePreferences({ speechVolume: (i % 21) / 20, speechRate: 0.75 + (i % 16) * 0.05 });
  assert.equal(h.media.length, 1);
  assert.equal(h.loads.length, 1);
  assert.equal(audio.plays, 1);
  assert.equal(audio.pauses, 0);
  assert.equal(audio.srcSets, 1);
  assert.equal(audio.currentTime, 17.6);
  assert.equal(audio.preservesPitch, true);
  assert.equal(h.ducking.length, transitions);
  assert.equal(h.last().speaking, true);
  h.controller.dispose();
});

test("volume zero and rate changes apply immediately without restarting or changing text", async () => {
  const h = harness();
  await h.controller.speak("Exact transcript.", { speechVolume: 0.6, speechRate: 1.1 });
  const audio = h.media[0];
  assert.equal(audio.volume, 0.6);
  h.controller.updatePreferences({ speechVolume: 0, speechRate: 1.5 });
  assert.equal(audio.volume, 0);
  assert.equal(audio.playbackRate, 1.5);
  assert.equal(h.last().text, "Exact transcript.");
  audio.onended();
  assert.equal(h.last().speaking, false);
  assert.equal(h.ducking.at(-1), false);
  assert.equal(h.resources[0].released, 1);
  h.controller.dispose();
});

test("stopping while audio is loading prevents late playback and releases stale resources", async () => {
  let resolve;
  const resource = { url: "blob:late", released: 0, release() { this.released++; } };
  const h = harness({ loadAudio: () => new Promise((done) => { resolve = done; }) });
  const pending = h.controller.speak("Still preparing.");
  h.controller.cancel();
  resolve(resource); await pending;
  assert.equal(h.media.length, 0);
  assert.equal(resource.released, 1);
  assert.equal(h.last().speaking, false);
  h.controller.updatePreferences({ speechRate: 1.3 });
  assert.equal(h.media.length, 0);
  h.controller.dispose();
});

test("new readings retire old audio; old callbacks cannot stop or unduck replacements", async () => {
  const h = harness();
  await h.controller.speak("First reading.");
  const ended = h.media[0].onended;
  const error = h.media[0].onerror;
  const playing = h.media[0].onplaying;
  await h.controller.speak("Second reading.");
  ended(); error(); playing();
  assert.equal(h.media[0].pauses, 1);
  assert.equal(h.resources[0].released, 1);
  assert.equal(h.last().text, "Second reading.");
  assert.equal(h.last().speaking, true);
  assert.equal(h.ducking.at(-1), true);
  h.controller.cancel();
  assert.equal(h.media[1].pauses, 1);
  assert.equal(h.resources[1].released, 1);
  assert.equal(h.ducking.at(-1), false);
  h.controller.dispose();
});

test("settings changed during preparation are applied before the first play", async () => {
  let resolve;
  const h = harness({ loadAudio: () => new Promise((done) => { resolve = done; }) });
  const pending = h.controller.speak("Preparing.");
  h.controller.updatePreferences({ speechRate: 1.4, speechVolume: 0.25 });
  resolve({ url: "blob:ready", release() {} }); await pending;
  assert.equal(h.media[0].playbackRate, 1.4);
  assert.equal(h.media[0].volume, 0.25);
  h.controller.dispose();
});

test("provider, decode, and autoplay errors retain text and restore music", async () => {
  const h = harness({ loadAudio: async () => { throw new Error("Voice unavailable. Transcript remains."); } });
  await h.controller.speak("Written fallback.");
  assert.equal(h.last().text, "Written fallback.");
  assert.equal(h.last().speaking, false);
  assert.equal(h.ducking.at(-1), false);
  h.controller.dispose();
  const other = harness();
  await other.controller.speak("A decode failure."); other.media[0].onerror();
  assert.equal(other.last().speaking, false);
  assert.equal(other.resources[0].released, 1);
  other.controller.dispose();
  const blocked = harness({ createAudio: () => ({ pause() {}, load() {}, removeAttribute() {}, play: async () => { throw new DOMException("blocked", "NotAllowedError"); } }) });
  await blocked.controller.speak("Autoplay blocked.");
  assert.match(blocked.last().message, /browser blocked audio/);
  assert.equal(blocked.resources[0].released, 1);
  blocked.controller.dispose();
});

test("blocked preparation times out, aborts the request, and cannot later start", async () => {
  let signal, resolve;
  const h = harness({ startTimeout: 5, loadAudio: (_, options) => { signal = options.signal; return new Promise((done) => { resolve = done; }); } });
  const pending = h.controller.speak("Waiting.");
  await new Promise((done) => setTimeout(done, 25));
  assert.equal(signal.aborted, true);
  assert.equal(h.last().speaking, false);
  let released = false;
  resolve({ url: "blob:late", release() { released = true; } }); await pending;
  assert.equal(released, true);
  assert.equal(h.media.length, 0);
  h.controller.dispose();
});

test("loader caches audio bytes, owns each object URL, and evicts old text", async () => {
  let requests = 0, urls = 0;
  const revoked = [];
  const load = createNarrationLoader({
    fetchAudio: async () => { requests++; return { ok: true, blob: async () => new Blob(["wave"], { type: "audio/wav" }) }; },
    makeUrl: () => `blob:${++urls}`, revokeUrl: (url) => revoked.push(url), maxEntries: 2,
  });
  const options = { signal: new AbortController().signal };
  const first = await load("First", options); first.release(); first.release();
  const repeat = await load("First", options); repeat.release();
  assert.equal(requests, 1);
  assert.deepEqual(revoked, ["blob:1", "blob:2"]);
  (await load("Second", options)).release();
  (await load("Third", options)).release();
  (await load("First", options)).release();
  assert.equal(requests, 4);
});

test("loader rejects invalid audio and surfaces readable server errors", async () => {
  const options = { signal: new AbortController().signal };
  const invalid = createNarrationLoader({ fetchAudio: async () => ({ ok: true, blob: async () => new Blob(["html"], { type: "text/html" }) }) });
  await assert.rejects(invalid("Text", options), /invalid audio/);
  const unavailable = createNarrationLoader({ fetchAudio: async () => ({ ok: false, json: async () => ({ detail: "Install a server voice. Transcript remains." }) }) });
  await assert.rejects(unavailable("Text", options), /Install a server voice/);
});
