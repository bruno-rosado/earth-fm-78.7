// Globe: a sphere showing a plain Earth texture, or a track's video faded in on top.
// While music plays, the globe turns with the scan position, a scan line marks the
// longitude being heard, and a marker on each latitude band pulses when it plays.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { globeRotationFor, scanPosition } from '../../services/tone/musicMapping';
import { sonification } from '../../services/tone/sonificationState';
import Ripples from './Ripples';
import SpectrumRing from './SpectrumRing';

const RADIUS = 1;
const MARKER_RADIUS = 1.025;
const COLD = new THREE.Color('#4cc9f0');
const WARM = new THREE.Color('#ff7b39');
const IDLE_SPIN = 0.1; // radians per second when nothing is playing

// Shortest signed angle from a to b, so the globe never spins the long way round.
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// Soft glow around the planet, drawn on the back of a larger sphere: strongest
// just outside the surface and fading to nothing at the outer edge.
const atmosphereVertex = /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
        vec4 world = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-world.xyz);
        gl_Position = projectionMatrix * world;
    }
`;
const atmosphereFragment = /* glsl */ `
    uniform vec3 uColor;
    uniform float uIntensity;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
        float depth = clamp(-dot(vNormal, vView) * 2.2, 0.0, 1.0);
        gl_FragColor = vec4(uColor, pow(depth, 2.5) * uIntensity);
    }
`;

const BandMarkers = () => {
    const meshes = useRef([]);
    const count = sonification.bands.length;
    // Latitude of each band's center, north first.
    const positions = useMemo(() => Array.from({ length: count }, (_, row) => {
        const lat = THREE.MathUtils.degToRad(90 - ((row + 0.5) * 180) / count);
        return [0, Math.sin(lat) * MARKER_RADIUS, Math.cos(lat) * MARKER_RADIUS];
    }), [count]);

    useFrame((state, delta) => {
        sonification.bands.forEach((band, row) => {
            const mesh = meshes.current[row];
            if (!mesh) return;
            band.level *= Math.exp(-delta * 2); // decay after each note
            mesh.scale.setScalar(0.6 + band.level * 1.6);
            mesh.material.opacity = sonification.active ? 0.3 + Math.min(0.7, band.level * 1.4) : 0;
            mesh.material.color.copy(COLD).lerp(WARM, band.warmth).multiplyScalar(1 + band.level * 0.9);
        });
    });

    return positions.map((position, row) => (
        <mesh key={row} position={position} ref={(mesh) => { meshes.current[row] = mesh; }}>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshBasicMaterial transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
    ));
};

const Globe = ({ videoUrl, playbackVideoRef }) => {
    const earthTexture = useLoader(THREE.TextureLoader, '/textures/earth-3.png');
    earthTexture.colorSpace = THREE.SRGBColorSpace; // correct colors for photos

    const groupRef = useRef();
    const videoMatRef = useRef();
    const scanMatRef = useRef();
    const atmosphereRef = useRef();
    // The playback engine drives play/pause through the shared ref.
    const localVideoRef = useRef(null);
    const videoRef = playbackVideoRef ?? localVideoRef;
    const [videoTexture, setVideoTexture] = useState(null);

    const atmosphereUniforms = useMemo(() => ({
        uColor: { value: new THREE.Color('#5aa9ff') },
        uIntensity: { value: 0.35 },
    }), []);

    // Whenever videoUrl changes: make a <video> element and wrap it in a VideoTexture.
    useEffect(() => {
        if (!videoUrl) {
            setVideoTexture(null);
            return;
        }
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.src = videoUrl;
        video.muted = true;
        video.loop = false;
        video.preload = 'auto';
        video.playsInline = true;
        videoRef.current = video;

        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        // Video is re-uploaded every frame: skip mipmaps and anisotropy (wasted GPU work).
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        // Only show the video once it has a frame. If it fails we just stay on Earth.
        const onReady = () => setVideoTexture(texture);
        const onError = () => setVideoTexture(null);
        video.addEventListener('loadeddata', onReady);
        video.addEventListener('error', onError);

        return () => {
            video.removeEventListener('loadeddata', onReady);
            video.removeEventListener('error', onError);
            video.pause();
            video.removeAttribute('src');
            video.load();
            texture.dispose();
            videoRef.current = null;
            setVideoTexture(null);
        };
    }, [videoUrl, videoRef]);

    // Switching between no texture and a texture changes the shader, so recompile it.
    useEffect(() => {
        videoMatRef.current.needsUpdate = true;
    }, [videoTexture]);

    useFrame((state, delta) => {
        const group = groupRef.current;
        const ease = Math.min(1, delta * 3);
        if (sonification.active) {
            // Face the longitude the music is reading. Ease in so starting or seeking glides.
            const target = globeRotationFor(scanPosition(sonification.getTime()));
            group.rotation.y += angleDelta(group.rotation.y, target) * Math.min(1, delta * 5);
        } else {
            group.rotation.y += delta * IDLE_SPIN;
        }

        // Crossfade: video layer opacity toward 1 (video) or 0 (Earth).
        const mat = videoMatRef.current;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, videoTexture ? 1 : 0, ease);
        mat.visible = mat.opacity > 0.01;

        const level = sonification.active ? sonification.getLevel() : 0;
        // The scan line flashes with each melody note, then settles back.
        sonification.pulse *= Math.exp(-delta * 4);
        const scanTarget = sonification.active ? 0.3 + level * 0.3 + sonification.pulse * 0.6 : 0;
        scanMatRef.current.opacity = THREE.MathUtils.lerp(scanMatRef.current.opacity, scanTarget, Math.min(1, delta * 12));
        const atmosphere = atmosphereRef.current.uniforms.uIntensity;
        atmosphere.value = THREE.MathUtils.lerp(atmosphere.value, 0.35 + level * 0.9, Math.min(1, delta * 8));
    });

    return (
        // Positioned up a bit so the jukebox fits below.
        <group position={[0, 0.9, 0]}>
            {/* Clicking the globe plays or pauses the open track. */}
            <group
                ref={groupRef}
                onClick={(e) => { if (sonification.toggle) { e.stopPropagation(); sonification.toggle(); } }}
                onPointerOver={() => { if (sonification.toggle) document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <mesh>
                    <sphereGeometry args={[RADIUS, 64, 64]} />
                    <meshStandardMaterial map={earthTexture} />
                </mesh>
                {/* Video layer: a slightly bigger sphere on top, fading in and out. */}
                <mesh>
                    <sphereGeometry args={[RADIUS * 1.005, 64, 64]} />
                    <meshStandardMaterial ref={videoMatRef} map={videoTexture} transparent opacity={0} emissive="white" emissiveMap={videoTexture} emissiveIntensity={0.35} />
                </mesh>
                <Ripples />
            </group>

            {/* These stay facing the camera while the globe turns underneath. */}
            <mesh>
                <sphereGeometry args={[RADIUS * 1.12, 64, 64]} />
                <shaderMaterial
                    ref={atmosphereRef}
                    vertexShader={atmosphereVertex}
                    fragmentShader={atmosphereFragment}
                    uniforms={atmosphereUniforms}
                    side={THREE.BackSide}
                    transparent
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                />
            </mesh>
            {/* Scan line: a half ring from pole to pole along the front meridian. */}
            <mesh rotation={[0, -Math.PI / 2, -Math.PI / 2]}>
                <torusGeometry args={[MARKER_RADIUS, 0.004, 8, 96, Math.PI]} />
                <meshBasicMaterial ref={scanMatRef} color={[0.9, 1.15, 1.45]} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
            </mesh>
            <BandMarkers />
            <SpectrumRing />
        </group>
    );
};

export default Globe;
