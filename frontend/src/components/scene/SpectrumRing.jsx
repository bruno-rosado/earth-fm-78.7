// SpectrumRing: the music's frequency spectrum drawn as glowing bars in a circle
// around the globe, mirrored left/right, low notes at the top. It always
// is turned to face the camera every frame.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { sonification } from '../../services/tone/sonificationState';

const BARS = 120; // total, mirrored as 2 x 60
const HALF = BARS / 2;

const SpectrumRing = ({ radius = 1.3 }) => {
    const meshRef = useRef();
    const values = useMemo(() => new Float32Array(HALF), []);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colors = useMemo(() => {
        const low = new THREE.Color('#7cc4ff');
        const high = new THREE.Color('#ff8a3d');
        const mid = new THREE.Color('#b892ff');
        return Array.from({ length: HALF }, (_, i) => {
            const t = i / (HALF - 1);
            return (t < 0.5 ? low.clone().lerp(mid, t * 2) : mid.clone().lerp(high, (t - 0.5) * 2)).multiplyScalar(1.5); // a little over 1 so bloom picks it up
        });
    }, []);

    useFrame((state, delta) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        mesh.quaternion.copy(state.camera.quaternion); // keep the ring flat to the viewer
        const spectrum = sonification.active ? sonification.getSpectrum() : null;
        const time = state.clock.elapsedTime;
        for (let i = 0; i < HALF; i++) {
            let target = 0.015 + 0.01 * Math.sin(time * 1.5 + i * 0.4); // idle shimmer
            if (spectrum) {
                // Spread the musical range (lower bins) across the ring.
                const bin = Math.min(spectrum.length - 1, 1 + Math.floor(Math.pow(i / HALF, 1.6) * 40));
                // Tilt toward highs so the bass doesn't drown out the rest.
                const tilt = 0.55 + 0.75 * (i / HALF);
                target = Math.max(target, THREE.MathUtils.clamp((spectrum[bin] + 92) / 70, 0, 1) * 0.3 * tilt);
            }
            values[i] += (target - values[i]) * Math.min(1, delta * (target > values[i] ? 18 : 5));
        }
        for (let b = 0; b < BARS; b++) {
            const i = b < HALF ? b : BARS - 1 - b;
            // Start at the top and go round both sides to the bottom (the dock sits there).
            const angle = Math.PI / 2 + (b / BARS) * Math.PI * 2 + Math.PI / BARS;
            const length = values[i];
            dummy.position.set(Math.cos(angle) * (radius + length / 2), Math.sin(angle) * (radius + length / 2), 0);
            dummy.rotation.set(0, 0, angle - Math.PI / 2);
            dummy.scale.set(1, Math.max(0.001, length), 1);
            dummy.updateMatrix();
            mesh.setMatrixAt(b, dummy.matrix);
            mesh.setColorAt(b, colors[i]);
        }
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[null, null, BARS]} frustumCulled={false}>
            <planeGeometry args={[0.022, 1]} />
            <meshBasicMaterial transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </instancedMesh>
    );
};

export default SpectrumRing;
