// Globe: a sphere showing a plain Earth texture, or a track's video faded in on top.
import { useEffect, useRef, useState } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

const Globe = ({ videoUrl, playbackVideoRef }) => {
    const earthTexture = useLoader(THREE.TextureLoader, '/textures/earth-3.png');
    earthTexture.colorSpace = THREE.SRGBColorSpace; // correct colors for photos

    const groupRef = useRef();
    const videoMatRef = useRef();
    // MusicPlayer calls play()/pause() through the shared ref.
    const localVideoRef = useRef(null);
    const videoRef = playbackVideoRef ?? localVideoRef;
    const [videoTexture, setVideoTexture] = useState(null);

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
        // MusicPlayer owns starting and stopping the shared video element.
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
    }, [videoUrl, videoRef]);

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
