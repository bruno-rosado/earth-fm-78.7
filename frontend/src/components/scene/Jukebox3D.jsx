// Jukebox3D: a row of cards on a gentle arc below the globe. Scroll or use arrow keys to browse.
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import AlbumCard3D from './AlbumCard3D';

const RADIUS = 10;    // bigger = flatter arc
const SPACING = 0.22; // angle (radians) between neighboring cards

// hidden: slide the cards down out of view (while a track is open).
const Jukebox3D = ({ tracks, selectedTrack, onSelect, hidden = false }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const lastWheel = useRef(0);
    const groupRef = useRef();

    useFrame((state, delta) => {
        const group = groupRef.current;
        group.position.y = THREE.MathUtils.lerp(group.position.y, hidden ? -5 : -1.9, 1 - Math.exp(-delta * 3));
        group.visible = group.position.y > -4.8;
    });

    // Start in the middle of the list. Tracks load async (empty at first render),
    // so we wait until they arrive, then center on the middle card.
    useEffect(() => {
        if (tracks.length > 0 && !selectedTrack) {
            setActiveIndex(Math.floor(tracks.length / 2));
        }
    }, [tracks.length]);

    // Keep the middle card in sync if the selected track changes elsewhere.
    useEffect(() => {
        const i = tracks.findIndex((t) => t.id === selectedTrack?.id);
        if (i >= 0) setActiveIndex(i);
    }, [selectedTrack, tracks]);

    // Mouse wheel + keyboard listeners on the window.
    useEffect(() => {
        const move = (dir) =>
            setActiveIndex((i) => Math.max(0, Math.min(tracks.length - 1, i + dir)));

        if (hidden) return undefined;
        const onWheel = (e) => {
            if (e.target.closest?.('.ui-layer, .topbar')) return; // scrolling the overlay UI
            const now = Date.now();
            if (now - lastWheel.current < 150) return; // one step per 150ms (wheels fire a lot)
            lastWheel.current = now;
            move(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1);
        };
        const onKey = (e) => {
            // Leave keys alone in form controls, and don't steal Enter from buttons.
            if (e.target.closest?.('input, textarea, select')) return;
            if (e.key === 'Enter' && e.target.closest?.('button, summary')) return;
            if (e.key === 'ArrowRight') move(1);
            else if (e.key === 'ArrowLeft') move(-1);
            else if (e.key === 'Enter' && tracks[activeIndex]) onSelect(tracks[activeIndex]);
        };
        window.addEventListener('wheel', onWheel);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('wheel', onWheel);
            window.removeEventListener('keydown', onKey);
        };
    }, [tracks, activeIndex, onSelect, hidden]);

    return (
        // Lowered so the cards sit under the globe.
        <group ref={groupRef} position={[0, -1.9, 0]}>
            {tracks.map((track, i) => (
                <AlbumCard3D
                    key={track.id}
                    track={track}
                    index={i}
                    activeIndex={activeIndex}
                    isSelected={selectedTrack?.id === track.id}
                    onSelect={onSelect}
                    radius={RADIUS}
                    spacing={SPACING}
                />
            ))}
        </group>
    );
};

export default Jukebox3D;
