import assert from 'node:assert/strict';
import { GAME_MODES, MAX_GARBAGE_PER_LOCK, CHEESE_INITIAL_ROWS } from '../js/constants.js';
import { GameEngine } from '../js/engine.js';
import { findBestMove } from '../js/ai-core.js';

export function runGarbageAndAiTests() {
    // 1. Garbage cancellation
    const engine = new GameEngine();
    engine.startNewGame(777, { mode: GAME_MODES.VS_AI });
    engine.receiveGarbage(6);
    assert.equal(engine.getPendingGarbageCount(), 6);
    const rem = engine.cancelPendingGarbage(4);
    assert.equal(rem, 0);
    assert.equal(engine.getPendingGarbageCount(), 2);
    const overflow = engine.cancelPendingGarbage(5);
    assert.equal(overflow, 3);
    assert.equal(engine.getPendingGarbageCount(), 0);

    // 2. 8-line per-lock garbage cap
    engine.receiveGarbage(14);
    const topped = engine.applyPendingGarbage();
    assert.equal(topped, false);
    assert.equal(engine.board.countGarbageRows(), MAX_GARBAGE_PER_LOCK);
    assert.equal(engine.getPendingGarbageCount(), 6);

    // 3. Cheese initial rows
    const cheese = new GameEngine();
    cheese.startNewGame(888, { mode: GAME_MODES.CHEESE });
    assert.equal(cheese.board.countGarbageRows(), CHEESE_INITIAL_ROWS);

    // 4. AI core placement validity (1-ply & 2-ply)
    const plan1 = findBestMove({
        grid: engine.board.cloneFlatGrid(),
        pieceType: 'T',
        holdType: 'I',
        nextQueue: ['O', 'L'],
        depth: 1,
        mistakeRate: 0
    });
    assert.ok(plan1 !== null);
    assert.ok(plan1.targetRotation >= 0 && plan1.targetRotation < 4);

    const plan2 = findBestMove({
        grid: engine.board.cloneFlatGrid(),
        pieceType: 'T',
        holdType: 'I',
        nextQueue: ['O', 'L'],
        depth: 2,
        mistakeRate: 0
    });
    assert.ok(plan2 !== null);
}
