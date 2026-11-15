// GLSL shader code for the aurora background. Kept separate so Aurora.jsx stays readable.
// Shaders run on the graphics card. Uniforms (uTime, uLevel) are values we send in from JavaScript.

// Vertex shader: positions the plane's corners. Just passes the UV (0-1 coordinates across the plane) through.
export const auroraVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fragment shader: decides the color of every pixel.
export const auroraFragment = /* glsl */ `
  uniform float uTime;   // seconds since start -> movement
  uniform float uLevel;  // music loudness 0-1 -> speed + brightness
  uniform float uOpacity; // 0-1 -> used to fade the whole background in
  varying vec2 vUv;      // x: 0 left -> 1 right, y: 0 bottom -> 1 top

  // Cheap smooth noise: random-looking but flowing values.
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
               mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }

  void main() {
    float t = uTime;  // uTime is already speed-adjusted in JS (see Aurora.jsx)
    float wave = noise(vec2(vUv.x * 3.0 + t, t * 0.5));  // TWEAK 3.0 = number of curtain folds
    // band = bright where the curtain is, fading out above and below
    float band = smoothstep(0.0, 0.3, vUv.y - wave * 0.5) * smoothstep(1.0, 0.5, vUv.y);
    vec3 green  = vec3(0.1, 1.0, 0.6);                    // TWEAK colors (r, g, b 0-1)
    vec3 purple = vec3(0.6, 0.2, 1.0);
    // Scaled down: the frame goes through a linear -> sRGB output pass, which brightens colors.
    vec3 col = mix(green, purple, vUv.y) * band * (0.4 + uLevel) * 0.32; // louder = brighter
    gl_FragColor = vec4(col, uOpacity * 0.7); // leave the star field visible through the curtain
  }
`;
