import assert from 'node:assert/strict';
import { Board } from '../js/board.js';
import { Tetromino } from '../js/pieces.js';
import { detectTSpin, calculateClearScore } from '../js/engine.js';

export function runScoringTests() {
    // Standard line clears + All-Clear
    assert.equal(calculateClearScore({ lines: 1, tSpin: 'none', allClear: false, level: 2 }).points, 200);
    assert.equal(calculateClearScore({ lines: 4, tSpin: 'none', allClear: false, level: 3 }).points, 2400);
    assert.equal(calculateClearScore({ lines: 4, tSpin: 'none', allClear: true, level: 1 }).points, 3800);

    // T-Spin Double
    assert.equal(calculateClearScore({ lines: 2, tSpin: 'full', allClear: false, level: 2 }).points, 2400);

    // 3-corner T-Spin detection
    const board = new Board();
    const t = new Tetromino('T');
    t.x = 3;
    t.y = 0;
    t.rotation = 2; // pointing down
    t.lastMoveWasRotation = true;
    t.lastKickIndex = 0;

    // Occupy 3 corners: (3,0), (5,0), (3,2)
    board.grid[0][3] = 1;
    board.grid[0][5] = 1;
    board.grid[2][3] = 1;
    // Front corners for state 2 are (0,0) and (2,0) -> both filled -> full T-Spin!
    assert.equal(detectTSpin(board, t), 'full');

    // If only 1 front corner filled (2 back corners + 1 front) -> mini T-Spin
    board.grid[0][5] = 0;
    board.grid[2][5] = 1;
    assert.equal(detectTSpin(board, t), 'mini');

    // 5th kick (index 4) upgrades mini to full
    t.lastKickIndex = 4;
    assert.equal(detectTSpin(board, t), 'full');
}
