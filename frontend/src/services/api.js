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
