import { fakeTracks } from "./fakeData";

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

// Returns fake tracks for now (async, like a real fetch would be).
export const getTracks = async () => fakeTracks;
// When Dev 1's endpoint exists, replace the line above with:
// export const getTracks = () => getJson("/api/tracks");

// TODO (when Dev 1's endpoints exist):
// export const getTrack = (id) => getJson(`/api/tracks/${id}`);
// export const getFeatures = (id) => getJson(`/api/tracks/${id}/features`);
