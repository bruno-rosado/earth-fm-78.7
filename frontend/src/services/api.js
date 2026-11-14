// All backend calls live here. Components import these functions instead of calling fetch() directly,
// so if a URL changes we fix it in one place. Dev 4 can import from here too.

// Shared helper: GET a URL and return the JSON. Throws if the server returns an error status
// (fetch() alone does NOT throw on 404/500, so we check res.ok ourselves).
async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: HTTP ${res.status}`);
  return res.json();
}

export const getHello = () => getJson("/api/hello");

// Backend tracks look like { id, title, description, cover, video, duration }.
// The scene expects { color, background, videoUrl }, so we map + fill defaults here.
const DEFAULT_COLORS = ["rgb(46, 196, 182)", "rgb(255, 159, 28)", "rgb(123, 44, 191)", "rgb(29, 125, 224)", "rgb(230, 57, 71)"];

const toSceneTrack = (track, i) => ({
  ...track,
  color: track.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length],
  background: track.background ?? "aurora",
  videoUrl: track.videoUrl ?? track.video ?? null,
});

export const getTracks = async () => (await getJson("/api/tracks")).map(toSceneTrack);

export const getTrack = async (id) => toSceneTrack(await getJson(`/api/tracks/${id}`), 0);
export const getFeatures = (id) => getJson(`/api/tracks/${id}/features`);
