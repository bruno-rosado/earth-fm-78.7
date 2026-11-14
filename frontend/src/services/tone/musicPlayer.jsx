import { playMusic } from "./musicGeneration";

function MusicPlayer(){

    return (
        <div>
        <h2>
            "Example Music Player"
        </h2>

        <button onClick={playMusic}>
            -Play Some Music-
        </button>
    </div>

    );
}

export default MusicPlayer;
