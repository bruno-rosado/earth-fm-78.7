// Scene: the full-page 3D view. Holds the background, lights, globe and jukebox.
import { Canvas } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { getBackground } from './backgrounds';
import Globe from './Globe';
import Jukebox3D from './Jukebox3D';
import '../../styles/components/scene.css';

// Props: tracks (array), selectedTrack (object or null), onSelect(track).
const Scene = ({ tracks, selectedTrack, onSelect }) => {
    // Pick the background for the selected track (default: aurora).
    const Background = getBackground(selectedTrack?.background);

    return (
        // Canvas has no size of its own; it fills this wrapper (see scene.css).
        <div className="scene-container">
            <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
                <color attach="background" args={["#02010a"]} />

                {/* ambientLight = soft light everywhere; directionalLight = like the sun. */}
                <ambientLight intensity={0.6} />
                <directionalLight color="white" intensity={2} position={[3, 2, 5]} />

                <Stars radius={50} depth={20} count={2000} fade />

                {/* key = track id: when it changes React re-creates the background, so it fades in again. */}
                <Background key={selectedTrack?.id ?? 'none'} />

                <Globe videoUrl={selectedTrack?.videoUrl} />
                <Jukebox3D tracks={tracks} selectedTrack={selectedTrack} onSelect={onSelect} />
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
