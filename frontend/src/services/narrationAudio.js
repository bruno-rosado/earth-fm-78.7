import { sanitizePreferences } from "./accessibility.js";

// Cache audio bytes, not utterances. Every playback owns and releases its URL.
export function createNarrationLoader({ fetchAudio = globalThis.fetch, makeUrl = (blob) => URL.createObjectURL(blob), revokeUrl = (url) => URL.revokeObjectURL(url), maxEntries = 4 } = {}) {
  const cache = new Map();
  return async (text, { signal }) => {
    let blob = cache.get(text);
    if (!blob) {
      const response = await fetchAudio("/api/narration", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }), signal,
      });
      if (!response.ok) {
        let message = "Narration could not be prepared. The transcript is still available.";
        try { const body = await response.json(); if (typeof body.detail === "string") message = body.detail; } catch { /* Keep the readable fallback. */ }
        throw new Error(message);
      }
      blob = await response.blob();
      if (!blob.type.startsWith("audio/") || !blob.size || blob.size > 24 * 1024 * 1024) throw new Error("Narration returned invalid audio. The transcript is still available.");
    }
    if (signal.aborted) throw new DOMException("Narration canceled", "AbortError");
    cache.delete(text);
    cache.set(text, blob);
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    const url = makeUrl(blob);
    let released = false;
    return { url, release() { if (!released) { released = true; revokeUrl(url); } } };
  };
}

// A single media element owns a reading. Slider changes ONLY update media
// properties: no cancel/speak, source replacement, seeking, or extra play calls.
export function createNarrationController({ createAudio, loadAudio, onState, onDucking = () => {}, startTimeout = 60000 }) {
  let revision = 0;
  let disposed = false;
  let audio = null;
  let resource = null;
  let request = null;
  let timer;
  let text = "";
  let preferences = sanitizePreferences({});
  const duck = (active) => { try { onDucking(active); } catch { /* Written access remains available. */ } };
  const release = () => {
    clearTimeout(timer);
    request?.abort(); request = null;
    if (audio) {
      audio.onplaying = audio.onwaiting = audio.onended = audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio = null;
    }
    resource?.release(); resource = null;
  };
  const applyPreferences = () => {
    if (!audio) return;
    audio.volume = preferences.speechVolume;
    audio.playbackRate = preferences.speechRate;
    audio.preservesPitch = true;
  };
  const cancel = (notify = true) => {
    revision++;
    release();
    duck(false);
    if (notify) onState({ text, speaking: false, message: text ? "Reading stopped. The transcript is still available." : "" });
  };
  const speak = async (content, options = {}) => {
    if (disposed) return;
    const session = ++revision;
    release();
    duck(false);
    text = content.trim();
    preferences = sanitizePreferences({ ...preferences, ...options });
    if (!text) { onState({ text, speaking: false, message: "There is no text to read yet." }); return; }
    const owned = () => !disposed && session === revision;
    const finish = (message) => {
      if (!owned()) return;
      revision++;
      release();
      duck(false);
      onState({ text, speaking: false, message });
    };
    onState({ text, speaking: true, message: "Preparing narration…" });
    request = new AbortController();
    timer = setTimeout(() => finish("Narration took too long to prepare. The transcript is still available."), startTimeout);
    try {
      const prepared = await loadAudio(text, { signal: request.signal });
      if (!owned()) { prepared.release(); return; }
      resource = prepared;
      audio = createAudio();
      applyPreferences();
      audio.preload = "auto";
      audio.src = resource.url;
      let announced = false;
      const playing = () => {
        if (!owned() || announced) return;
        announced = true;
        clearTimeout(timer);
        duck(true);
        onState({ text, speaking: true, message: "Reading aloud. Music is quieter during narration." });
      };
      audio.onplaying = playing;
      audio.onwaiting = () => { if (owned()) { announced = false; onState({ text, speaking: true, message: "Buffering narration…" }); } };
      audio.onended = () => finish("Reading finished. The transcript is still available.");
      audio.onerror = () => finish("Narration could not play. The transcript is still available.");
      await audio.play();
      if (owned()) playing();
    } catch (error) {
      if (owned()) finish(error?.name === "NotAllowedError" ? "Your browser blocked audio. Press Read aloud again to start narration."
        : error instanceof Error ? error.message : "Narration could not start. The transcript is still available.");
    }
  };
  const updatePreferences = (options) => {
    if (disposed) return;
    preferences = sanitizePreferences({ ...preferences, ...options });
    applyPreferences();
  };
  return { speak, updatePreferences, cancel: () => cancel(), dispose() { disposed = true; cancel(false); } };
}
