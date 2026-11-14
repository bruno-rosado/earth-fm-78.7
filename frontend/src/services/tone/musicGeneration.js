
import * as Tone from "tone";

export async function playMusic() {

    // Enable browser audio after user interaction
    await Tone.start();

    // Create a PolySynth to support individual notes and chords
    const synth = new Tone.PolySynth(
        Tone.Synth
    ).toDestination();

    // Define a musical sequence
    const notes = [
        ["A3", "C#4", "E4"],  // A Major
        ["B3", "D4", "F#4"],  // B Minor
        ["E4"],               // E
        ["G4"],               // G
        ["A4"],               // A
        ["G4"],               // G
        ["E4"],               // E
        ["D4"]                // D
    ];

    // Define playback timing
    const interval = 0.5;
    const noteDuration = 0.25;

    // Schedule the notes and chords
    const startTime = Tone.now();

    notes.forEach((note, index) => {

        synth.triggerAttackRelease(
            note,
            "8n",
            startTime + index * interval
        );

    });

    // Calculate total playback duration
    const playbackDuration =
        (notes.length - 1) * interval + noteDuration;

    // Clean up after playback finishes
    setTimeout(() => {
        synth.dispose();
    }, (playbackDuration + 1) * 1000);

}
