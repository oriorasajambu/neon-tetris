/**
 * Particle burst system and floating text popups for line clears, T-Spins, and All-Clears.
 */
export class ParticleSystem {
    constructor() {
        this.particles = [];
        this.popups = [];
        this.allClearFlash = 0;
    }

    reset() {
        this.particles = [];
        this.popups = [];
        this.allClearFlash = 0;
    }

    /**
     * Spawns neon particles across a cleared row.
     * @param {number} canvasY Y pixel coordinate of the row top
     * @param {number} cols Number of columns
     * @param {number} cellSize Logical cell size in px
     * @param {string[]} rowColors Array of hex colors for each cell in the row
     */
    spawnRowBurst(canvasY, cols, cellSize, rowColors) {
        for (let c = 0; c < cols; c++) {
            const color = rowColors[c] || '#00fff7';
            const cx = (c + 0.5) * cellSize;
            const cy = canvasY + 0.5 * cellSize;
            for (let i = 0; i < 6; i++) {
                this.particles.push({
                    x: cx + (Math.random() - 0.5) * cellSize * 0.6,
                    y: cy + (Math.random() - 0.5) * cellSize * 0.6,
                    vx: (Math.random() - 0.5) * 6,
                    vy: (Math.random() - 0.85) * 6,
                    size: 2 + Math.random() * 3.5,
                    color,
                    alpha: 1,
                    life: 1,
                    decay: 0.02 + Math.random() * 0.02
                });
            }
        }
    }

    /**
     * Spawns a floating text popup.
     */
    spawnPopup(text, subText, x, y, color = '#00fff7') {
        // Offset slightly if another popup is nearby
        const offset = this.popups.length * 24;
        this.popups.push({
            text,
            subText,
            x,
            y: y - offset,
            vy: -0.9,
            alpha: 1,
            color,
            life: 60
        });
    }

    triggerAllClearFlash() {
        this.allClearFlash = 1.0;
    }

    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.14; // subtle gravity
            p.life -= p.decay;
            p.alpha = Math.max(0, p.life);
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        for (let i = this.popups.length - 1; i >= 0; i--) {
            const pop = this.popups[i];
            pop.y += pop.vy;
            pop.life--;
            if (pop.life < 20) {
                pop.alpha = Math.max(0, pop.life / 20);
            }
            if (pop.life <= 0) {
                this.popups.splice(i, 1);
            }
        }

        if (this.allClearFlash > 0) {
            this.allClearFlash = Math.max(0, this.allClearFlash - 0.04);
        }
    }

    render(ctx, width, height) {
        if (this.particles.length > 0) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < this.particles.length; i++) {
                const p = this.particles[i];
                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 8;
                ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
            }
            ctx.restore();
        }

        if (this.popups.length > 0) {
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let i = 0; i < this.popups.length; i++) {
                const pop = this.popups[i];
                ctx.globalAlpha = pop.alpha;
                ctx.shadowColor = pop.color;
                ctx.shadowBlur = 12;
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
                ctx.fillText(pop.text, pop.x, pop.y);
                if (pop.subText) {
                    ctx.fillStyle = pop.color;
                    ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
                    ctx.fillText(pop.subText, pop.x, pop.y + 18);
                }
            }
            ctx.restore();
        }

        if (this.allClearFlash > 0) {
            ctx.save();
            ctx.globalAlpha = this.allClearFlash * 0.55;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    }
}
