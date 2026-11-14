// Effects: bloom post-processing so bright things (scan line, note ripples,
// spectrum, warm water) glow. Uses three.js's own passes, so no extra package.
import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Threshold just under 1: only things deliberately brighter than white glow.
const Effects = ({ strength = 0.9, radius = 0.5, threshold = 0.9 }) => {
    const { gl, scene, camera, size } = useThree();
    const [composer, bloom] = useMemo(() => {
        const effects = new EffectComposer(gl);
        const glow = new UnrealBloomPass(new THREE.Vector2(256, 256), strength, radius, threshold);
        effects.addPass(new RenderPass(scene, camera));
        effects.addPass(glow);
        effects.addPass(new OutputPass()); // tone mapping + sRGB, like a normal render
        return [effects, glow];
    }, [gl, scene, camera]); // strength etc. are applied below without rebuilding

    useEffect(() => {
        bloom.strength = strength;
        bloom.radius = radius;
        bloom.threshold = threshold;
    }, [bloom, strength, radius, threshold]);

    useEffect(() => {
        composer.setPixelRatio(gl.getPixelRatio());
        composer.setSize(size.width, size.height);
    }, [composer, gl, size]);

    useEffect(() => () => composer.dispose(), [composer]);

    // Priority 1 tells R3F we render the frame ourselves.
    useFrame((state, delta) => composer.render(delta), 1);
    return null;
};

export default Effects;
