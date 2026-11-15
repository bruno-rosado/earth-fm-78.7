// Keep backend URLs and error handling in one place.
async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(typeof body.detail === "string" ? body.detail : `Request failed: HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return body;
}

// Every track with everything the player needs: metadata, features, summary, default config.
export const getTracks = () => requestJson("/api/tracks");
// Vibe change: send the track's metadata and summary (not the features) with the prompt;
// returns a new style for Tone.js.
export const generateMusicConfig = (track, prompt, options = {}) => {
  const { features, summary, config, config_source, ...metadata } = track;
  return requestJson("/api/music-config", {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track: metadata, summary, prompt }),
  });
};
export const removeTrack = (id) => fetch(`/api/tracks/${encodeURIComponent(id)}`, { method: "DELETE" }).then((response) => {
  if (!response.ok) throw new Error("Could not remove that track.");
});

// NASA search and imports. An import downloads a visualization's video, analyzes
// it, and adds it to the track list; poll getImport until status is "done".
export const searchNasa = (query, options) => requestJson(`/api/search?q=${encodeURIComponent(query)}`, options);
export const getRecommendations = (options) => requestJson("/api/recommendations", options);
export const startImport = (nasaId) => requestJson("/api/imports", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nasa_id: nasaId }),
});
export const getImport = (jobId, options) => requestJson(`/api/imports/${encodeURIComponent(jobId)}`, options);
