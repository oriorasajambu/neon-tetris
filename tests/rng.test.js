import assert from 'node:assert/strict';
import { PRNG } from '../js/rng.js';

export function runRngTests() {
    const a = new PRNG(987654);
    const b = new PRNG(987654);
    const c = new PRNG(111111);

    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    const seqC = Array.from({ length: 50 }, () => c.next());

    assert.deepEqual(seqA, seqB, 'Same seed must produce identical PRNG sequence');
    assert.notDeepEqual(seqA, seqC, 'Different seeds must produce different sequences');

    for (const v of seqA) {
        assert.ok(v >= 0 && v < 1, 'PRNG output must be in [0, 1)');
    }
}
