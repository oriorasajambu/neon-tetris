import assert from 'node:assert/strict';
import { Board } from '../js/board.js';
import { Tetromino } from '../js/pieces.js';
import { COLS, VISIBLE_ROWS } from '../js/constants.js';

export function runBoardTests() {
    const board = new Board();
    assert.equal(board.isEmpty(), true, 'Fresh board should be empty');

    // Collision boundaries
    const t = new Tetromino('T');
    assert.equal(board.isValidPosition(t.getBlocks(), 3, 0), true);
    assert.equal(board.isValidPosition(t.getBlocks(), -1, 0), false, 'Should collide with left wall');
    assert.equal(board.isValidPosition(t.getBlocks(), COLS - 2, 0), false, 'Should collide with right wall');
    assert.equal(board.isValidPosition(t.getBlocks(), 3, -2), false, 'Should collide with floor');

    // Line clear & All-Clear
    for (let x = 0; x < COLS; x++) {
        board.grid[0][x] = 1;
    }
    const fullRows = board.getFullRows();
    assert.deepEqual(fullRows, [0]);
    board.clearRows(fullRows);
    assert.equal(board.isEmpty(), true, 'Clearing only filled row should leave empty board');

    // Lock-out detection
    const highPiece = new Tetromino('O');
    highPiece.y = VISIBLE_ROWS; // blocks at y=21, y=22 -> all >= VISIBLE_ROWS
    const { lockedOut } = board.lockPiece(highPiece);
    assert.equal(lockedOut, true, 'Piece locked entirely above visible rows should trigger lockOut');
}
