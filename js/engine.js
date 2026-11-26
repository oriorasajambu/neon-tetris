import {
    FRAME_DURATION,
    LOCK_DELAY_FRAMES,
    MAX_LOCK_RESETS,
    MAX_PIECE_LIFETIME_FRAMES,
    LINE_CLEAR_DURATION_FRAMES,
    GAME_STATES,
    T_ALL_CORNERS,
    T_FRONT_CORNERS,
    getGravity
} from './constants.js';
import { PRNG } from './rng.js';
import { Board } from './board.js';
import { Tetromino, BagRandomizer } from './pieces.js';

/**
 * Evaluates whether a locked T-piece qualifies as a T-Spin or T-Spin Mini.
 * @returns {'none' | 'mini' | 'full'}
 */
export function detectTSpin(board, piece) {
    if (piece.type !== 'T' || !piece.lastMoveWasRotation) {
        return 'none';
    }

    let filledCorners = 0;
    for (const [cx, cy] of T_ALL_CORNERS) {
        if (board.isOccupied(piece.x + cx, piece.y + cy)) {
            filledCorners++;
        }
    }

    if (filledCorners < 3) {
        return 'none';
    }

    // 5th kick (index 4, e.g. T-Spin Triple kick) upgrades mini to full
    if (piece.lastKickIndex === 4) {
        return 'full';
    }

    const frontCorners = T_FRONT_CORNERS[piece.rotation];
    const frontFilled = frontCorners.every(([cx, cy]) =>
        board.isOccupied(piece.x + cx, piece.y + cy)
    );

    return frontFilled ? 'full' : 'mini';
}

/**
 * Computes score for a lock event given line count, T-Spin type, All-Clear, and level.
 */
export function calculateClearScore({ lines, tSpin, allClear, level }) {
    let basePoints = 0;
    let label = '';

    if (tSpin === 'full') {
        const table = [400, 800, 1200, 1600];
        basePoints = (table[lines] || 0) * level;
        const names = ['T-SPIN!', 'T-SPIN SINGLE!', 'T-SPIN DOUBLE!', 'T-SPIN TRIPLE!'];
        label = names[lines] || 'T-SPIN!';
    } else if (tSpin === 'mini') {
        const table = [100, 200, 400];
        basePoints = (table[lines] || 0) * level;
        const names = ['T-SPIN MINI', 'T-SPIN MINI SINGLE', 'T-SPIN MINI DOUBLE'];
        label = names[lines] || 'T-SPIN MINI';
    } else if (lines > 0) {
        const table = [0, 100, 300, 500, 800];
        basePoints = (table[lines] || 0) * level;
        const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
        label = names[lines] || '';
    }

    if (allClear && lines > 0) {
        basePoints += 3000;
        label = label ? `${label} ALL CLEAR!` : 'ALL CLEAR!';
    }

    return { points: basePoints, label };
}

/**
 * Core deterministic Tetris game engine.
 * Can be run headless in Node.js for unit/replay testing or driven by requestAnimationFrame in the browser.
 */
export class GameEngine {
    constructor(callbacks = {}) {
        this.callbacks = callbacks;
        this.board = new Board();
        this.state = GAME_STATES.MENU;
        this.seed = 1;
        this.prng = new PRNG(this.seed);
        this.bag = new BagRandomizer(this.prng);

        this.activePiece = null;
        this.holdType = null;
        this.holdUsed = false;

        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.tSpinCount = 0;
        this.frameCount = 0;

        this.gravityAccumulator = 0;
        this.softDropping = false;
        this.lockTimer = 0;
        this.lockResets = 0;
        this.pieceLifetime = 0;
        this.isGrounded = false;

        this.pendingClearRows = [];
        this.lineClearTimer = 0;
        this.countdownTimer = 0;
        this.countdownValue = 3;

        this.nextCount = 5;
        this.replayMode = false;
    }

    startNewGame(seed = Date.now()) {
        this.seed = (seed >>> 0) || 1;
        this.prng = new PRNG(this.seed);
        this.bag = new BagRandomizer(this.prng);
        this.board.reset();

        this.activePiece = null;
        this.holdType = null;
        this.holdUsed = false;

        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.tSpinCount = 0;
        this.frameCount = 0;

        this.gravityAccumulator = 0;
        this.softDropping = false;
        this.lockTimer = 0;
        this.lockResets = 0;
        this.pieceLifetime = 0;
        this.isGrounded = false;
        this.pendingClearRows = [];
        this.lineClearTimer = 0;

        this.state = GAME_STATES.PLAYING;
        this.spawnNextPiece();
        this.emit('boardChanged');
        this.emit('hudChanged');
    }

    emit(event, payload) {
        if (this.callbacks[event]) {
            this.callbacks[event](payload);
        }
    }

    spawnNextPiece(forcedType = null) {
        const type = forcedType || this.bag.next();
        const piece = new Tetromino(type);

        if (!this.board.isValidPosition(piece.getBlocks(), piece.x, piece.y)) {
            this.activePiece = null;
            this.triggerGameOver();
            return false;
        }

        this.activePiece = piece;
        this.gravityAccumulator = 0;
        this.lockTimer = 0;
        this.lockResets = 0;
        this.pieceLifetime = 0;
        this.isGrounded = !this.board.isValidPosition(piece.getBlocks(), piece.x, piece.y - 1);

        // Immediate 20G drop if level >= 15
        if (getGravity(this.level) >= 20) {
            this.applyGravityStep(20);
        }

        this.emit('hudChanged');
        return true;
    }

    triggerGameOver() {
        this.state = GAME_STATES.GAME_OVER;
        this.emit('sound', 'gameOver');
        this.emit('gameOver', {
            score: this.score,
            level: this.level,
            lines: this.lines,
            tSpins: this.tSpinCount,
            seed: this.seed
        });
    }

    pause() {
        if (this.state === GAME_STATES.PLAYING) {
            this.state = GAME_STATES.PAUSED;
            this.emit('stateChanged', this.state);
        }
    }

    resume() {
        if (this.state === GAME_STATES.PAUSED) {
            this.state = GAME_STATES.COUNTDOWN;
            this.countdownValue = 3;
            this.countdownTimer = 0;
            this.emit('sound', 'countdownTick');
            this.emit('stateChanged', this.state);
        }
    }

    /**
     * Advances the simulation by exactly one logical frame (16.667ms).
     */
    stepFrame() {
        if (this.state === GAME_STATES.COUNTDOWN) {
            this.countdownTimer++;
            if (this.countdownTimer >= 36) { // ~600ms per countdown number
                this.countdownTimer = 0;
                this.countdownValue--;
                if (this.countdownValue <= 0) {
                    this.state = GAME_STATES.PLAYING;
                    this.emit('sound', 'countdownGo');
                    this.emit('stateChanged', this.state);
                } else {
                    this.emit('sound', 'countdownTick');
                }
            }
            return;
        }

        if (this.state === GAME_STATES.LINE_CLEARING) {
            this.lineClearTimer++;
            if (this.lineClearTimer >= LINE_CLEAR_DURATION_FRAMES) {
                this.finishLineClear();
            }
            return;
        }

        if (this.state !== GAME_STATES.PLAYING || !this.activePiece) {
            return;
        }

        this.frameCount++;
        this.pieceLifetime++;

        // Gravity calculation
        const baseGravity = getGravity(this.level);
        const effectiveGravity = this.softDropping ? Math.max(baseGravity, 0.5) : baseGravity;
        this.gravityAccumulator += effectiveGravity;

        const cellsToDrop = Math.floor(this.gravityAccumulator);
        if (cellsToDrop > 0) {
            this.gravityAccumulator -= cellsToDrop;
            const dropped = this.applyGravityStep(cellsToDrop);
            if (dropped > 0 && this.softDropping) {
                this.score += dropped;
                this.emit('sound', 'softDrop');
                this.emit('hudChanged');
            }
        }

        // Grounded & Lock Delay
        this.isGrounded = !this.board.isValidPosition(
            this.activePiece.getBlocks(),
            this.activePiece.x,
            this.activePiece.y - 1
        );

        if (this.isGrounded) {
            this.lockTimer++;
            if (
                this.lockTimer >= LOCK_DELAY_FRAMES ||
                this.lockResets >= MAX_LOCK_RESETS ||
                this.pieceLifetime >= MAX_PIECE_LIFETIME_FRAMES
            ) {
                this.lockActivePiece();
            }
        }
    }

    applyGravityStep(maxCells) {
        if (!this.activePiece) return 0;
        let dropped = 0;
        const blocks = this.activePiece.getBlocks();
        while (
            dropped < maxCells &&
            this.board.isValidPosition(blocks, this.activePiece.x, this.activePiece.y - 1)
        ) {
            this.activePiece.y--;
            this.activePiece.lastMoveWasRotation = false;
            dropped++;
        }
        return dropped;
    }

    resetLockDelayIfGrounded() {
        if (this.isGrounded && this.lockResets < MAX_LOCK_RESETS) {
            this.lockTimer = 0;
            this.lockResets++;
        }
    }

    move(dx) {
        if (this.state !== GAME_STATES.PLAYING || !this.activePiece) return false;
        const blocks = this.activePiece.getBlocks();
        if (this.board.isValidPosition(blocks, this.activePiece.x + dx, this.activePiece.y)) {
            this.activePiece.x += dx;
            this.activePiece.lastMoveWasRotation = false;
            this.resetLockDelayIfGrounded();
            this.emit('sound', 'move');
            return true;
        }
        return false;
    }

    rotate(dir) {
        // dir: 1 = CW, -1 = CCW
        if (this.state !== GAME_STATES.PLAYING || !this.activePiece) return false;
        const piece = this.activePiece;
        const targetRotation = (piece.rotation + dir + 4) % 4;
        const kicks = piece.getKicks(targetRotation);
        const targetBlocks = piece.getBlocks(targetRotation);

        for (let i = 0; i < kicks.length; i++) {
            const [kx, ky] = kicks[i];
            if (this.board.isValidPosition(targetBlocks, piece.x + kx, piece.y + ky)) {
                piece.x += kx;
                piece.y += ky;
                piece.rotation = targetRotation;
                piece.lastMoveWasRotation = true;
                piece.lastKickIndex = i;
                this.resetLockDelayIfGrounded();
                this.emit('sound', 'rotate');
                return true;
            }
        }
        return false;
    }

    hardDrop() {
        if (this.state !== GAME_STATES.PLAYING || !this.activePiece) return 0;
        const ghostY = this.board.getGhostY(this.activePiece);
        const distance = this.activePiece.y - ghostY;
        if (distance > 0) {
            this.activePiece.y = ghostY;
            this.activePiece.lastMoveWasRotation = false;
            this.score += distance * 2;
        }
        this.emit('sound', 'hardDrop');
        this.lockActivePiece();
        return distance;
    }

    hold() {
        if (this.state !== GAME_STATES.PLAYING || !this.activePiece || this.holdUsed) {
            return false;
        }
        const currentType = this.activePiece.type;
        this.holdUsed = true;
        this.emit('sound', 'hold');

        if (this.holdType === null) {
            this.holdType = currentType;
            this.spawnNextPiece();
        } else {
            const swapType = this.holdType;
            this.holdType = currentType;
            this.spawnNextPiece(swapType);
        }
        this.emit('hudChanged');
        return true;
    }

    lockActivePiece() {
        if (!this.activePiece) return;
        const piece = this.activePiece;
        const tSpin = detectTSpin(this.board, piece);
        const { lockedOut } = this.board.lockPiece(piece);
        this.activePiece = null;
        this.holdUsed = false;

        if (lockedOut) {
            this.emit('boardChanged');
            this.triggerGameOver();
            return;
        }

        const fullRows = this.board.getFullRows();
        const lineCount = fullRows.length;

        if (tSpin !== 'none') {
            this.tSpinCount++;
        }

        if (lineCount > 0) {
            // Check All-Clear as if rows were cleared
            const remainingCells = this.countRemainingCellsAfterClear(fullRows);
            const allClear = remainingCells === 0;

            const { points, label } = calculateClearScore({
                lines: lineCount,
                tSpin,
                allClear,
                level: this.level
            });

            this.score += points;
            this.lines += lineCount;
            this.level = Math.floor(this.lines / 10) + 1;

            this.pendingClearRows = fullRows;
            this.lineClearTimer = 0;
            this.state = GAME_STATES.LINE_CLEARING;

            this.emit('lineClearStart', {
                rows: fullRows,
                points,
                label,
                tSpin,
                allClear
            });

            if (allClear) {
                this.emit('sound', 'allClear');
            } else if (tSpin !== 'none') {
                this.emit('sound', 'tSpin');
            } else if (lineCount === 4) {
                this.emit('sound', 'tetris');
            } else {
                this.emit('sound', `clear${lineCount}`);
            }

            this.emit('hudChanged');
        } else {
            if (tSpin !== 'none') {
                const { points, label } = calculateClearScore({
                    lines: 0,
                    tSpin,
                    allClear: false,
                    level: this.level
                });
                this.score += points;
                this.emit('popup', { label, points, y: piece.y });
                this.emit('sound', 'tSpin');
            } else {
                this.emit('sound', 'lock');
            }

            this.emit('boardChanged');
            this.spawnNextPiece();
        }
    }

    countRemainingCellsAfterClear(rowsToClear) {
        const clearSet = new Set(rowsToClear);
        let count = 0;
        for (let y = 0; y < this.board.rows; y++) {
            if (clearSet.has(y)) continue;
            for (let x = 0; x < this.board.cols; x++) {
                if (this.board.grid[y][x] !== 0) count++;
            }
        }
        return count;
    }

    finishLineClear() {
        this.board.clearRows(this.pendingClearRows);
        this.pendingClearRows = [];
        this.lineClearTimer = 0;
        this.state = GAME_STATES.PLAYING;
        this.emit('boardChanged');
        this.spawnNextPiece();
    }

    getNextQueue() {
        return this.bag.peek(this.nextCount);
    }

    /**
     * Used by fixed-timestep loop to get frame duration constant.
     */
    static get FRAME_DURATION() {
        return FRAME_DURATION;
    }
}
