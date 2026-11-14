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

const trackUrl = (id) => `/api/tracks/${encodeURIComponent(id)}`;
export const getHello = () => requestJson("/api/hello");
export const getTracks = () => requestJson("/api/tracks");
export const getTrack = (id, options) => requestJson(trackUrl(id), options);
export const getFeatures = (id, options) => requestJson(`${trackUrl(id)}/features`, options);
export const getMusicConfig = (id, options) => requestJson(`${trackUrl(id)}/music-config`, options);
export const generateMusicConfig = (id, prompt, options = {}) => requestJson(`${trackUrl(id)}/music-config`, {
  ...options,
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt }),
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
