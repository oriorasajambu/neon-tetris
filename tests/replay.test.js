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

    // Replay v2: Soft-drop press/release + ROTATE_180 + WALL_SNAP determinism
    const e3 = new GameEngine();
    const rec2 = new ReplayRecorder(98765, { mode: 'marathon', tuning: { sdf: 10 } });
    e3.startNewGame(98765, { mode: 'marathon', sdf: 10 });
    const v2Script = [
        [1, ACTIONS.SOFT_DROP],
        [4, ACTIONS.ROTATE_180],
        [7, ACTIONS.SOFT_DROP_END],
        [9, ACTIONS.WALL_SNAP_LEFT],
        [12, ACTIONS.HARD_DROP]
    ];
    let v2Idx = 0;
    for (let f = 0; f < 25; f++) {
        while (v2Idx < v2Script.length && v2Script[v2Idx][0] <= e3.frameCount) {
            const act = v2Script[v2Idx][1];
            rec2.record(e3.frameCount, act);
            if (act === ACTIONS.SOFT_DROP) e3.softDropping = true;
            else if (act === ACTIONS.SOFT_DROP_END) e3.softDropping = false;
            else if (act === ACTIONS.ROTATE_180) e3.rotate(2);
            else if (act === ACTIONS.WALL_SNAP_LEFT) e3.wallSnap(-1);
            else if (act === ACTIONS.HARD_DROP) e3.hardDrop();
            v2Idx++;
        }
        e3.stepFrame();
    }

    const savedV2 = rec2.serialize({ finalScore: e3.score, lines: e3.lines });
    assert.equal(savedV2.version, 2);

    const e4 = new GameEngine();
    const player2 = new ReplayPlayer(e4, savedV2);
    player2.start();
    for (let f = 0; f < 25; f++) {
        player2.step();
    }
    assert.equal(e4.softDropping, false, 'Soft drop release must be replayed deterministically');
    assert.equal(e4.score, e3.score);
    assert.deepEqual(
        e4.board.grid.map((r) => Array.from(r)),
        e3.board.grid.map((r) => Array.from(r))
    );
}
