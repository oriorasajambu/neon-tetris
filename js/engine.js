import {
    FRAME_DURATION,
    LOCK_DELAY_FRAMES,
    MAX_LOCK_RESETS,
    MAX_PIECE_LIFETIME_FRAMES,
    LINE_CLEAR_DURATION_FRAMES,
    GAME_STATES,
    GAME_MODES,
    PIECE_IDS,
    T_ALL_CORNERS,
    T_FRONT_CORNERS,
    COMBO_ATTACK_TABLE,
    MAX_GARBAGE_PER_LOCK,
    SPRINT_TARGET_LINES,
    ULTRA_DURATION_FRAMES,
    CHEESE_TARGET_LINES,
    CHEESE_MIN_ROWS,
    CHEESE_INITIAL_ROWS,
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
 * Computes score for a lock event given line count, T-Spin type, All-Clear, B2B, Combo, and level.
 */
export function calculateClearScore({ lines, tSpin, allClear, level, b2b = false, combo = 0 }) {
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

    if (b2b && lines > 0 && (lines === 4 || tSpin !== 'none')) {
        basePoints = Math.round(basePoints * 1.5);
        label = label ? `B2B ${label}` : 'B2B!';
    }

    if (combo > 0 && lines > 0) {
        basePoints += 50 * combo * level;
    }

    if (allClear && lines > 0) {
        basePoints += 3000;
        label = label ? `${label} ALL CLEAR!` : 'ALL CLEAR!';
    }

    return { points: basePoints, label };
}

/**
 * Computes outgoing garbage lines for VS mode.
 */
export function calculateAttack({ lines, tSpin = 'none', allClear = false, b2b = false, combo = 0 }) {
    if (lines <= 0) return 0;

    let attack = 0;
    if (tSpin === 'full') {
        attack = [0, 2, 4, 6][lines] || 0;
    } else if (tSpin === 'mini') {
        attack = [0, 0, 1][lines] || 0;
    } else {
        attack = [0, 0, 1, 2, 4][lines] || 0;
    }

    if (b2b && (lines === 4 || tSpin !== 'none')) {
        attack += 1;
    }

    if (combo > 0) {
        const idx = Math.min(combo, COMBO_ATTACK_TABLE.length - 1);
        attack += COMBO_ATTACK_TABLE[idx];
    }

    if (allClear) {
        attack += 10;
    }

    return attack;
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
        this.mode = GAME_MODES.MARATHON;
        this.seed = 1;
        this.prng = new PRNG(this.seed);
        this.garbagePrng = new PRNG(this.seed ^ 0x9e3779b9);
        this.bag = new BagRandomizer(this.prng);

        this.activePiece = null;
        this.holdType = null;
        this.holdUsed = false;

        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.tSpinCount = 0;
        this.b2bActive = false;
        this.comboCount = -1;
        this.piecesLocked = 0;
        this.attackSent = 0;
        this.cheeseCleared = 0;
        this.lastGarbageHole = 4;

        this.frameCount = 0;
        this.elapsedFrames = 0;
        this.timerStarted = false;

        this.gravityAccumulator = 0;
        this.softDropping = false;
        this.sdf = 20;
        this.areFrames = 0;
        this.lineClearFrames = LINE_CLEAR_DURATION_FRAMES;

        this.lockTimer = 0;
        this.lockResets = 0;
        this.pieceLifetime = 0;
        this.isGrounded = false;

        this.pendingClearRows = [];
        this.lineClearTimer = 0;
        this.areTimer = 0;
        this.countdownTimer = 0;
        this.countdownValue = 3;

        // IRS / IHS input buffering during line-clear / ARE / countdown
        this.bufferedRotate = null;
        this.bufferedHold = false;

        // Pending garbage queue for VS mode
        this.pendingGarbage = [];

        this.nextCount = 5;
        this.replayMode = false;
    }

    startNewGame(seed = Date.now(), options = {}) {
        this.seed = (seed >>> 0) || 1;
        this.mode = options.mode || GAME_MODES.MARATHON;
        if (typeof options.sdf === 'number') this.sdf = options.sdf;
        if (typeof options.areFrames === 'number') this.areFrames = options.areFrames;
        if (typeof options.lineClearFrames === 'number') this.lineClearFrames = options.lineClearFrames;

        this.prng = new PRNG(this.seed);
        this.garbagePrng = new PRNG((this.seed ^ 0x9e3779b9) >>> 0 || 1);
        this.bag = new BagRandomizer(this.prng);
        this.board.reset();

        this.activePiece = null;
        this.holdType = null;
        this.holdUsed = false;

        this.score = 0;
        this.level = 1;
        this.lines = 0;
        this.tSpinCount = 0;
        this.b2bActive = false;
        this.comboCount = -1;
        this.piecesLocked = 0;
        this.attackSent = 0;
        this.cheeseCleared = 0;
        this.lastGarbageHole = this.garbagePrng.nextInt(this.board.cols);

        this.frameCount = 0;
        this.elapsedFrames = 0;
        this.timerStarted = false;

        this.gravityAccumulator = 0;
        this.softDropping = false;
        this.lockTimer = 0;
        this.lockResets = 0;
        this.pieceLifetime = 0;
        this.isGrounded = false;
        this.pendingClearRows = [];
        this.lineClearTimer = 0;
        this.areTimer = 0;
        this.bufferedRotate = null;
        this.bufferedHold = false;
        this.pendingGarbage = [];

        if (this.mode === GAME_MODES.CHEESE) {
            this.spawnCheeseRows(CHEESE_INITIAL_ROWS);
        }

        this.state = GAME_STATES.PLAYING;
        this.spawnNextPiece();
        this.emit('boardChanged');
        this.emit('hudChanged');
        this.emit('garbageChanged', this.getPendingGarbageCount());
    }

    emit(event, payload) {
        if (this.callbacks[event]) {
            this.callbacks[event](payload);
        }
    }

    markPlayerInput() {
        if (!this.timerStarted && this.state === GAME_STATES.PLAYING) {
            this.timerStarted = true;
        }
    }

    nextGarbageHole() {
        // 70% chance to change hole column for competitive cheese messiness
        if (this.garbagePrng.nextInt(100) < 70) {
            let next = this.garbagePrng.nextInt(this.board.cols - 1);
            if (next >= this.lastGarbageHole) next++;
            this.lastGarbageHole = next;
        }
        return this.lastGarbageHole;
    }

    spawnCheeseRows(count) {
        const holes = [];
        for (let i = 0; i < count; i++) {
            holes.push(this.nextGarbageHole());
        }
        return this.board.addGarbageLines(count, holes);
    }

    getPendingGarbageCount() {
        let total = 0;
        for (let i = 0; i < this.pendingGarbage.length; i++) {
            total += this.pendingGarbage[i].lines;
        }
        return total;
    }

    receiveGarbage(lines) {
        if (lines <= 0 || this.state === GAME_STATES.GAME_OVER || this.state === GAME_STATES.VICTORY) {
            return;
        }
        this.pendingGarbage.push({ lines, frameAdded: this.frameCount });
        this.emit('garbageChanged', this.getPendingGarbageCount());
    }

    bufferInput(type, dir = 1) {
        if (
            this.state === GAME_STATES.LINE_CLEARING ||
            this.state === GAME_STATES.COUNTDOWN ||
            this.areTimer > 0
        ) {
            if (type === 'hold') {
                this.bufferedHold = true;
            } else if (type === 'rotate') {
                this.bufferedRotate = dir;
            }
            return true;
        }
        return false;
    }

    spawnNextPiece(forcedType = null) {
        let type = forcedType;
        if (!type) {
            if (this.bufferedHold && !this.holdUsed) {
                this.bufferedHold = false;
                const drawn = this.bag.next();
                if (this.holdType === null) {
                    this.holdType = drawn;
                    type = this.bag.next();
                } else {
                    type = this.holdType;
                    this.holdType = drawn;
                }
                this.holdUsed = true;
                this.emit('sound', 'hold');
            } else {
                type = this.bag.next();
            }
        }
        this.bufferedHold = false;

        const piece = new Tetromino(type);

        // Apply IRS (Initial Rotation System) before spawn collision check
        if (this.bufferedRotate !== null) {
            const dir = this.bufferedRotate;
            this.bufferedRotate = null;
            const targetRot = (piece.rotation + dir + 4) % 4;
            const kicks = dir === 2 ? piece.getKicks180(targetRot) : piece.getKicks(targetRot);
            const targetBlocks = piece.getBlocks(targetRot);
            for (let i = 0; i < kicks.length; i++) {
                const [kx, ky] = kicks[i];
                if (this.board.isValidPosition(targetBlocks, piece.x + kx, piece.y + ky)) {
                    piece.x += kx;
                    piece.y += ky;
                    piece.rotation = targetRot;
                    piece.lastMoveWasRotation = true;
                    piece.lastKickIndex = i;
                    this.emit('sound', 'rotate');
                    break;
                }
            }
        }

        if (!this.board.isValidPosition(piece.getBlocks(), piece.x, piece.y)) {
            if (this.mode === GAME_MODES.ZEN) {
                this.board.clearRows([18, 19, 20, 21, 22, 23]);
                this.emit('boardChanged');
            } else {
                this.activePiece = null;
                this.triggerGameOver();
                return false;
            }
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

    getSummary(victory = false) {
        const timeMs = Math.round(this.elapsedFrames * FRAME_DURATION);
        const seconds = Math.max(0.001, timeMs / 1000);
        return {
            mode: this.mode,
            victory,
            score: this.score,
            level: this.level,
            lines: this.lines,
            tSpins: this.tSpinCount,
            piecesLocked: this.piecesLocked,
            attackSent: this.attackSent,
            pps: Number((this.piecesLocked / seconds).toFixed(2)),
            apm: Number(((this.attackSent / seconds) * 60).toFixed(1)),
            timeMs,
            seed: this.seed
        };
    }

    triggerGameOver() {
        this.state = GAME_STATES.GAME_OVER;
        this.emit('sound', 'gameOver');
        this.emit('gameOver', this.getSummary(false));
    }

    triggerVictory() {
        this.state = GAME_STATES.VICTORY;
        this.emit('sound', 'allClear');
        this.emit('gameOver', this.getSummary(true));
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
            if (this.countdownTimer >= 36) {
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
            this.frameCount++;
            if (this.timerStarted) this.elapsedFrames++;
            this.lineClearTimer++;
            if (this.lineClearTimer >= this.lineClearFrames) {
                this.finishLineClear();
            }
            return;
        }

        if (this.state !== GAME_STATES.PLAYING) {
            return;
        }

        this.frameCount++;
        if (this.timerStarted) {
            this.elapsedFrames++;
            if (this.mode === GAME_MODES.ULTRA && this.elapsedFrames >= ULTRA_DURATION_FRAMES) {
                this.triggerVictory();
                return;
            }
        }

        if (this.areTimer > 0) {
            this.areTimer--;
            if (this.areTimer === 0) {
                this.spawnNextPiece();
            }
            return;
        }

        if (!this.activePiece) {
            return;
        }

        this.pieceLifetime++;

        // Gravity calculation with configurable Soft Drop Factor (SDF)
        const baseGravity = getGravity(this.level);
        let effectiveGravity = baseGravity;
        if (this.softDropping) {
            effectiveGravity = this.sdf >= 999 ? 24.0 : Math.max(baseGravity * this.sdf, 0.5);
        }
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

    move(dx, silent = false) {
        if (this.state !== GAME_STATES.PLAYING || !this.activePiece) return false;
        this.markPlayerInput();
        const blocks = this.activePiece.getBlocks();
        if (this.board.isValidPosition(blocks, this.activePiece.x + dx, this.activePiece.y)) {
            this.activePiece.x += dx;
            this.activePiece.lastMoveWasRotation = false;
            this.resetLockDelayIfGrounded();
            if (!silent) this.emit('sound', 'move');
            return true;
        }
        return false;
    }

    /**
     * Instant 0-ARR wall snap: moves to the wall in 1 logical step with 1 sound.
     */
    wallSnap(dx) {
        if (this.state !== GAME_STATES.PLAYING || !this.activePiece) return 0;
        this.markPlayerInput();
        let moved = 0;
        while (this.move(dx, true)) {
            moved++;
        }
        if (moved > 0) {
            this.emit('sound', 'move');
        }
        return moved;
    }

    rotate(dir) {
        // dir: 1 = CW, -1 = CCW, 2 = 180
        if (this.state !== GAME_STATES.PLAYING || !this.activePiece) return false;
        this.markPlayerInput();
        const piece = this.activePiece;
        const targetRotation = (piece.rotation + dir + 4) % 4;
        const kicks = dir === 2 ? piece.getKicks180(targetRotation) : piece.getKicks(targetRotation);
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
        this.markPlayerInput();
        const startY = this.activePiece.y;
        const ghostY = this.board.getGhostY(this.activePiece);
        const distance = startY - ghostY;
        const dropBlocks = this.activePiece.getBlocks().map(([lx, ly]) => ({
            x: this.activePiece.x + lx,
            y: startY + ly,
            endY: ghostY + ly
        }));
        const pieceType = this.activePiece.type;

        if (distance > 0) {
            this.activePiece.y = ghostY;
            this.activePiece.lastMoveWasRotation = false;
            this.score += distance * 2;
        }
        this.emit('hardDropTrail', { blocks: dropBlocks, type: pieceType, distance });
        this.emit('sound', 'hardDrop');
        this.lockActivePiece();
        return distance;
    }

    hold() {
        if (this.state !== GAME_STATES.PLAYING || !this.activePiece || this.holdUsed) {
            return false;
        }
        this.markPlayerInput();
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
        this.piecesLocked++;

        if (lockedOut) {
            if (this.mode === GAME_MODES.ZEN) {
                this.board.clearRows([18, 19, 20, 21, 22, 23]);
                this.emit('boardChanged');
                this.spawnNextPiece();
                return;
            }
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
            // Track cheese rows cleared
            if (this.mode === GAME_MODES.CHEESE) {
                for (const r of fullRows) {
                    if (this.board.grid[r].includes(PIECE_IDS.GARBAGE)) {
                        this.cheeseCleared++;
                    }
                }
            }

            const remainingCells = this.countRemainingCellsAfterClear(fullRows);
            const allClear = remainingCells === 0;

            const isDifficult = lineCount === 4 || tSpin !== 'none';
            const wasB2B = this.b2bActive;
            const b2bBonusActive = isDifficult && wasB2B;
            this.b2bActive = isDifficult;
            this.comboCount++;

            const { points, label } = calculateClearScore({
                lines: lineCount,
                tSpin,
                allClear,
                level: this.level,
                b2b: b2bBonusActive,
                combo: this.comboCount
            });

            this.score += points;
            this.lines += lineCount;
            if (this.mode === GAME_MODES.MARATHON || this.mode === GAME_MODES.ZEN) {
                this.level = Math.floor(this.lines / 10) + 1;
            }

            // VS Attack & Garbage Cancellation
            if (this.mode === GAME_MODES.VS_AI) {
                let outgoing = calculateAttack({
                    lines: lineCount,
                    tSpin,
                    allClear,
                    b2b: b2bBonusActive,
                    combo: this.comboCount
                });
                if (outgoing > 0) {
                    this.attackSent += outgoing;
                    outgoing = this.cancelPendingGarbage(outgoing);
                    if (outgoing > 0) {
                        this.emit('attack', {
                            lines: outgoing,
                            b2b: b2bBonusActive,
                            combo: this.comboCount,
                            allClear
                        });
                    }
                }
            }

            // Speedrun Sprint & Cheese instant win check (skip 400ms clear delay on final line)
            const sprintWon = this.mode === GAME_MODES.SPRINT && this.lines >= SPRINT_TARGET_LINES;
            const cheeseWon = this.mode === GAME_MODES.CHEESE && this.cheeseCleared >= CHEESE_TARGET_LINES;

            if (sprintWon || cheeseWon) {
                this.board.clearRows(fullRows);
                this.emit('boardChanged');
                this.emit('hudChanged');
                this.triggerVictory();
                return;
            }

            this.pendingClearRows = fullRows;
            this.lineClearTimer = 0;

            if (this.lineClearFrames <= 0) {
                this.emit('lineClearStart', {
                    rows: fullRows,
                    points,
                    label,
                    tSpin,
                    allClear,
                    combo: this.comboCount,
                    b2b: b2bBonusActive
                });
                this.finishLineClear();
            } else {
                this.state = GAME_STATES.LINE_CLEARING;
                this.emit('lineClearStart', {
                    rows: fullRows,
                    points,
                    label,
                    tSpin,
                    allClear,
                    combo: this.comboCount,
                    b2b: b2bBonusActive
                });
            }

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
            this.comboCount = -1;

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

            // Apply pending garbage on non-clearing lock
            if (this.mode === GAME_MODES.VS_AI && this.pendingGarbage.length > 0) {
                const toppedOut = this.applyPendingGarbage();
                if (toppedOut) {
                    this.emit('boardChanged');
                    this.triggerGameOver();
                    return;
                }
            }

            this.emit('boardChanged');
            this.scheduleNextSpawn();
        }
    }

    cancelPendingGarbage(outgoing) {
        let remaining = outgoing;
        while (remaining > 0 && this.pendingGarbage.length > 0) {
            const front = this.pendingGarbage[0];
            if (front.lines <= remaining) {
                remaining -= front.lines;
                this.pendingGarbage.shift();
            } else {
                front.lines -= remaining;
                remaining = 0;
            }
        }
        this.emit('garbageChanged', this.getPendingGarbageCount());
        return remaining;
    }

    applyPendingGarbage() {
        let toApply = 0;
        while (toApply < MAX_GARBAGE_PER_LOCK && this.pendingGarbage.length > 0) {
            const front = this.pendingGarbage[0];
            const take = Math.min(MAX_GARBAGE_PER_LOCK - toApply, front.lines);
            front.lines -= take;
            toApply += take;
            if (front.lines <= 0) {
                this.pendingGarbage.shift();
            }
        }
        this.emit('garbageChanged', this.getPendingGarbageCount());
        if (toApply <= 0) return false;
        const { toppedOut } = this.spawnCheeseRows(toApply);
        return toppedOut;
    }

    scheduleNextSpawn() {
        if (this.areFrames > 0) {
            this.areTimer = this.areFrames;
        } else {
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

        if (this.mode === GAME_MODES.CHEESE) {
            const activeCheese = this.board.countGarbageRows();
            const remainingNeeded = CHEESE_TARGET_LINES - this.cheeseCleared;
            const targetActive = Math.min(CHEESE_MIN_ROWS, remainingNeeded);
            if (activeCheese < targetActive) {
                this.spawnCheeseRows(targetActive - activeCheese);
            }
        }

        this.emit('boardChanged');
        this.scheduleNextSpawn();
    }

    getNextQueue() {
        return this.bag.peek(this.nextCount);
    }

    static get FRAME_DURATION() {
        return FRAME_DURATION;
    }
}
