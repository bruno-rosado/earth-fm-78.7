// Globe: a sphere showing a plain Earth texture, or a track's video faded in on top.
import { useEffect, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

const Globe = ({ videoUrl }) => {
    const earthTexture = useLoader(THREE.TextureLoader, '/textures/earth-3.png');
    earthTexture.colorSpace = THREE.SRGBColorSpace; // correct colors for photos

    const groupRef = useRef();
    const videoMatRef = useRef();
    // Dev 4 will use this ref later to call play()/pause() on the video.
    const videoRef = useRef(null);
    const [videoTexture, setVideoTexture] = useState(null);

    // Whenever videoUrl changes: make a <video> element and wrap it in a VideoTexture.
    useEffect(() => {
        if (!videoUrl) {
            setVideoTexture(null);
            return;
        }
        const video = document.createElement('video');
        video.src = videoUrl;
        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        // Autoplay for now. Dev 4 will control play/pause via videoRef later.
        video.play().catch(() => {}); // ignore blocked autoplay
        videoRef.current = video;

        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        // Only show the video once it can actually play. If it fails we just stay on Earth.
        const onReady = () => setVideoTexture(texture);
        const onError = () => setVideoTexture(null);
        video.addEventListener('canplay', onReady);
        video.addEventListener('error', onError);

        return () => {
            // Cleanup when the track changes or Globe unmounts.
            video.removeEventListener('canplay', onReady);
            video.removeEventListener('error', onError);
            video.pause();
            video.removeAttribute('src');
            video.load();
            texture.dispose();
            videoRef.current = null;
        };
    }, [videoUrl]);

    useFrame((state, delta) => {
        // Slow rotation.
        groupRef.current.rotation.y += delta * 0.1;
        // Crossfade: lerp the video layer's opacity toward 1 (video) or 0 (Earth).
        const mat = videoMatRef.current;
        const target = videoTexture ? 1 : 0;
        mat.opacity = THREE.MathUtils.lerp(mat.opacity, target, Math.min(1, delta * 3)); // ~1s
        mat.visible = mat.opacity > 0.01;
    });

    return (
        // Positioned up a bit so the jukebox fits below.
        <group ref={groupRef} position={[0, 0.9, 0]}>
            <mesh>
                <sphereGeometry args={[1, 64, 64]} />
                <meshStandardMaterial map={earthTexture} />
            </mesh>
            {/* Video layer: a slightly bigger sphere on top, fading in and out. */}
            <mesh>
                <sphereGeometry args={[1.005, 64, 64]} />
                <meshStandardMaterial ref={videoMatRef} map={videoTexture} transparent opacity={0} />
            </mesh>
        </group>
    );
};

export default Globe;
