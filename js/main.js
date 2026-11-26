import {
    COLS,
    FRAME_DURATION,
    GAME_STATES,
    GAME_MODES,
    AI_TIERS,
    THEMES,
    ACTIONS,
    VISIBLE_ROWS
} from './constants.js';
import { GameEngine } from './engine.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { InputHandler } from './input.js';
import { StorageManager } from './storage.js';
import { ReplayRecorder, ReplayPlayer } from './replay.js';
import { UIManager } from './ui.js';
import { findBestMove } from './ai-core.js';

document.addEventListener('DOMContentLoaded', () => {
    const storage = new StorageManager();
    let settings = storage.loadSettings();

    const audio = new AudioEngine();
    audio.setVolume(settings.volume);
    audio.setMusicVolume(settings.musicVolume);
    audio.setMusicEnabled(settings.musicEnabled);
    audio.setMuted(settings.muted);

    const bgCanvas = document.getElementById('canvas-bg');
    const lockedCanvas = document.getElementById('canvas-locked');
    const activeCanvas = document.getElementById('canvas-active');
    const boardWrapper = document.getElementById('board-wrapper');

    const oppBgCanvas = document.getElementById('opp-canvas-bg');
    const oppLockedCanvas = document.getElementById('opp-canvas-locked');
    const oppActiveCanvas = document.getElementById('opp-canvas-active');

    const renderer = new Renderer(bgCanvas, lockedCanvas, activeCanvas);
    const oppRenderer = new Renderer(oppBgCanvas, oppLockedCanvas, oppActiveCanvas);

    const applyTheme = (themeKey) => {
        const theme = THEMES[themeKey] || THEMES.cyberpunk;
        const root = document.documentElement.style;
        root.setProperty('--bg', theme.background);
        root.setProperty('--cyan', theme.accent);
        root.setProperty('--red', theme.danger);
        root.setProperty('--border', `${theme.accent}59`);
        renderer.setTheme(themeKey);
        oppRenderer.setTheme(themeKey);
    };

    applyTheme(settings.theme);
    renderer.setColorblind(settings.colorblind);
    oppRenderer.setColorblind(settings.colorblind);

    let recorder = null;
    let replayPlayer = null;
    let ghostPlayer = null;
    let activeMode = GAME_MODES.MARATHON;
    let activeAiTier = 'rival';
    let gameStartTime = 0;
    let rafId = null;
    let lastTimestamp = 0;
    let accumulator = 0;

    // AI Worker & execution state
    let aiWorker = null;
    try {
        aiWorker = new Worker('./js/ai-worker.js', { type: 'module' });
    } catch {
        aiWorker = null;
    }
    let aiRequestSeq = 0;
    let aiPendingId = null;
    let aiPlan = null;
    let aiLastPieceObj = null;
    let aiStepCooldown = 0;

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

    const oppEngine = new GameEngine({
        boardChanged: () => oppRenderer.drawLockedBoard(oppEngine.board),
        hardDropTrail: (payload) => oppRenderer.addHardDropTrail(payload),
        garbageChanged: (lines) => ui.updateGarbageMeter(ui.hud.oppGarbageFill, lines),
        attack: ({ lines }) => {
            if (activeMode === GAME_MODES.VS_AI && engine.state === GAME_STATES.PLAYING) {
                engine.receiveGarbage(lines);
            }
        },
        gameOver: () => {
            if (activeMode === GAME_MODES.VS_AI && engine.state === GAME_STATES.PLAYING) {
                engine.triggerVictory();
            }
        }
    });

    if (aiWorker) {
        aiWorker.onmessage = (event) => {
            const { id, plan } = event.data;
            if (id === aiPendingId) {
                aiPlan = plan;
                aiPendingId = null;
            }
        };
    }

    function requestAiPlan() {
        if (!oppEngine.activePiece || oppEngine.state !== GAME_STATES.PLAYING) return;
        const tier = AI_TIERS[activeAiTier] || AI_TIERS.rival;
        const payload = {
            grid: oppEngine.board.cloneFlatGrid(),
            pieceType: oppEngine.activePiece.type,
            holdType: oppEngine.holdType,
            nextQueue: oppEngine.getNextQueue(),
            depth: tier.depth,
            mistakeRate: tier.mistakeRate
        };
        aiRequestSeq++;
        aiPendingId = aiRequestSeq;
        aiPlan = null;

        if (aiWorker) {
            aiWorker.postMessage({ id: aiRequestSeq, payload }, [payload.grid.buffer]);
        } else {
            aiPlan = findBestMove(payload);
            aiPendingId = null;
        }
    }

    function stepAiController() {
        if (activeMode !== GAME_MODES.VS_AI || oppEngine.state !== GAME_STATES.PLAYING) return;
        if (!oppEngine.activePiece) return;

        if (oppEngine.activePiece !== aiLastPieceObj) {
            aiLastPieceObj = oppEngine.activePiece;
            const tier = AI_TIERS[activeAiTier] || AI_TIERS.rival;
            aiStepCooldown = Math.max(2, Math.round(60 / tier.pps / 4));
            requestAiPlan();
        }

        if (!aiPlan) return;
        if (aiStepCooldown > 0) {
            aiStepCooldown--;
            return;
        }

        const tier = AI_TIERS[activeAiTier] || AI_TIERS.rival;
        aiStepCooldown = Math.max(1, Math.round(60 / tier.pps / 5));

        if (aiPlan.useHold && !oppEngine.holdUsed) {
            aiPlan.useHold = false;
            oppEngine.hold();
            return;
        }

        const piece = oppEngine.activePiece;
        if (piece.rotation !== aiPlan.targetRotation) {
            const diff = (aiPlan.targetRotation - piece.rotation + 4) % 4;
            oppEngine.rotate(diff === 3 ? -1 : 1);
            return;
        }

        if (piece.x < aiPlan.targetX) {
            if (!oppEngine.move(1, true)) oppEngine.hardDrop();
            return;
        }
        if (piece.x > aiPlan.targetX) {
            if (!oppEngine.move(-1, true)) oppEngine.hardDrop();
            return;
        }

        oppEngine.hardDrop();
    }

    const engine = new GameEngine({
        boardChanged: () => renderer.drawLockedBoard(engine.board),
        hudChanged: () => {
            ui.updateHUD(engine, renderer);
            const danger = engine.board.getStackHeight() >= 16;
            const hue = danger ? 348 : (178 + (engine.level - 1) * 14) % 360;
            document.documentElement.style.setProperty('--level-hue', String(hue));
            audio.updateMusicState({
                level: engine.level,
                b2b: engine.b2bActive,
                danger
            });
        },
        sound: (evt) => audio.play(evt),
        hardDropTrail: (payload) => renderer.addHardDropTrail(payload),
        garbageChanged: (lines) => ui.updateGarbageMeter(ui.hud.playerGarbageFill, lines),
        attack: ({ lines }) => {
            if (activeMode === GAME_MODES.VS_AI && oppEngine.state === GAME_STATES.PLAYING) {
                oppEngine.receiveGarbage(lines);
            }
        },
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
                audio.stopMusic();
                ui.showOverlay('pause');
            } else if (newState === GAME_STATES.COUNTDOWN) {
                ui.showOverlay('countdown');
                ui.updateCountdown(engine.countdownValue);
                startLoop();
            } else if (newState === GAME_STATES.PLAYING) {
                ui.hideAllOverlays();
                audio.startMusic();
            }
        },
        gameOver: (summary) => {
            if (replayPlayer) {
                replayPlayer.paused = true;
                audio.stopMusic();
                return;
            }
            stopLoop();
            audio.stopMusic();
            const durationSec = (performance.now() - gameStartTime) / 1000;
            storage.recordGameStats({
                score: summary.score,
                lines: summary.lines,
                tSpins: summary.tSpins,
                durationSec
            });
            const { isNewBest } = storage.recordModeResult(summary);
            let isNewHigh = isNewBest;
            if (summary.mode === GAME_MODES.MARATHON) {
                const res = storage.addHighScore(summary);
                isNewHigh = res.isNewHigh;
            }
            ui.updateMenuHighScore();
            ui.showGameOver({
                ...summary,
                isNewHigh,
                onSaveReplay: () => {
                    if (!recorder) return false;
                    return storage.saveReplay(
                        recorder.serialize({
                            finalScore: summary.score,
                            lines: summary.lines,
                            timeMs: summary.timeMs
                        })
                    );
                }
            });
        }
    });
    engine.nextCount = settings.nextCount;

    const handleAction = (actionId, _flag) => {
        if (replayPlayer) return;
        audio.init();

        // IRS / IHS buffering during line-clear / countdown / ARE
        if (engine.state !== GAME_STATES.PLAYING || engine.areTimer > 0) {
            if (actionId === ACTIONS.ROTATE_CW || actionId === ACTIONS.ROTATE_CCW || actionId === ACTIONS.ROTATE_180) {
                const dir = actionId === ACTIONS.ROTATE_CW ? 1 : actionId === ACTIONS.ROTATE_CCW ? -1 : 2;
                if (engine.bufferInput('rotate', dir) && recorder) {
                    recorder.record(engine.frameCount, actionId);
                }
            } else if (actionId === ACTIONS.HOLD) {
                if (engine.bufferInput('hold') && recorder) {
                    recorder.record(engine.frameCount, actionId);
                }
            } else if (actionId === ACTIONS.SOFT_DROP_END && engine.softDropping) {
                engine.softDropping = false;
                if (recorder) recorder.record(engine.frameCount, ACTIONS.SOFT_DROP_END);
            }
            return;
        }

        if (actionId === ACTIONS.SOFT_DROP) {
            if (!engine.softDropping) {
                engine.softDropping = true;
                engine.markPlayerInput();
                if (recorder) recorder.record(engine.frameCount, ACTIONS.SOFT_DROP);
            }
            return;
        }

        if (actionId === ACTIONS.SOFT_DROP_END) {
            if (engine.softDropping) {
                engine.softDropping = false;
                if (recorder) recorder.record(engine.frameCount, ACTIONS.SOFT_DROP_END);
            }
            return;
        }

        if (recorder) {
            recorder.record(engine.frameCount, actionId);
        }

        switch (actionId) {
            case ACTIONS.LEFT: engine.move(-1); break;
            case ACTIONS.RIGHT: engine.move(1); break;
            case ACTIONS.WALL_SNAP_LEFT: engine.wallSnap(-1); break;
            case ACTIONS.WALL_SNAP_RIGHT: engine.wallSnap(1); break;
            case ACTIONS.HARD_DROP: engine.hardDrop(); break;
            case ACTIONS.ROTATE_CW: engine.rotate(1); break;
            case ACTIONS.ROTATE_CCW: engine.rotate(-1); break;
            case ACTIONS.ROTATE_180: engine.rotate(2); break;
            case ACTIONS.HOLD: engine.hold(); break;
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

    const startNewGame = ({ mode = activeMode, aiTier = activeAiTier, ghostData = null } = {}) => {
        activeMode = ghostData ? (ghostData.mode || GAME_MODES.SPRINT) : mode;
        activeAiTier = aiTier;
        replayPlayer = null;
        ghostPlayer = null;
        aiPlan = null;
        aiPendingId = null;
        aiLastPieceObj = null;

        ui.hud.replayBar.classList.add('hidden');
        renderer.particles.reset();
        oppRenderer.particles.reset();

        const seed = ghostData ? ghostData.seed : (Date.now() >>> 0);
        const tuning = {
            das: settings.das,
            arr: settings.arr,
            sdf: settings.sdf,
            areFrames: settings.areFrames,
            lineClearFrames: settings.lineClearFrames
        };

        recorder = new ReplayRecorder(seed, { mode: activeMode, tuning });
        gameStartTime = performance.now();
        engine.replayMode = false;
        engine.startNewGame(seed, { mode: activeMode, ...tuning });

        if (activeMode === GAME_MODES.VS_AI) {
            const tierInfo = AI_TIERS[activeAiTier] || AI_TIERS.rival;
            oppEngine.startNewGame(seed, { mode: GAME_MODES.VS_AI, sdf: 20, areFrames: 0, lineClearFrames: 12 });
            ui.setDualMode(true, `AI: ${tierInfo.label.toUpperCase()}`, true);
        } else if (ghostData) {
            ghostPlayer = new ReplayPlayer(oppEngine, ghostData);
            ghostPlayer.start();
            ui.setDualMode(true, 'GHOST PB', false);
        } else {
            ui.setDualMode(false);
        }

        updateCanvasScale();
        ui.hideAllOverlays();
        audio.startMusic();
        startLoop();
    };

    const ui = new UIManager({
        storage,
        input,
        audio,
        onStartGame: (opts) => startNewGame(opts),
        onResume: () => engine.resume(),
        onRestart: () => startNewGame({ mode: activeMode, aiTier: activeAiTier }),
        onQuitToMenu: () => {
            stopLoop();
            audio.stopMusic();
            replayPlayer = null;
            ghostPlayer = null;
            ui.setDualMode(false);
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
            audio.setMusicVolume(updated.musicVolume);
            audio.setMusicEnabled(updated.musicEnabled);
            audio.setMuted(updated.muted);
            applyTheme(updated.theme);
            renderer.setColorblind(updated.colorblind);
            oppRenderer.setColorblind(updated.colorblind);
            renderer.drawLockedBoard(engine.board);
            oppRenderer.drawLockedBoard(oppEngine.board);
            engine.sdf = updated.sdf;
            engine.areFrames = updated.areFrames;
            engine.lineClearFrames = updated.lineClearFrames;
            engine.nextCount = updated.nextCount;
            ui.renderControlsLegend(updated.keybindings);
            ui.ensureNextSlots(updated.nextCount);
            ui.updateHUD(engine, renderer);
        },
        onWatchReplay: (slot) => {
            const data = storage.loadReplay(slot);
            if (!data) return;
            ghostPlayer = null;
            ui.setDualMode(false);
            replayPlayer = new ReplayPlayer(engine, data);
            replayPlayer.start();
            renderer.particles.reset();
            ui.hideAllOverlays();
            ui.hud.replayBar.classList.remove('hidden');
            ui.hud.replaySpeedBtn.textContent = '1x';
            ui.hud.replayToggleBtn.textContent = 'Pause';
            startLoop();
        },
        onRaceGhost: (slot) => {
            const data = storage.loadReplay(slot);
            if (!data) return;
            startNewGame({ ghostData: data });
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
        audio.stopMusic();
        replayPlayer = null;
        ui.hud.replayBar.classList.add('hidden');
        engine.state = GAME_STATES.MENU;
        ui.showOverlay('menu');
    });

    function loop(timestamp) {
        if (!lastTimestamp) lastTimestamp = timestamp;
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

                if (activeMode === GAME_MODES.VS_AI) {
                    stepAiController();
                    oppEngine.stepFrame();
                    const oppSecs = Math.max(0.01, (oppEngine.elapsedFrames * FRAME_DURATION) / 1000);
                    ui.hud.oppStats.textContent = `${oppEngine.lines}L • ${(oppEngine.piecesLocked / oppSecs).toFixed(2)} PPS`;
                } else if (ghostPlayer) {
                    ghostPlayer.step();
                    ui.hud.oppStats.textContent = `${oppEngine.lines}L • ${oppEngine.score.toLocaleString()}`;
                }

                if (engine.state === GAME_STATES.COUNTDOWN) {
                    ui.updateCountdown(engine.countdownValue);
                }
            }
            accumulator -= FRAME_DURATION;
        }

        renderer.renderFrame(engine, timestamp);
        if (activeMode === GAME_MODES.VS_AI || ghostPlayer) {
            oppRenderer.renderFrame(oppEngine, timestamp);
        }

        if (
            engine.state !== GAME_STATES.PAUSED &&
            engine.state !== GAME_STATES.MENU &&
            engine.state !== GAME_STATES.GAME_OVER &&
            engine.state !== GAME_STATES.VICTORY
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

    function updateCanvasScale() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const isMobile = vw < 768;
        const isDual = activeMode === GAME_MODES.VS_AI || Boolean(ghostPlayer);
        const isDualDesktop = isDual && vw >= 1200;

        const targetH = isMobile ? vh * 0.54 : vh * 0.84;
        const maxByHeight = Math.floor(targetH / VISIBLE_ROWS);

        const wingCols = isMobile ? 0 : 11.5;
        const boardCols = isDualDesktop ? COLS * 2 + 2 : COLS;
        const maxByWidth = Math.floor((vw - 48) / (boardCols + wingCols));

        const cellSize = Math.max(16, Math.min(64, Math.min(maxByHeight, maxByWidth)));
        const boardH = cellSize * VISIBLE_ROWS;
        const boardW = cellSize * COLS;
        const wingW = Math.max(148, Math.round(cellSize * 5.2));
        const oppCellSize = isDualDesktop ? cellSize : (isMobile ? 9 : 14);

        const rootStyle = document.documentElement.style;
        rootStyle.setProperty('--board-h', `${boardH}px`);
        rootStyle.setProperty('--board-w', `${boardW}px`);
        rootStyle.setProperty('--cell-size', `${cellSize}px`);
        rootStyle.setProperty('--wing-w', `${wingW}px`);

        document.querySelector('.game-shell').classList.toggle('dual-desktop', isDualDesktop);
        ui.hud.playLayout.classList.toggle('dual-desktop', isDualDesktop);

        renderer.resize(cellSize);
        renderer.drawLockedBoard(engine.board);
        oppRenderer.resize(oppCellSize);
        oppRenderer.drawLockedBoard(oppEngine.board);
    }

    // Lightweight 30-particle atmospheric background loop
    const ambientCanvas = document.getElementById('ambient-bg');
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (ambientCanvas && !reducedMotion) {
        const actx = ambientCanvas.getContext('2d');
        const dots = Array.from({ length: 30 }, () => ({
            x: Math.random(),
            y: Math.random(),
            r: 1 + Math.random() * 1.8,
            vy: -0.00025 - Math.random() * 0.00045,
            a: 0.12 + Math.random() * 0.25
        }));
        const resizeAmbient = () => {
            ambientCanvas.width = window.innerWidth;
            ambientCanvas.height = window.innerHeight;
        };
        resizeAmbient();
        window.addEventListener('resize', resizeAmbient);

        const tickAmbient = () => {
            const w = ambientCanvas.width;
            const h = ambientCanvas.height;
            actx.clearRect(0, 0, w, h);
            const hue = getComputedStyle(document.documentElement).getPropertyValue('--level-hue').trim() || '178';
            actx.fillStyle = `hsl(${hue}, 100%, 65%)`;
            for (let i = 0; i < dots.length; i++) {
                const d = dots[i];
                d.y += d.vy;
                if (d.y < -0.02) {
                    d.y = 1.02;
                    d.x = Math.random();
                }
                actx.globalAlpha = d.a;
                actx.beginPath();
                actx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2);
                actx.fill();
            }
            requestAnimationFrame(tickAmbient);
        };
        requestAnimationFrame(tickAmbient);
    }

    window.addEventListener('resize', updateCanvasScale);

    input.attach();
    input.bindTouchButtons(document.getElementById('touch-controls'));
    updateCanvasScale();
    ui.renderControlsLegend(settings.keybindings);
    ui.ensureNextSlots(settings.nextCount);
    ui.updateSessionPanel(null, ui.selectedMode);
    ui.updateMenuHighScore();
    ui.updateMuteButton(settings.muted);
    ui.showOverlay('menu');
});
