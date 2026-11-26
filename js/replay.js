import { ACTIONS, GAME_STATES, GAME_MODES } from './constants.js';

/**
 * Records [frameNumber, actionId] tuples for deterministic replay playback (v2).
 */
export class ReplayRecorder {
    constructor(seed, metadata = {}) {
        this.seed = seed;
        this.mode = metadata.mode || GAME_MODES.MARATHON;
        this.tuning = metadata.tuning || {};
        this.inputs = [];
    }

    record(frameNumber, actionId) {
        this.inputs.push([frameNumber, actionId]);
    }

    serialize({ finalScore = 0, lines = 0, timeMs = 0 } = {}) {
        return {
            version: 2,
            mode: this.mode,
            seed: this.seed,
            tuning: this.tuning,
            inputs: this.inputs,
            finalScore,
            lines,
            timeMs,
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
        case ACTIONS.SOFT_DROP:
            engine.markPlayerInput();
            engine.softDropping = true;
            break;
        case ACTIONS.SOFT_DROP_END:
            engine.softDropping = false;
            break;
        case ACTIONS.HARD_DROP: engine.hardDrop(); break;
        case ACTIONS.ROTATE_CW:
            if (!engine.bufferInput('rotate', 1)) engine.rotate(1);
            break;
        case ACTIONS.ROTATE_CCW:
            if (!engine.bufferInput('rotate', -1)) engine.rotate(-1);
            break;
        case ACTIONS.ROTATE_180:
            if (!engine.bufferInput('rotate', 2)) engine.rotate(2);
            break;
        case ACTIONS.HOLD:
            if (!engine.bufferInput('hold')) engine.hold();
            break;
        case ACTIONS.WALL_SNAP_LEFT: engine.wallSnap(-1); break;
        case ACTIONS.WALL_SNAP_RIGHT: engine.wallSnap(1); break;
        default: break;
    }
}

/**
 * Replays a recorded game deterministically on a GameEngine.
 * Supports both v2 (press/release + mode metadata) and legacy v1 replays.
 */
export class ReplayPlayer {
    constructor(engine, replayData) {
        this.engine = engine;
        this.replayData = replayData;
        this.isLegacyV1 = !replayData.version || replayData.version === 1;
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
        this.engine.startNewGame(this.replayData.seed, {
            mode: this.replayData.mode || GAME_MODES.MARATHON,
            ...(this.replayData.tuning || {})
        });
        this.engine.state = GAME_STATES.PLAYING;
    }

    step() {
        if (
            this.paused ||
            this.engine.state === GAME_STATES.GAME_OVER ||
            this.engine.state === GAME_STATES.VICTORY
        ) {
            return;
        }

        const currentFrame = this.engine.frameCount;
        const prevPieceCount = this.engine.piecesLocked;

        while (
            this.inputIndex < this.replayData.inputs.length &&
            this.replayData.inputs[this.inputIndex][0] <= currentFrame
        ) {
            const [, actionId] = this.replayData.inputs[this.inputIndex];
            applyReplayAction(this.engine, actionId);
            this.inputIndex++;
        }

        this.engine.stepFrame();

        // Legacy v1 adapter: auto-release soft drop when piece locks
        if (this.isLegacyV1 && this.engine.piecesLocked > prevPieceCount) {
            this.engine.softDropping = false;
        }
    }

    /**
     * Deterministically seeks to targetFrame by re-simulating from frame 0.
     */
    seekTo(targetFrame) {
        this.start();
        while (
            this.engine.frameCount < targetFrame &&
            this.engine.state !== GAME_STATES.GAME_OVER &&
            this.engine.state !== GAME_STATES.VICTORY
        ) {
            this.step();
        }
    }
}
