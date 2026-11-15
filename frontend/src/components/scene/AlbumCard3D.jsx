// AlbumCard3D: one card in the jukebox. A rounded plane showing the cover (or a color) with the title below.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

const SIZE = 1.5;
// Border thickness on each side of the selected card (in 3D units; card is 1.5 wide).
const BORDER = 0.05;

// Build a rounded-rectangle 2D shape (a plane can't have rounded corners).
function roundedRect(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
}

// ShapeGeometry UVs are raw positions; rescale them to 0-1 so a texture fills the card.
function fitUvs(geometry, size) {
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) / size + 0.5, uv.getY(i) / size + 0.5);
    }
    return geometry;
}

// Long NASA titles get cut at a word boundary so they fit on the card.
const shortTitle = (title) => (title.length <= 44 ? title : `${title.slice(0, 44).replace(/\s+\S*$/, "")}…`);

// index: this card's place in the list. activeIndex: the card in the middle.
const AlbumCard3D = ({ track, index, activeIndex, isSelected, onSelect, radius, spacing }) => {
    const groupRef = useRef();
    const smooth = useRef(index - activeIndex); // smoothed offset from the center
    const [hovered, setHovered] = useState(false);
    const geometry = useMemo(() => fitUvs(new THREE.ShapeGeometry(roundedRect(SIZE, SIZE, 0.12)), SIZE), []);
    const [cover, setCover] = useState(null);

    // Load the cover without suspending the scene; a missing cover keeps the plain color.
    useEffect(() => {
        if (!track.cover) return undefined;
        let texture = null;
        let cancelled = false;
        new THREE.TextureLoader().load(track.cover, (loaded) => {
            texture = loaded;
            if (cancelled) { loaded.dispose(); return; }
            loaded.colorSpace = THREE.SRGBColorSpace;
            setCover(loaded);
        }, undefined, () => {});
        return () => {
            cancelled = true;
            texture?.dispose();
            setCover(null);
        };
    }, [track.cover]);
    const borderGeometry = useMemo(() => new THREE.ShapeGeometry(roundedRect(SIZE + BORDER * 2, SIZE + BORDER * 2, 0.12 + BORDER)), []);

    useFrame((state, delta) => {
        // Lerp = move a fraction of the way to the target each frame -> smooth scrolling.
        smooth.current = THREE.MathUtils.lerp(smooth.current, index - activeIndex, Math.min(1, delta * 8));
        const angle = smooth.current * spacing;
        const g = groupRef.current;
        g.position.x = Math.sin(angle) * radius;
        g.position.z = Math.cos(angle) * radius - radius;
        g.rotation.y = -angle; // turn to face the camera
        // Cards shrink as they move away from the middle, so a long row stays compact.
        g.scale.setScalar(1 - Math.min(0.45, Math.abs(smooth.current) * 0.16));
        // Hover lifts the card slightly.
        const targetY = hovered ? 0.15 : 0;
        g.position.y = THREE.MathUtils.lerp(g.position.y, targetY, Math.min(1, delta * 10));
    });

    return (
        <group
            ref={groupRef}
            onClick={() => onSelect(track)}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
        >
            {/* White border behind the card, shown only when selected. */}
            {isSelected && (
                <mesh geometry={borderGeometry} position={[0, 0, -0.01]}>
                    {/* Semi-transparent white: color is rgb, see-through amount is opacity (0 = invisible, 1 = solid). */}
                    <meshBasicMaterial color="rgb(255, 255, 255)" transparent opacity={0.5} />
                </mesh>
            )}
            <mesh geometry={geometry}>
                {/* key: recreate the material when the cover arrives so its shader includes the map. */}
                <meshBasicMaterial key={cover ? 'cover' : 'color'} map={cover} color={cover ? '#d9d9d9' : track.color ?? 'rgb(29, 125, 224)'} toneMapped={false} />
            </mesh>
            {cover ? (
                <Text position={[0, -SIZE / 2 + 0.1, 0.01]} fontSize={0.1} maxWidth={SIZE - 0.2} textAlign="center" color="white" anchorX="center" anchorY="bottom" outlineWidth={0.012} outlineColor="black" outlineOpacity={0.8}>
                    {shortTitle(track.title)}
                </Text>
            ) : (
                <Text position={[0, 0, 0.01]} fontSize={0.13} maxWidth={SIZE - 0.2} textAlign="center" color="white" anchorX="center" anchorY="middle">
                    {track.title}
                </Text>
            )}
        </group>
    );
};

export default AlbumCard3D;
