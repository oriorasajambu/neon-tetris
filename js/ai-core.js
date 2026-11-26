import { COLS, TOTAL_ROWS, PIECE_SHAPES, PIECE_IDS, SPAWN_POSITIONS } from './constants.js';

/**
 * Pure, zero-DOM heuristic Tetris AI evaluator.
 * Operates on a flat Uint8Array(TOTAL_ROWS * COLS) for fast, worker-safe simulation.
 */

function isValidOnFlat(grid, blocks, x, y) {
    for (let i = 0; i < blocks.length; i++) {
        const nx = x + blocks[i][0];
        const ny = y + blocks[i][1];
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= TOTAL_ROWS) {
            return false;
        }
        if (grid[ny * COLS + nx] !== 0) {
            return false;
        }
    }
    return true;
}

function simulateDropAndClear(grid, pieceType, rotation, x) {
    const blocks = PIECE_SHAPES[pieceType][rotation];
    let y = SPAWN_POSITIONS[pieceType].y;
    if (!isValidOnFlat(grid, blocks, x, y)) {
        return null;
    }
    while (isValidOnFlat(grid, blocks, x, y - 1)) {
        y--;
    }

    const nextGrid = new Uint8Array(grid);
    const id = PIECE_IDS[pieceType];
    for (let i = 0; i < blocks.length; i++) {
        const nx = x + blocks[i][0];
        const ny = y + blocks[i][1];
        if (ny >= 0 && ny < TOTAL_ROWS) {
            nextGrid[ny * COLS + nx] = id;
        }
    }

    // Detect and clear full rows
    let cleared = 0;
    let writeRow = 0;
    for (let r = 0; r < TOTAL_ROWS; r++) {
        let full = true;
        const rowOffset = r * COLS;
        for (let c = 0; c < COLS; c++) {
            if (nextGrid[rowOffset + c] === 0) {
                full = false;
                break;
            }
        }
        if (full) {
            cleared++;
        } else {
            if (writeRow !== r) {
                nextGrid.copyWithin(writeRow * COLS, rowOffset, rowOffset + COLS);
            }
            writeRow++;
        }
    }
    if (cleared > 0) {
        nextGrid.fill(0, writeRow * COLS);
    }

    return { grid: nextGrid, cleared };
}

export function evaluateFlatGrid(grid, cleared = 0) {
    const heights = new Int32Array(COLS);
    let holes = 0;
    let blockades = 0;

    for (let c = 0; c < COLS; c++) {
        let foundTop = false;
        let colTop = 0;
        for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
            const cell = grid[r * COLS + c];
            if (cell !== 0) {
                if (!foundTop) {
                    foundTop = true;
                    colTop = r + 1;
                } else if (holes > 0) {
                    blockades++;
                }
            } else if (foundTop) {
                holes++;
            }
        }
        heights[c] = colTop;
    }

    let aggregateHeight = 0;
    let maxHeight = 0;
    let bumpiness = 0;
    for (let c = 0; c < COLS; c++) {
        const h = heights[c];
        aggregateHeight += h;
        if (h > maxHeight) maxHeight = h;
        if (c > 0) {
            bumpiness += Math.abs(h - heights[c - 1]);
        }
    }

    // Reward clean Tetris/lines, heavily penalize holes and high stacks
    const clearBonus = cleared === 4 ? 12.0 : cleared === 3 ? 4.5 : cleared === 2 ? 2.0 : cleared === 1 ? 0.6 : 0;
    const dangerPenalty = maxHeight > 14 ? (maxHeight - 14) * 2.5 : 0;

    return (
        clearBonus -
        0.51 * aggregateHeight -
        0.76 * holes -
        0.18 * bumpiness -
        0.12 * blockades -
        dangerPenalty
    );
}

function getAllPlacements(grid, pieceType) {
    const candidates = [];
    const maxRot = pieceType === 'O' ? 1 : 4;
    for (let rot = 0; rot < maxRot; rot++) {
        for (let x = -2; x < COLS; x++) {
            const sim = simulateDropAndClear(grid, pieceType, rot, x);
            if (sim) {
                candidates.push({
                    rotation: rot,
                    x,
                    grid: sim.grid,
                    cleared: sim.cleared,
                    score: evaluateFlatGrid(sim.grid, sim.cleared)
                });
            }
        }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
}

/**
 * Finds the best placement for the current board state.
 * @returns {{ useHold: boolean, targetRotation: number, targetX: number, score: number } | null}
 */
export function findBestMove({ grid, pieceType, holdType = null, nextQueue = [], depth = 1, mistakeRate = 0 }) {
    const primaryMoves = getAllPlacements(grid, pieceType);
    if (primaryMoves.length === 0) return null;

    let options = primaryMoves.slice(0, 6).map((m) => ({
        useHold: false,
        targetRotation: m.rotation,
        targetX: m.x,
        score: m.score,
        nextGrid: m.grid
    }));

    // Consider Hold swap if holdType differs from pieceType
    const holdCandidateType = holdType || nextQueue[0] || null;
    if (holdCandidateType && holdCandidateType !== pieceType) {
        const holdMoves = getAllPlacements(grid, holdCandidateType);
        for (const m of holdMoves.slice(0, 4)) {
            options.push({
                useHold: true,
                targetRotation: m.rotation,
                targetX: m.x,
                score: m.score,
                nextGrid: m.grid
            });
        }
    }

    // 2-ply lookahead
    if (depth >= 2 && nextQueue.length > 0) {
        for (const opt of options) {
            const lookaheadPiece = opt.useHold && !holdType ? nextQueue[1] : nextQueue[0];
            if (!lookaheadPiece) continue;
            const secondMoves = getAllPlacements(opt.nextGrid, lookaheadPiece);
            if (secondMoves.length > 0) {
                opt.score = opt.score * 0.35 + secondMoves[0].score * 0.65;
            }
        }
    }

    options.sort((a, b) => b.score - a.score);

    let chosenIndex = 0;
    if (mistakeRate > 0 && options.length > 1 && Math.random() < mistakeRate) {
        chosenIndex = Math.min(options.length - 1, 1 + Math.floor(Math.random() * 2));
    }

    const best = options[chosenIndex];
    return {
        useHold: best.useHold,
        targetRotation: best.targetRotation,
        targetX: best.targetX,
        score: best.score
    };
}
