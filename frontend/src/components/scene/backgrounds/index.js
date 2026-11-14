// Lookup: track.background (a string from the data) -> background component.
// To add a new background: create the component and add it to this object.
import Aurora from './Aurora';

const backgrounds = {
    aurora: Aurora,
};

// Unknown or missing names fall back to Aurora.
export const getBackground = (name) => backgrounds[name] || Aurora;
