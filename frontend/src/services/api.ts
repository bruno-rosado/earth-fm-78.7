import type { CatalogTrack, FeatureSample, TrackDetails, TrackSearchResults } from "../types";

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const body: unknown = await response.json();

  if (!response.ok) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : `Request failed: HTTP ${response.status}`;
    throw new Error(detail);
  }

  return body as T;
}

export const getTracks = (signal?: AbortSignal) =>
  requestJson<CatalogTrack[]>("/api/tracks", signal);

export const getTrack = (id: string, signal?: AbortSignal) =>
  requestJson<TrackDetails>(`/api/tracks/${encodeURIComponent(id)}`, signal);

export const getTrackFeatures = (id: string, signal?: AbortSignal) =>
  requestJson<FeatureSample[]>(`/api/tracks/${encodeURIComponent(id)}/features`, signal);

export const searchTrack = (id: string, signal?: AbortSignal) =>
  requestJson<TrackSearchResults>(`/api/tracks/${encodeURIComponent(id)}/search`, signal);
