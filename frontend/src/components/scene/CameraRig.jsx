// CameraRig: glides between a wide shot (globe + jukebox, room for the hero
// text) and a close-up of the globe while a track is open. The pointer adds a
// little parallax so the scene feels alive.
import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const WIDE = { position: [-1.1, 0.15, 6.4], target: [-1.1, 0.15, 0] };
const CLOSE = { position: [0, 0.62, 4.5], target: [0, 0.62, 0] };

const CameraRig = ({ focused }) => {
    const target = useMemo(() => new THREE.Vector3(...WIDE.target), []);
    const goalPosition = useMemo(() => new THREE.Vector3(), []);
    const goalTarget = useMemo(() => new THREE.Vector3(), []);

    useFrame((state, delta) => {
        const shot = focused ? CLOSE : WIDE;
        // Narrow screens: no hero beside the globe, so keep it centered.
        const shift = state.size.width < 760 ? -shot.target[0] : 0;
        goalPosition.set(shot.position[0] + shift + state.pointer.x * 0.25, shot.position[1] + state.pointer.y * 0.15, shot.position[2]);
        goalTarget.set(shot.target[0] + shift, shot.target[1], shot.target[2]);
        const ease = 1 - Math.exp(-delta * 1.8);
        state.camera.position.lerp(goalPosition, ease);
        target.lerp(goalTarget, ease);
        state.camera.lookAt(target);
    });
    return null;
};

export default CameraRig;
