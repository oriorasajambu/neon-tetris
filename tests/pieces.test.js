import assert from 'node:assert/strict';
import { JLSTZ_KICKS, I_KICKS } from '../js/constants.js';
import { PRNG } from '../js/rng.js';
import { BagRandomizer, Tetromino } from '../js/pieces.js';
import { Board } from '../js/board.js';

export function runPiecesTests() {
    // Verify all 8 transitions × 5 kicks = 40 entries for JLSTZ and I
    const transitions = ['0>1', '1>0', '1>2', '2>1', '2>3', '3>2', '3>0', '0>3'];
    for (const tr of transitions) {
        assert.equal(JLSTZ_KICKS[tr].length, 5, `JLSTZ kick ${tr} must have 5 offsets`);
        assert.equal(I_KICKS[tr].length, 5, `I kick ${tr} must have 5 offsets`);
    }

    // 7-bag invariant: every 7 pieces contains all 7 unique types
    const bag = new BagRandomizer(new PRNG(12345));
    for (let round = 0; round < 10; round++) {
        const seen = new Set();
        for (let i = 0; i < 7; i++) {
            seen.add(bag.next());
        }
        assert.equal(seen.size, 7, 'Each 7-bag must contain all 7 distinct tetrominoes');
    }

    // Wall kick test: T-piece against left wall in state 3 -> 0
    const board = new Board();
    const t = new Tetromino('T');
    t.rotation = 3;
    t.x = -1; // left-most column of T-3 is lx=0 -> x=-1? Wait: T-3 has lx=0,1. So x=0 is against wall.
    t.x = 0;
    t.y = 5;
    // Rotating from 3 (blocks at lx=0,1) to 0 (blocks at lx=0,1,2) fits at x=0 without kick
    assert.equal(board.isValidPosition(t.getBlocks(0), t.x, t.y), true);
}
