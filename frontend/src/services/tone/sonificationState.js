// Live playback state shared between the audio engine, the 3D scene, and the UI.
// Read it inside animation frames, not through React state.
export const sonification = {
  active: false, // a track's playback exists (playing or paused)
  getTime: () => 0, // track time in seconds
  getLevel: () => 0, // output loudness, 0-1
  getSpectrum: () => null, // Float32Array of decibels, low to high frequency
  chord: "", // name of the chord now sounding, e.g. "Bm"
  toggle: null, // play/pause, set by the player so the globe can be clicked
  // One entry per latitude band, north first. The engine raises `level` when a
  // band plays a note; the scene decays it back toward 0.
  bands: Array.from({ length: 8 }, () => ({ level: 0, warmth: 0.5 })),
  // Notes waiting to be drawn as ripples on the globe: { row, u, warmth, velocity }.
  ripples: [],
};

export function resetBands(count) {
  sonification.bands = Array.from({ length: count }, () => ({ level: 0, warmth: 0.5 }));
  sonification.ripples.length = 0;
  sonification.chord = "";
}
