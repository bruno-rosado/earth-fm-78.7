// Aurora: a big plane behind the globe, colored by a noise shader that flows and reacts to the music.
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { auroraVertex, auroraFragment } from './auroraShader';

// getLevel: optional function returning music loudness 0-1. Without it, a slow pulse.
const Aurora = ({ getLevel }) => {
    const matRef = useRef();

    // useMemo: create the uniforms object once (not on every React render).
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uLevel: { value: 0.3 },
        uOpacity: { value: 0 }, // starts invisible, fades to 1
    }), []);

    // useFrame runs every frame (~60x/sec). Update uniforms directly, NOT React state (too slow).
    useFrame((state, delta) => { // delta = seconds since last frame
        const time = state.clock.elapsedTime;
        const u = matRef.current.uniforms;
        // Fade in over ~1 second (this component is re-mounted when the track changes, so it restarts at 0).
        u.uOpacity.value = Math.min(1, u.uOpacity.value + delta / 1);
        // Ease toward the target so the shader never jumps.
        const target = getLevel ? getLevel() : 0.3 + 0.1 * Math.sin(time * 0.5);
        u.uLevel.value += (target - u.uLevel.value) * Math.min(1, delta * 4);
        // Add up the animation clock bit by bit: louder = faster, WITHOUT the phase jumping around.
        u.uTime.value += delta * (0.1 + u.uLevel.value * 0.5);
    });

    return (
        // Pushed back to z = -5 so it sits behind the globe (which is at z = 0).
        <mesh position={[0, 0, -5]}>
            {/* 28 x 15 units: fills the background even when the camera pans. */}
            <planeGeometry args={[28, 15]} />
            <shaderMaterial
                ref={matRef}
                vertexShader={auroraVertex}
                fragmentShader={auroraFragment}
                uniforms={uniforms}
                transparent // needed so the alpha (uOpacity) actually fades
            />
        </mesh>
    );
};

export default Aurora;
