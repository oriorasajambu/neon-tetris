import assert from 'node:assert/strict';
import { ACTIONS } from '../js/constants.js';
import { GameEngine } from '../js/engine.js';
import { ReplayRecorder, ReplayPlayer } from '../js/replay.js';

export function runReplayTests() {
    const seed = 424242;
    const engine1 = new GameEngine();
    const recorder = new ReplayRecorder(seed);
    engine1.startNewGame(seed);

    const scripted = [
        [2, ACTIONS.LEFT],
        [4, ACTIONS.ROTATE_CW],
        [6, ACTIONS.HARD_DROP],
        [10, ACTIONS.HOLD],
        [14, ACTIONS.RIGHT],
        [18, ACTIONS.HARD_DROP],
        [24, ACTIONS.ROTATE_CCW],
        [30, ACTIONS.HARD_DROP]
    ];

    let idx = 0;
    for (let f = 0; f < 50; f++) {
        while (idx < scripted.length && scripted[idx][0] <= engine1.frameCount) {
            const action = scripted[idx][1];
            recorder.record(engine1.frameCount, action);
            if (action === ACTIONS.LEFT) engine1.move(-1);
            else if (action === ACTIONS.RIGHT) engine1.move(1);
            else if (action === ACTIONS.HARD_DROP) engine1.hardDrop();
            else if (action === ACTIONS.ROTATE_CW) engine1.rotate(1);
            else if (action === ACTIONS.ROTATE_CCW) engine1.rotate(-1);
            else if (action === ACTIONS.HOLD) engine1.hold();
            idx++;
        }
        engine1.stepFrame();
    }

    const saved = recorder.serialize({ finalScore: engine1.score, lines: engine1.lines });

    const engine2 = new GameEngine();
    const player = new ReplayPlayer(engine2, saved);
    player.start();
    for (let f = 0; f < 50; f++) {
        player.step();
    }

    assert.equal(engine2.score, engine1.score, 'Replay score must match original');
    assert.equal(engine2.lines, engine1.lines, 'Replay lines must match original');
    assert.deepEqual(
        engine2.board.grid.map((r) => Array.from(r)),
        engine1.board.grid.map((r) => Array.from(r)),
        'Replay board state must match original deterministically'
    );
}
