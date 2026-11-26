import assert from 'node:assert/strict';
import { GAME_MODES, GAME_STATES, SPRINT_TARGET_LINES, ULTRA_DURATION_FRAMES } from '../js/constants.js';
import { GameEngine, calculateClearScore, calculateAttack } from '../js/engine.js';

export function runCompetitiveTests() {
    // 1. B2B 1.5x & Combo scoring
    const tetrisNoB2B = calculateClearScore({ lines: 4, tSpin: 'none', allClear: false, level: 1, b2b: false, combo: 0 });
    const tetrisB2B = calculateClearScore({ lines: 4, tSpin: 'none', allClear: false, level: 1, b2b: true, combo: 2 });
    assert.equal(tetrisNoB2B.points, 800);
    assert.equal(tetrisB2B.points, 1200 + 100); // 1.5x + 50*2*1
    assert.ok(tetrisB2B.label.includes('B2B'));

    // 2. Attack calculation
    const atk = calculateAttack({ lines: 4, tSpin: 'none', allClear: false, b2b: true, combo: 3 });
    assert.equal(atk, 4 + 1 + 1); // Tetris 4 + B2B 1 + Combo3 (1)

    // 3. 180-degree rotation
    const engine = new GameEngine();
    engine.startNewGame(12345);
    const startRot = engine.activePiece.rotation;
    assert.equal(engine.rotate(2), true);
    assert.equal(engine.activePiece.rotation, (startRot + 2) % 4);

    // 4. IRS & IHS buffering during LINE_CLEARING
    engine.state = GAME_STATES.LINE_CLEARING;
    assert.equal(engine.bufferInput('hold'), true);
    assert.equal(engine.bufferInput('rotate', 1), true);
    const prevHold = engine.holdType;
    engine.state = GAME_STATES.PLAYING;
    engine.spawnNextPiece();
    assert.ok(engine.holdType !== prevHold, 'Buffered IHS must swap hold on spawn');
    assert.equal(engine.activePiece.rotation, 1, 'Buffered IRS must rotate piece on spawn');

    // 5. Soft Drop Factor INF (999)
    engine.startNewGame(999, { sdf: 999 });
    engine.softDropping = true;
    engine.stepFrame();
    assert.equal(engine.isGrounded, true, 'INF SDF should drop active piece to ground in 1 frame');

    // 6. 40L Sprint instant victory & timer start on input
    const sprint = new GameEngine();
    sprint.startNewGame(101, { mode: GAME_MODES.SPRINT });
    assert.equal(sprint.timerStarted, false);
    sprint.stepFrame();
    assert.equal(sprint.elapsedFrames, 0, 'Sprint timer must not advance before first input');
    sprint.move(-1);
    assert.equal(sprint.timerStarted, true);
    sprint.lines = SPRINT_TARGET_LINES - 1;
    // Fill bottom row except col 0..3 and drop I piece
    sprint.board.reset();
    for (let x = 4; x < 10; x++) sprint.board.grid[0][x] = 1;
    sprint.spawnNextPiece('I');
    sprint.activePiece.x = 0;
    sprint.hardDrop();
    assert.equal(sprint.state, GAME_STATES.VICTORY, 'Sprint must finish immediately on 40th line');

    // 7. Ultra 2M timer end
    const ultra = new GameEngine();
    ultra.startNewGame(202, { mode: GAME_MODES.ULTRA });
    ultra.move(1);
    ultra.elapsedFrames = ULTRA_DURATION_FRAMES - 1;
    ultra.stepFrame();
    assert.equal(ultra.state, GAME_STATES.VICTORY);

    // 8. Zen recovers from top-out
    const zen = new GameEngine();
    zen.startNewGame(303, { mode: GAME_MODES.ZEN });
    for (let x = 0; x < 10; x++) zen.board.grid[21][x] = 1;
    assert.equal(zen.spawnNextPiece('T'), true);
    assert.equal(zen.state, GAME_STATES.PLAYING);
}
