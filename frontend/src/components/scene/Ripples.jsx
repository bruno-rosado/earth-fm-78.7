// Ripples: each note blooms as a ring on the globe where its data came from
// (its latitude band, at the scan line), colored by water temperature. Rings
// are attached to the turning globe so they stay on their spot of ocean.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sonification } from '../../services/tone/sonificationState';

const POOL = 48;
const LIFE = 1.6; // seconds
const COLD = new THREE.Color('#4cc9f0');
const MILD = new THREE.Color('#9dff8a');
const WARM = new THREE.Color('#ff7b39');
const FORWARD = new THREE.Vector3(0, 0, 1);

// three.js sphere coordinates for a map position u (0-1 from 180°W) and latitude.
function surfacePoint(u, latDegrees, radius, out) {
    const phi = u * Math.PI * 2;
    const theta = THREE.MathUtils.degToRad(90 - latDegrees);
    return out.set(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).multiplyScalar(radius);
}

const Ripples = ({ radius = 1.008 }) => {
    const meshes = useRef([]);
    const state = useMemo(() => Array.from({ length: POOL }, () => ({ age: LIFE, strength: 0 })), []);
    const next = useRef(0);
    const scratch = useMemo(() => new THREE.Vector3(), []);

    useFrame((_, delta) => {
        const rows = sonification.bands.length;
        // Spawn rings for notes the engine just played.
        while (sonification.ripples.length) {
            const note = sonification.ripples.shift();
            const index = next.current++ % POOL;
            const mesh = meshes.current[index];
            if (!mesh) continue;
            const lat = 90 - ((note.row + 0.5) * 180) / rows;
            surfacePoint(note.u, lat, radius, scratch);
            mesh.position.copy(scratch);
            mesh.quaternion.setFromUnitVectors(FORWARD, scratch.normalize());
            const color = note.warmth < 0.5
                ? COLD.clone().lerp(MILD, note.warmth * 2)
                : MILD.clone().lerp(WARM, (note.warmth - 0.5) * 2);
            mesh.material.color.copy(color).multiplyScalar(1.6); // glow without washing out the data
            state[index].age = 0;
            state[index].strength = Math.min(1, 0.4 + note.velocity * 1.4);
        }
        state.forEach((ring, index) => {
            const mesh = meshes.current[index];
            if (!mesh) return;
            ring.age = Math.min(LIFE, ring.age + delta);
            const t = ring.age / LIFE;
            mesh.visible = t < 1 && sonification.active;
            if (!mesh.visible) return;
            const eased = 1 - Math.pow(1 - t, 3);
            mesh.scale.setScalar(0.02 + eased * 0.16 * (0.6 + ring.strength * 0.6));
            mesh.material.opacity = (1 - t) * ring.strength * 0.7;
        });
    });

    return Array.from({ length: POOL }, (_, index) => (
        <mesh key={index} visible={false} ref={(mesh) => { meshes.current[index] = mesh; }}>
            <ringGeometry args={[0.78, 1, 48]} />
            <meshBasicMaterial transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
    ));
};

export default Ripples;
