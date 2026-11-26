import {
    COLS,
    VISIBLE_ROWS,
    THEMES,
    ID_TO_PIECE,
    PIECE_SHAPES,
    LOCK_DELAY_FRAMES,
    MAX_LOCK_RESETS,
    GAME_STATES
} from './constants.js';
import { ParticleSystem } from './particles.js';

/**
 * Three-layer Canvas 2D renderer with neon cyberpunk glow, HiDPI scaling,
 * colorblind patterns, and preview canvas rendering.
 */
export class Renderer {
    constructor(bgCanvas, lockedCanvas, activeCanvas) {
        this.bgCanvas = bgCanvas;
        this.lockedCanvas = lockedCanvas;
        this.activeCanvas = activeCanvas;

        this.bgCtx = bgCanvas.getContext('2d');
        this.lockedCtx = lockedCanvas.getContext('2d');
        this.activeCtx = activeCanvas.getContext('2d');

        this.cellSize = 30;
        this.dpr = 2; // 2x retina buffer
        this.colorblind = false;
        this.theme = THEMES.cyberpunk;
        this.patterns = new Map();
        this.particles = new ParticleSystem();
        this.hardDropTrails = [];
        this.burstSpawnedForClear = false;

        this.resize(this.cellSize);
        this.initPatterns();
    }

    setTheme(themeKey) {
        this.theme = THEMES[themeKey] || THEMES.cyberpunk;
        this.drawBackground();
    }

    getPieceColor(type) {
        if (type === 'GARBAGE') return this.theme.garbage;
        return this.theme.pieces[type] || this.theme.accent;
    }

    addHardDropTrail({ blocks, type, distance }) {
        if (!blocks || distance <= 0) return;
        this.hardDropTrails.push({
            blocks,
            color: this.getPieceColor(type),
            life: 12,
            maxLife: 12
        });
    }

    setColorblind(enabled) {
        this.colorblind = enabled;
    }

    resize(cellSize) {
        this.cellSize = cellSize;
        const w = COLS * cellSize;
        const h = VISIBLE_ROWS * cellSize;

        for (const canvas of [this.bgCanvas, this.lockedCanvas, this.activeCanvas]) {
            canvas.width = w * this.dpr;
            canvas.height = h * this.dpr;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            const ctx = canvas.getContext('2d');
            ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        }

        this.drawBackground();
    }

    initPatterns() {
        const size = 12;
        const createPattern = (drawFn) => {
            const pCanvas = document.createElement('canvas');
            pCanvas.width = size;
            pCanvas.height = size;
            const pCtx = pCanvas.getContext('2d');
            pCtx.strokeStyle = 'rgba(255,255,255,0.55)';
            pCtx.fillStyle = 'rgba(255,255,255,0.55)';
            pCtx.lineWidth = 1.5;
            drawFn(pCtx, size);
            return this.activeCtx.createPattern(pCanvas, 'repeat');
        };

        // I: horizontal lines
        this.patterns.set('I', createPattern((ctx, s) => {
            ctx.beginPath();
            ctx.moveTo(0, s / 2);
            ctx.lineTo(s, s / 2);
            ctx.stroke();
        }));
        // O: solid (subtle inner square)
        this.patterns.set('O', createPattern((ctx, s) => {
            ctx.strokeRect(3, 3, s - 6, s - 6);
        }));
        // T: diagonal crosshatch
        this.patterns.set('T', createPattern((ctx, s) => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(s, s);
            ctx.moveTo(s, 0);
            ctx.lineTo(0, s);
            ctx.stroke();
        }));
        // S: forward diagonal stripes
        this.patterns.set('S', createPattern((ctx, s) => {
            ctx.beginPath();
            ctx.moveTo(0, s);
            ctx.lineTo(s, 0);
            ctx.stroke();
        }));
        // Z: backward diagonal stripes
        this.patterns.set('Z', createPattern((ctx, s) => {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(s, s);
            ctx.stroke();
        }));
        // J: dots
        this.patterns.set('J', createPattern((ctx, s) => {
            ctx.beginPath();
            ctx.arc(s / 2, s / 2, 2, 0, Math.PI * 2);
            ctx.fill();
        }));
        // L: vertical lines
        this.patterns.set('L', createPattern((ctx, s) => {
            ctx.beginPath();
            ctx.moveTo(s / 2, 0);
            ctx.lineTo(s / 2, s);
            ctx.stroke();
        }));
    }

    drawBackground() {
        const ctx = this.bgCtx;
        const w = COLS * this.cellSize;
        const h = VISIBLE_ROWS * this.cellSize;

        ctx.fillStyle = this.theme.background;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = this.theme.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = 1; c < COLS; c++) {
            const x = c * this.cellSize + 0.5;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for (let r = 1; r < VISIBLE_ROWS; r++) {
            const y = r * this.cellSize + 0.5;
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();
    }

    /**
     * Redraws Layer 2 (locked blocks) — called only when the board changes.
     */
    drawLockedBoard(board) {
        const ctx = this.lockedCtx;
        const w = COLS * this.cellSize;
        const h = VISIBLE_ROWS * this.cellSize;
        ctx.clearRect(0, 0, w, h);

        for (let y = 0; y < VISIBLE_ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const id = board.grid[y][x];
                if (id !== 0) {
                    const type = ID_TO_PIECE[id];
                    this.drawBlock(ctx, x, y, type, { alpha: 0.65, glow: 8 });
                }
            }
        }
    }

    /**
     * Draws a single neon block at board coordinates (bx, by).
     */
    drawBlock(ctx, bx, by, type, { alpha = 1, glow = 12, ghost = false, flash = false } = {}) {
        const cs = this.cellSize;
        const px = bx * cs;
        const py = (VISIBLE_ROWS - 1 - by) * cs;
        const pad = 1.5;
        const size = cs - pad * 2;
        const color = flash ? '#ffffff' : this.getPieceColor(type);

        ctx.save();
        ctx.globalAlpha = alpha;

        if (ghost) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(px + pad + 0.5, py + pad + 0.5, size - 1, size - 1);
            ctx.globalAlpha = alpha * 0.35;
            ctx.fillStyle = color;
            ctx.fillRect(px + pad, py + pad, size, size);
            ctx.restore();
            return;
        }

        if (glow > 0) {
            ctx.shadowColor = color;
            ctx.shadowBlur = glow;
        }

        // Translucent neon fill
        ctx.fillStyle = color;
        ctx.fillRect(px + pad, py + pad, size, size);

        // Dark inner core for neon outline look
        ctx.shadowBlur = 0;
        ctx.fillStyle = flash ? 'rgba(255,255,255,0.85)' : 'rgba(10, 10, 15, 0.45)';
        ctx.fillRect(px + pad + 3, py + pad + 3, size - 6, size - 6);

        // Crisp bright border
        ctx.strokeStyle = flash ? '#ffffff' : color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + pad + 0.5, py + pad + 0.5, size - 1, size - 1);

        // Colorblind pattern overlay
        if (this.colorblind && !flash && this.patterns.has(type)) {
            ctx.fillStyle = this.patterns.get(type);
            ctx.fillRect(px + pad + 2, py + pad + 2, size - 4, size - 4);
        }

        ctx.restore();
    }

    /**
     * Redraws Layer 3 every frame: ghost piece, active piece, line clear flash, particles, popups.
     */
    renderFrame(engine, timestamp) {
        const ctx = this.activeCtx;
        const w = COLS * this.cellSize;
        const h = VISIBLE_ROWS * this.cellSize;
        ctx.clearRect(0, 0, w, h);

        // Danger vignette when stack height >= 16
        const stackHeight = engine.board.getStackHeight();
        if (
            stackHeight >= 16 &&
            (engine.state === GAME_STATES.PLAYING || engine.state === GAME_STATES.LINE_CLEARING)
        ) {
            const pulse = 0.25 + 0.25 * Math.sin((timestamp / 1000) * Math.PI * 6);
            ctx.save();
            ctx.strokeStyle = this.theme.danger;
            ctx.globalAlpha = pulse;
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, w - 6, h - 6);
            ctx.restore();
        }

        // Hard-drop laser trails
        for (let i = this.hardDropTrails.length - 1; i >= 0; i--) {
            const trail = this.hardDropTrails[i];
            const alpha = (trail.life / trail.maxLife) * 0.32;
            ctx.save();
            for (const b of trail.blocks) {
                if (b.endY >= VISIBLE_ROWS) continue;
                const px = b.x * this.cellSize + 2;
                const topY = Math.max(0, (VISIBLE_ROWS - 1 - b.y) * this.cellSize);
                const botY = (VISIBLE_ROWS - b.endY) * this.cellSize;
                const grad = ctx.createLinearGradient(0, topY, 0, botY);
                grad.addColorStop(0, 'rgba(255,255,255,0)');
                grad.addColorStop(1, trail.color);
                ctx.globalAlpha = alpha;
                ctx.fillStyle = grad;
                ctx.fillRect(px, topY, this.cellSize - 4, Math.max(0, botY - topY));
            }
            ctx.restore();
            trail.life--;
            if (trail.life <= 0) {
                this.hardDropTrails.splice(i, 1);
            }
        }

        // Ghost & Active Piece
        if (
            engine.activePiece &&
            (engine.state === GAME_STATES.PLAYING ||
                engine.state === GAME_STATES.PAUSED ||
                engine.state === GAME_STATES.COUNTDOWN ||
                engine.state === GAME_STATES.REPLAY)
        ) {
            const piece = engine.activePiece;
            const blocks = piece.getBlocks();
            const ghostY = engine.board.getGhostY(piece);

            // Ghost piece (20% opacity)
            if (ghostY !== piece.y) {
                for (let i = 0; i < blocks.length; i++) {
                    const bx = piece.x + blocks[i][0];
                    const by = ghostY + blocks[i][1];
                    if (by < VISIBLE_ROWS) {
                        this.drawBlock(ctx, bx, by, piece.type, { alpha: 0.2, glow: 0, ghost: true });
                    }
                }
            }

            // Active piece with subtle 2Hz pulse
            const pulse = 0.85 + 0.15 * Math.sin((timestamp / 1000) * Math.PI * 4);
            for (let i = 0; i < blocks.length; i++) {
                const bx = piece.x + blocks[i][0];
                const by = piece.y + blocks[i][1];
                if (by < VISIBLE_ROWS) {
                    this.drawBlock(ctx, bx, by, piece.type, { alpha: pulse, glow: 14 });
                }
            }

            // Lock-delay glow bar when grounded
            if (engine.isGrounded && engine.state === GAME_STATES.PLAYING) {
                const remain = Math.max(0, 1 - engine.lockTimer / LOCK_DELAY_FRAMES);
                const resetsLeft = Math.max(0, MAX_LOCK_RESETS - engine.lockResets);
                const barW = w * 0.45;
                const barX = (w - barW) / 2;
                const barY = h - 8;
                ctx.save();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                ctx.fillRect(barX, barY, barW, 4);
                ctx.fillStyle = resetsLeft <= 3 ? this.theme.danger : this.theme.accent;
                ctx.fillRect(barX, barY, barW * remain, 4);
                ctx.restore();
            }
        }

        // Line clear flash animation
        if (engine.state === GAME_STATES.LINE_CLEARING && engine.pendingClearRows.length > 0) {
            const totalClear = Math.max(1, engine.lineClearFrames);
            const progress = engine.lineClearTimer / totalClear;
            if (progress < 0.4) {
                // Flash white
                const flashAlpha = 0.6 + 0.4 * Math.sin(progress * Math.PI * 10);
                for (const row of engine.pendingClearRows) {
                    if (row >= VISIBLE_ROWS) continue;
                    const py = (VISIBLE_ROWS - 1 - row) * this.cellSize;
                    ctx.save();
                    ctx.globalAlpha = flashAlpha;
                    ctx.fillStyle = '#ffffff';
                    ctx.shadowColor = this.theme.accent;
                    ctx.shadowBlur = 16;
                    ctx.fillRect(0, py, w, this.cellSize);
                    ctx.restore();
                }
                this.burstSpawnedForClear = false;
            } else if (!this.burstSpawnedForClear) {
                this.burstSpawnedForClear = true;
                for (const row of engine.pendingClearRows) {
                    if (row >= VISIBLE_ROWS) continue;
                    const py = (VISIBLE_ROWS - 1 - row) * this.cellSize;
                    const rowColors = [];
                    for (let x = 0; x < COLS; x++) {
                        const id = engine.board.grid[row][x];
                        const type = ID_TO_PIECE[id] || 'I';
                        rowColors.push(this.getPieceColor(type));
                    }
                    this.particles.spawnRowBurst(py, COLS, this.cellSize, rowColors);
                }
            }
        } else {
            this.burstSpawnedForClear = false;
        }

        this.particles.update();
        this.particles.render(ctx, w, h);
    }

    /**
     * Renders a single tetromino centered inside a small preview canvas (Hold / Next).
     */
    renderPreview(canvas, type) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (!type) return;
        const blocks = PIECE_SHAPES[type][0];
        let minX = 4, maxX = -1, minY = 4, maxY = -1;
        for (const [bx, by] of blocks) {
            if (bx < minX) minX = bx;
            if (bx > maxX) maxX = bx;
            if (by < minY) minY = by;
            if (by > maxY) maxY = by;
        }

        const spanX = maxX - minX + 1;
        const spanY = maxY - minY + 1;
        const cell = Math.min(w / 5, h / 3.5);
        const offsetX = (w - spanX * cell) / 2;
        const offsetY = (h - spanY * cell) / 2;
        const color = this.getPieceColor(type);

        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;

        for (const [bx, by] of blocks) {
            const px = offsetX + (bx - minX) * cell;
            // Invert Y because +by is up
            const py = offsetY + (maxY - by) * cell;
            const pad = 1.5;
            const size = cell - pad * 2;

            ctx.fillStyle = color;
            ctx.fillRect(px + pad, py + pad, size, size);
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(10, 10, 15, 0.45)';
            ctx.fillRect(px + pad + 2, py + pad + 2, size - 4, size - 4);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.2;
            ctx.strokeRect(px + pad + 0.5, py + pad + 0.5, size - 1, size - 1);

            if (this.colorblind && this.patterns.has(type)) {
                ctx.fillStyle = this.patterns.get(type);
                ctx.fillRect(px + pad + 2, py + pad + 2, size - 4, size - 4);
            }
            ctx.shadowBlur = 8;
        }

        ctx.restore();
    }
}
