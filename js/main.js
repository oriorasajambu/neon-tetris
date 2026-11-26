import { COLS, FRAME_DURATION, GAME_STATES, VISIBLE_ROWS } from './constants.js';
import { GameEngine } from './engine.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { InputHandler } from './input.js';
import { StorageManager } from './storage.js';
import { ReplayRecorder, ReplayPlayer } from './replay.js';
import { UIManager } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    const storage = new StorageManager();
    let settings = storage.loadSettings();

    const audio = new AudioEngine();
    audio.setVolume(settings.volume);
    audio.setMuted(settings.muted);

    const bgCanvas = document.getElementById('canvas-bg');
    const lockedCanvas = document.getElementById('canvas-locked');
    const activeCanvas = document.getElementById('canvas-active');
    const boardWrapper = document.getElementById('board-wrapper');

    const renderer = new Renderer(bgCanvas, lockedCanvas, activeCanvas);
    renderer.setColorblind(settings.colorblind);

    let recorder = null;
    let replayPlayer = null;
    let gameStartTime = 0;
    let rafId = null;
    let lastTimestamp = 0;
    let accumulator = 0;

    const triggerScreenShake = (intensity = 4, durationMs = 200) => {
        const start = performance.now();
        const shake = (now) => {
            const elapsed = now - start;
            if (elapsed >= durationMs) {
                boardWrapper.style.transform = '';
                return;
            }
            const decay = 1 - elapsed / durationMs;
            const dx = (Math.random() * 2 - 1) * intensity * decay;
            const dy = (Math.random() * 2 - 1) * intensity * decay;
            boardWrapper.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
            requestAnimationFrame(shake);
        };
        requestAnimationFrame(shake);
    };

    const engine = new GameEngine({
        boardChanged: () => renderer.drawLockedBoard(engine.board),
        hudChanged: () => ui.updateHUD(engine, renderer),
        sound: (evt) => audio.play(evt),
        popup: ({ label, points, y }) => {
            const cx = (COLS * renderer.cellSize) / 2;
            const cy = Math.max(40, (VISIBLE_ROWS - 1 - y) * renderer.cellSize);
            renderer.particles.spawnPopup(label, points ? `+${points}` : '', cx, cy, '#ff00ff');
        },
        lineClearStart: ({ rows, points, label, tSpin, allClear }) => {
            const avgRow = rows.reduce((a, b) => a + b, 0) / rows.length;
            const cx = (COLS * renderer.cellSize) / 2;
            const cy = Math.max(40, (VISIBLE_ROWS - 1 - avgRow) * renderer.cellSize);
            const color = allClear ? '#ffffff' : tSpin !== 'none' ? '#ff00ff' : '#00fff7';
            renderer.particles.spawnPopup(label, `+${points}`, cx, cy, color);
            if (allClear) {
                renderer.particles.triggerAllClearFlash();
                triggerScreenShake(5, 300);
            } else if (rows.length === 4 || tSpin !== 'none') {
                triggerScreenShake(3.5, 200);
            }
        },
        stateChanged: (newState) => {
            if (newState === GAME_STATES.PAUSED) {
                stopLoop();
                ui.showOverlay('pause');
            } else if (newState === GAME_STATES.COUNTDOWN) {
                ui.showOverlay('countdown');
                ui.updateCountdown(engine.countdownValue);
                startLoop();
            } else if (newState === GAME_STATES.PLAYING) {
                ui.hideAllOverlays();
            }
        },
        gameOver: (summary) => {
            if (replayPlayer) {
                replayPlayer.paused = true;
                return;
            }
            stopLoop();
            const durationSec = (performance.now() - gameStartTime) / 1000;
            storage.recordGameStats({
                score: summary.score,
                lines: summary.lines,
                tSpins: summary.tSpins,
                durationSec
            });
            const { isNewHigh } = storage.addHighScore(summary);
            ui.updateMenuHighScore();
            ui.showGameOver({
                ...summary,
                isNewHigh,
                onSaveReplay: () => {
                    if (!recorder) return false;
                    return storage.saveReplay(
                        recorder.serialize({
                            finalScore: summary.score,
                            lines: summary.lines
                        })
                    );
                }
            });
        }
    });
    engine.nextCount = settings.nextCount;

    const handleAction = (actionId, flag) => {
        if (replayPlayer) return;
        audio.init();

        if (actionId === 2) {
            // Soft drop toggle
            if (engine.softDropping !== Boolean(flag)) {
                engine.softDropping = Boolean(flag);
                if (flag && recorder && engine.state === GAME_STATES.PLAYING) {
                    recorder.record(engine.frameCount, actionId);
                }
            }
            return;
        }

        if (engine.state !== GAME_STATES.PLAYING) return;
        if (recorder) {
            recorder.record(engine.frameCount, actionId);
        }

        switch (actionId) {
            case 0: engine.move(-1); break;
            case 1: engine.move(1); break;
            case 3: engine.hardDrop(); break;
            case 4: engine.rotate(1); break;
            case 5: engine.rotate(-1); break;
            case 6: engine.hold(); break;
            default: break;
        }
    };

    const input = new InputHandler({
        keybindings: settings.keybindings,
        das: settings.das,
        arr: settings.arr,
        onAction: handleAction,
        onPause: () => {
            if (replayPlayer) return;
            if (engine.state === GAME_STATES.PLAYING) {
                input.resetHeld();
                engine.pause();
            } else if (engine.state === GAME_STATES.PAUSED) {
                engine.resume();
            }
        },
        onMute: () => {
            settings.muted = !settings.muted;
            audio.setMuted(settings.muted);
            storage.saveSettings(settings);
            ui.updateMuteButton(settings.muted);
        }
    });

    const startNewGame = () => {
        replayPlayer = null;
        ui.hud.replayBar.classList.add('hidden');
        renderer.particles.reset();
        const seed = Date.now() >>> 0;
        recorder = new ReplayRecorder(seed);
        gameStartTime = performance.now();
        engine.replayMode = false;
        engine.startNewGame(seed);
        ui.hideAllOverlays();
        startLoop();
    };

    const ui = new UIManager({
        storage,
        input,
        audio,
        onStartGame: startNewGame,
        onResume: () => engine.resume(),
        onRestart: startNewGame,
        onQuitToMenu: () => {
            stopLoop();
            replayPlayer = null;
            ui.hud.replayBar.classList.add('hidden');
            engine.state = GAME_STATES.MENU;
            ui.updateMenuHighScore();
            ui.showOverlay('menu');
        },
        onSettingsChanged: (updated) => {
            settings = updated;
            input.setSettings({
                keybindings: updated.keybindings,
                das: updated.das,
                arr: updated.arr
            });
            audio.setVolume(updated.volume);
            audio.setMuted(updated.muted);
            renderer.setColorblind(updated.colorblind);
            renderer.drawLockedBoard(engine.board);
            engine.nextCount = updated.nextCount;
            ui.updateHUD(engine, renderer);
        },
        onWatchReplay: (slot) => {
            const data = storage.loadReplay(slot);
            if (!data) return;
            replayPlayer = new ReplayPlayer(engine, data);
            replayPlayer.start();
            renderer.particles.reset();
            ui.hideAllOverlays();
            ui.hud.replayBar.classList.remove('hidden');
            ui.hud.replaySpeedBtn.textContent = '1x';
            ui.hud.replayToggleBtn.textContent = 'Pause';
            startLoop();
        }
    });

    // Replay bar controls
    ui.hud.replayToggleBtn.addEventListener('click', () => {
        if (!replayPlayer) return;
        replayPlayer.paused = !replayPlayer.paused;
        ui.hud.replayToggleBtn.textContent = replayPlayer.paused ? 'Play' : 'Pause';
    });

    ui.hud.replaySpeedBtn.addEventListener('click', () => {
        if (!replayPlayer) return;
        const speeds = [1, 2, 4];
        const nextIdx = (speeds.indexOf(replayPlayer.speed) + 1) % speeds.length;
        replayPlayer.speed = speeds[nextIdx];
        ui.hud.replaySpeedBtn.textContent = `${replayPlayer.speed}x`;
    });

    document.getElementById('btn-replay-exit').addEventListener('click', () => {
        stopLoop();
        replayPlayer = null;
        ui.hud.replayBar.classList.add('hidden');
        engine.state = GAME_STATES.MENU;
        ui.showOverlay('menu');
    });

    function loop(timestamp) {
        if (!lastTimestamp) lastTimestamp = timestamp;
        // Cap delta-time to 2 frames as safety net against spikes
        const delta = Math.min(timestamp - lastTimestamp, FRAME_DURATION * 2);
        lastTimestamp = timestamp;
        accumulator += delta;

        while (accumulator >= FRAME_DURATION) {
            if (replayPlayer) {
                for (let s = 0; s < replayPlayer.speed; s++) {
                    replayPlayer.step();
                }
            } else {
                if (engine.state === GAME_STATES.PLAYING) {
                    input.update(FRAME_DURATION);
                }
                engine.stepFrame();
                if (engine.state === GAME_STATES.COUNTDOWN) {
                    ui.updateCountdown(engine.countdownValue);
                }
            }
            accumulator -= FRAME_DURATION;
        }

        renderer.renderFrame(engine, timestamp);

        if (
            engine.state !== GAME_STATES.PAUSED &&
            engine.state !== GAME_STATES.MENU &&
            engine.state !== GAME_STATES.GAME_OVER
        ) {
            rafId = requestAnimationFrame(loop);
        } else {
            rafId = null;
        }
    }

    function startLoop() {
        if (rafId !== null) cancelAnimationFrame(rafId);
        lastTimestamp = 0;
        accumulator = 0;
        rafId = requestAnimationFrame(loop);
    }

    function stopLoop() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    // Auto-pause on tab visibility loss or window blur
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && engine.state === GAME_STATES.PLAYING && !replayPlayer) {
            input.resetHeld();
            engine.pause();
        }
    });
    window.addEventListener('blur', () => {
        if (engine.state === GAME_STATES.PLAYING && !replayPlayer) {
            input.resetHeld();
            engine.pause();
        }
    });

    // Responsive canvas sizing
    function updateCanvasScale() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let cellSize = 30;
        if (vw < 768) {
            cellSize = Math.floor(Math.min((vw - 32) / COLS, (vh * 0.56) / VISIBLE_ROWS));
            cellSize = Math.max(16, Math.min(26, cellSize));
        } else if (vw < 1024) {
            cellSize = 24;
        }
        renderer.resize(cellSize);
        renderer.drawLockedBoard(engine.board);
    }

    window.addEventListener('resize', updateCanvasScale);

    input.attach();
    input.bindTouchButtons(document.getElementById('touch-controls'));
    updateCanvasScale();
    ui.updateMenuHighScore();
    ui.updateMuteButton(settings.muted);
    ui.showOverlay('menu');
});
