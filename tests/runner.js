import { runBoardTests } from './board.test.js';
import { runPiecesTests } from './pieces.test.js';
import { runScoringTests } from './scoring.test.js';
import { runRngTests } from './rng.test.js';
import { runReplayTests } from './replay.test.js';

const suites = [
    ['Board', runBoardTests],
    ['Pieces & SRS', runPiecesTests],
    ['Scoring & T-Spin', runScoringTests],
    ['PRNG Determinism', runRngTests],
    ['Replay Determinism', runReplayTests]
];

let failed = 0;
for (const [name, fn] of suites) {
    try {
        fn();
        console.log(`PASS  ${name}`);
    } catch (err) {
        failed++;
        console.error(`FAIL  ${name}`);
        console.error(err);
    }
}

if (failed > 0) {
    process.exit(1);
}
console.log(`\nAll ${suites.length} test suites passed.`);
