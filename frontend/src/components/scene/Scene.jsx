// Scene: the full-page 3D view. Holds the background, lights, globe and jukebox.
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { getBackground } from './backgrounds';
import Globe from './Globe';
import Jukebox3D from './Jukebox3D';
import CameraRig from './CameraRig';
import Effects from './Effects';
import { sonification } from '../../services/tone/sonificationState';
import '../../styles/components/scene.css';

// The aurora breathes slowly when idle and follows the music's loudness when playing.
const musicLevel = () => (sonification.active ? 0.2 + sonification.getLevel() * 0.8 : 0.25);

// Props: tracks (array), selectedTrack (object or null), onSelect(track).
const Scene = ({ tracks, selectedTrack, onSelect, videoRef }) => {
    // Pick the background for the selected track (default: aurora).
    const Background = getBackground(selectedTrack?.background);

    return (
        // Canvas has no size of its own; it fills this wrapper (see scene.css).
        <div className="scene-container">
            <Canvas camera={{ position: [-1.1, 0.15, 6.4], fov: 50 }} dpr={[1, 2]}>
                <color attach="background" args={["#02010a"]} />

                {/* ambientLight = soft light everywhere; directionalLight = like the sun. */}
                <ambientLight intensity={0.6} />
                <directionalLight color="white" intensity={2} position={[3, 2, 5]} />

                <Stars radius={60} depth={30} count={4000} factor={3.5} saturation={0.4} fade speed={0.6} />

                {/* key = track id: when it changes React re-creates the background, so it fades in again. */}
                <Background key={selectedTrack?.id ?? 'none'} getLevel={musicLevel} />

                <Globe videoUrl={selectedTrack?.video} playbackVideoRef={videoRef} />
                <Jukebox3D tracks={tracks} selectedTrack={selectedTrack} onSelect={onSelect} hidden={Boolean(selectedTrack)} />
                <CameraRig focused={Boolean(selectedTrack)} />
                <Effects />
            </Canvas>

            {/* Hidden from sight but readable by screen readers (the 3D cards can't be). */}
            <ul className="visually-hidden">
                {tracks.map((track) => (
                    <li key={track.id}>
                        <button onClick={() => onSelect(track)}>{track.title}</button>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default Scene;
