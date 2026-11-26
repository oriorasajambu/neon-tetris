import { ACTIONS, GAME_STATES } from './constants.js';

/**
 * Records [frameNumber, actionId] tuples for deterministic replay playback.
 */
export class ReplayRecorder {
    constructor(seed) {
        this.seed = seed;
        this.inputs = [];
    }

    record(frameNumber, actionId) {
        this.inputs.push([frameNumber, actionId]);
    }

    serialize({ finalScore = 0, lines = 0 } = {}) {
        return {
            version: 1,
            seed: this.seed,
            inputs: this.inputs,
            finalScore,
            lines,
            date: new Date().toISOString()
        };
    }
}

/**
 * Applies a single recorded action ID to a GameEngine instance.
 */
export function applyReplayAction(engine, actionId) {
    switch (actionId) {
        case ACTIONS.LEFT: engine.move(-1); break;
        case ACTIONS.RIGHT: engine.move(1); break;
        case ACTIONS.SOFT_DROP: engine.softDropping = true; break;
        case ACTIONS.HARD_DROP: engine.hardDrop(); break;
        case ACTIONS.ROTATE_CW: engine.rotate(1); break;
        case ACTIONS.ROTATE_CCW: engine.rotate(-1); break;
        case ACTIONS.HOLD: engine.hold(); break;
        default: break;
    }
}

/**
 * Replays a recorded game deterministically on a GameEngine.
 */
export class ReplayPlayer {
    constructor(engine, replayData) {
        this.engine = engine;
        this.replayData = replayData;
        this.inputIndex = 0;
        this.speed = 1;
        this.paused = false;
        this.totalFrames = replayData.inputs.length > 0
            ? replayData.inputs[replayData.inputs.length - 1][0] + 60
            : 60;
    }

    start() {
        this.inputIndex = 0;
        this.paused = false;
        this.engine.replayMode = true;
        this.engine.startNewGame(this.replayData.seed);
        this.engine.state = GAME_STATES.PLAYING;
    }

    step() {
        if (this.paused || this.engine.state === GAME_STATES.GAME_OVER) {
            return;
        }

        const currentFrame = this.engine.frameCount;
        while (
            this.inputIndex < this.replayData.inputs.length &&
            this.replayData.inputs[this.inputIndex][0] <= currentFrame
        ) {
            const [, actionId] = this.replayData.inputs[this.inputIndex];
            applyReplayAction(this.engine, actionId);
            this.inputIndex++;
        }

        this.engine.stepFrame();
    }

    /**
     * Deterministically seeks to targetFrame by re-simulating from frame 0.
     */
    seekTo(targetFrame) {
        this.start();
        while (this.engine.frameCount < targetFrame && this.engine.state !== GAME_STATES.GAME_OVER) {
            this.step();
        }
    }
}
