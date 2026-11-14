// Live playback state shared between the audio engine and the 3D scene.
// Read it inside useFrame (every frame), not through React state.
export const sonification = {
  active: false, // a track's playback exists (playing or paused)
  getTime: () => 0, // track time in seconds
  getLevel: () => 0, // output loudness, 0-1
  // One entry per latitude band, north first. The engine raises `level` when a
  // band plays a note; the scene decays it back toward 0.
  bands: Array.from({ length: 8 }, () => ({ level: 0, warmth: 0.5 })),
};

export function resetBands(count) {
  sonification.bands = Array.from({ length: count }, () => ({ level: 0, warmth: 0.5 }));
}
