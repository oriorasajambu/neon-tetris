import { ACTIONS } from './constants.js';

/**
 * Handles keyboard + mobile touch input with configurable DAS/ARR and key rebinding.
 */
export class InputHandler {
    constructor({ keybindings, das = 133, arr = 10, onAction, onPause, onMute }) {
        this.keybindings = keybindings;
        this.das = das;
        this.arr = arr;
        this.onAction = onAction;
        this.onPause = onPause;
        this.onMute = onMute;

        this.heldDirections = { left: false, right: false, softDrop: false };
        this.activeHorizDir = null; // 'left' | 'right' | null
        this.dasTimer = 0;
        this.arrTimer = 0;
        this.listeningCallback = null;

        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
    }

    attach() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        // Prevent iOS Safari scroll/zoom gestures inside game area
        document.addEventListener(
            'touchmove',
            (e) => {
                if (e.target.closest('.game-shell')) {
                    e.preventDefault();
                }
            },
            { passive: false }
        );
    }

    setSettings({ keybindings, das, arr }) {
        if (keybindings) this.keybindings = keybindings;
        if (typeof das === 'number') this.das = das;
        if (typeof arr === 'number') this.arr = arr;
    }

    startListeningForKey(callback) {
        this.listeningCallback = callback;
    }

    cancelListening() {
        this.listeningCallback = null;
    }

    findActionForKey(code) {
        for (const [action, codes] of Object.entries(this.keybindings)) {
            if (codes.includes(code)) return action;
        }
        return null;
    }

    handleKeyDown(e) {
        if (this.listeningCallback) {
            e.preventDefault();
            const cb = this.listeningCallback;
            this.listeningCallback = null;
            cb(e.code);
            return;
        }

        const action = this.findActionForKey(e.code);
        if (!action) return;

        e.preventDefault();
        if (e.repeat) return; // Ignore OS key repeat; we manage DAS/ARR ourselves

        this.triggerPress(action);
    }

    handleKeyUp(e) {
        const action = this.findActionForKey(e.code);
        if (!action) return;
        this.triggerRelease(action);
    }

    triggerPress(action) {
        switch (action) {
            case 'left':
                this.heldDirections.left = true;
                this.activeHorizDir = 'left';
                this.dasTimer = 0;
                this.arrTimer = 0;
                this.onAction(ACTIONS.LEFT);
                break;
            case 'right':
                this.heldDirections.right = true;
                this.activeHorizDir = 'right';
                this.dasTimer = 0;
                this.arrTimer = 0;
                this.onAction(ACTIONS.RIGHT);
                break;
            case 'softDrop':
                this.heldDirections.softDrop = true;
                this.onAction(ACTIONS.SOFT_DROP, true);
                break;
            case 'hardDrop':
                this.onAction(ACTIONS.HARD_DROP);
                break;
            case 'rotateCW':
                this.onAction(ACTIONS.ROTATE_CW);
                break;
            case 'rotateCCW':
                this.onAction(ACTIONS.ROTATE_CCW);
                break;
            case 'hold':
                this.onAction(ACTIONS.HOLD);
                break;
            case 'pause':
                if (this.onPause) this.onPause();
                break;
            case 'mute':
                if (this.onMute) this.onMute();
                break;
            default:
                break;
        }
    }

    triggerRelease(action) {
        if (action === 'left') {
            this.heldDirections.left = false;
            if (this.activeHorizDir === 'left') {
                this.activeHorizDir = this.heldDirections.right ? 'right' : null;
                this.dasTimer = 0;
                this.arrTimer = 0;
            }
        } else if (action === 'right') {
            this.heldDirections.right = false;
            if (this.activeHorizDir === 'right') {
                this.activeHorizDir = this.heldDirections.left ? 'left' : null;
                this.dasTimer = 0;
                this.arrTimer = 0;
            }
        } else if (action === 'softDrop') {
            this.heldDirections.softDrop = false;
            this.onAction(ACTIONS.SOFT_DROP, false);
        }
    }

    /**
     * Advances DAS/ARR timers by deltaMs (called once per logical frame).
     */
    update(deltaMs) {
        if (!this.activeHorizDir) return;
        const actionId = this.activeHorizDir === 'left' ? ACTIONS.LEFT : ACTIONS.RIGHT;

        if (this.dasTimer < this.das) {
            this.dasTimer += deltaMs;
            return;
        }

        if (this.arr === 0) {
            // Instant wall slide (0 ARR)
            for (let i = 0; i < 10; i++) {
                this.onAction(actionId);
            }
            return;
        }

        this.arrTimer += deltaMs;
        while (this.arrTimer >= this.arr) {
            this.arrTimer -= this.arr;
            this.onAction(actionId);
        }
    }

    /**
     * Binds mobile touch buttons with haptic feedback and DAS/ARR support.
     */
    bindTouchButtons(container) {
        const buttons = container.querySelectorAll('[data-action]');
        buttons.forEach((btn) => {
            const action = btn.dataset.action;

            btn.addEventListener(
                'touchstart',
                (e) => {
                    e.preventDefault();
                    if (navigator.vibrate) {
                        navigator.vibrate(10);
                    }
                    btn.classList.add('active');
                    this.triggerPress(action);
                },
                { passive: false }
            );

            const release = (e) => {
                e.preventDefault();
                btn.classList.remove('active');
                this.triggerRelease(action);
            };

            btn.addEventListener('touchend', release, { passive: false });
            btn.addEventListener('touchcancel', release, { passive: false });
        });
    }

    resetHeld() {
        this.heldDirections = { left: false, right: false, softDrop: false };
        this.activeHorizDir = null;
        this.dasTimer = 0;
        this.arrTimer = 0;
        this.onAction(ACTIONS.SOFT_DROP, false);
    }
}
