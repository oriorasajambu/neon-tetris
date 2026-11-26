import { DEFAULT_KEYBINDINGS, ULTRA_DURATION_FRAMES, FRAME_DURATION, SPRINT_TARGET_LINES, CHEESE_TARGET_LINES } from './constants.js';

const ACTION_LABELS = {
    left: 'Move Left',
    right: 'Move Right',
    softDrop: 'Soft Drop',
    hardDrop: 'Hard Drop',
    rotateCW: 'Rotate CW',
    rotateCCW: 'Rotate CCW',
    rotate180: 'Rotate 180°',
    hold: 'Hold Piece',
    pause: 'Pause',
    mute: 'Mute Audio'
};

const MODE_OBJECTIVES = {
    marathon: 'Survive endless escalating gravity and chase high scores.',
    sprint: 'Clear 40 lines as fast as possible. Timer starts on first input.',
    ultra: 'Score as many points as possible within 2 minutes.',
    cheese: 'Dig through 18 garbage lines to reach the bottom.',
    zen: 'Relaxed endless practice with automatic top-out recovery.',
    vs_ai: 'Battle a real-time heuristic AI with garbage attacks.'
};

const LEGEND_ACTIONS = [
    ['Move', ['left', 'right']],
    ['Soft / Hard', ['softDrop', 'hardDrop']],
    ['Rotate', ['rotateCCW', 'rotateCW', 'rotate180']],
    ['Hold', ['hold']]
];

function formatKeyCode(code) {
    if (!code) return '?';
    const map = {
        ArrowLeft: '←',
        ArrowRight: '→',
        ArrowDown: '↓',
        ArrowUp: '↑',
        Space: 'SPACE',
        ShiftLeft: 'SHIFT',
        ShiftRight: 'R-SHIFT',
        Escape: 'ESC'
    };
    if (map[code]) return map[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
}

export function formatTimeMs(ms) {
    const clamped = Math.max(0, ms);
    const totalSec = Math.floor(clamped / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const tenths = Math.floor((clamped % 1000) / 100);
    return `${mins}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export class UIManager {
    constructor({ storage, input, audio, onStartGame, onResume, onRestart, onQuitToMenu, onSettingsChanged, onWatchReplay, onRaceGhost }) {
        this.storage = storage;
        this.input = input;
        this.audio = audio;
        this.callbacks = { onStartGame, onResume, onRestart, onQuitToMenu, onSettingsChanged, onWatchReplay, onRaceGhost };
        this.returnOverlay = 'menu';
        this.selectedMode = 'marathon';
        this.selectedAiTier = 'rival';

        this.cacheElements();
        this.bindEvents();
    }

    cacheElements() {
        this.overlays = {
            menu: document.getElementById('overlay-menu'),
            settings: document.getElementById('overlay-settings'),
            stats: document.getElementById('overlay-stats'),
            pause: document.getElementById('overlay-pause'),
            countdown: document.getElementById('overlay-countdown'),
            gameOver: document.getElementById('overlay-gameover')
        };

        this.hud = {
            score: document.getElementById('hud-score'),
            level: document.getElementById('hud-level'),
            lines: document.getElementById('hud-lines'),
            time: document.getElementById('hud-time'),
            pps: document.getElementById('hud-pps'),
            badgeB2b: document.getElementById('badge-b2b'),
            badgeCombo: document.getElementById('badge-combo'),
            holdCanvas: document.getElementById('hold-canvas'),
            nextContainer: document.getElementById('next-queue'),
            menuHighScore: document.getElementById('menu-highscore'),
            modePill: document.getElementById('hud-mode-pill'),
            modeObjective: document.getElementById('mode-objective'),
            controlsLegendList: document.getElementById('controls-legend-list'),
            sessionPb: document.getElementById('session-pb'),
            sessionPace: document.getElementById('session-pace'),
            sessionProgressFill: document.getElementById('session-progress-fill'),
            modalBackdrop: document.getElementById('modal-backdrop'),
            countdownText: document.getElementById('countdown-text'),
            replayBar: document.getElementById('replay-bar'),
            replaySpeedBtn: document.getElementById('btn-replay-speed'),
            replayToggleBtn: document.getElementById('btn-replay-toggle'),
            muteBtn: document.getElementById('btn-hud-mute'),
            playLayout: document.querySelector('.play-layout'),
            playerGarbageMeter: document.getElementById('player-garbage-meter'),
            playerGarbageFill: document.getElementById('player-garbage-fill'),
            oppStage: document.getElementById('opp-stage'),
            oppLabel: document.getElementById('opp-label'),
            oppStats: document.getElementById('opp-stats'),
            oppGarbageMeter: document.getElementById('opp-garbage-meter'),
            oppGarbageFill: document.getElementById('opp-garbage-fill')
        };

        this.settingsEls = {
            das: document.getElementById('setting-das'),
            dasVal: document.getElementById('setting-das-val'),
            arr: document.getElementById('setting-arr'),
            arrVal: document.getElementById('setting-arr-val'),
            sdf: document.getElementById('setting-sdf'),
            sdfVal: document.getElementById('setting-sdf-val'),
            are: document.getElementById('setting-are'),
            areVal: document.getElementById('setting-are-val'),
            lcd: document.getElementById('setting-lcd'),
            lcdVal: document.getElementById('setting-lcd-val'),
            volume: document.getElementById('setting-volume'),
            volumeVal: document.getElementById('setting-volume-val'),
            musicVol: document.getElementById('setting-music-vol'),
            musicVolVal: document.getElementById('setting-music-vol-val'),
            musicEnabled: document.getElementById('setting-music'),
            muted: document.getElementById('setting-muted'),
            colorblind: document.getElementById('setting-colorblind'),
            theme: document.getElementById('setting-theme'),
            nextCount: document.getElementById('setting-next-count'),
            keybindList: document.getElementById('keybind-list'),
            importInput: document.getElementById('import-file-input')
        };
    }

    bindEvents() {
        document.querySelectorAll('#mode-selector .mode-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#mode-selector .mode-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedMode = btn.dataset.mode;
                this.hud.modePill.textContent = btn.textContent.toUpperCase();
                this.hud.modeObjective.textContent = MODE_OBJECTIVES[this.selectedMode] || '';
                document.getElementById('ai-tier-selector').classList.toggle('hidden', this.selectedMode !== 'vs_ai');
                this.updateSessionPanel(null, this.selectedMode);
                this.audio.init();
                this.audio.play('menuSelect');
            });
        });

        document.querySelectorAll('#ai-tier-selector .tier-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#ai-tier-selector .tier-btn').forEach((b) => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedAiTier = btn.dataset.tier;
                this.audio.init();
                this.audio.play('menuSelect');
            });
        });

        document.getElementById('btn-start').addEventListener('click', () => {
            this.audio.init();
            this.audio.play('menuSelect');
            this.callbacks.onStartGame({ mode: this.selectedMode, aiTier: this.selectedAiTier });
        });

        document.getElementById('btn-open-settings').addEventListener('click', () => {
            this.audio.init();
            this.audio.play('menuSelect');
            this.openSettings('menu');
        });

        document.getElementById('btn-open-stats').addEventListener('click', () => {
            this.audio.init();
            this.audio.play('menuSelect');
            this.openStats();
        });

        document.getElementById('btn-settings-back').addEventListener('click', () => {
            this.input.cancelListening();
            this.audio.play('menuSelect');
            this.showOverlay(this.returnOverlay);
        });

        document.getElementById('btn-stats-back').addEventListener('click', () => {
            this.audio.play('menuSelect');
            this.showOverlay(this.returnOverlay || 'menu');
        });

        this.hud.modalBackdrop.addEventListener('click', (e) => {
            if (e.target === this.hud.modalBackdrop) {
                this.input.cancelListening();
                this.showOverlay(this.returnOverlay || 'menu');
            }
        });

        // Pause menu
        document.getElementById('btn-resume').addEventListener('click', () => this.callbacks.onResume());
        document.getElementById('btn-pause-restart').addEventListener('click', () => this.callbacks.onRestart());
        document.getElementById('btn-pause-settings').addEventListener('click', () => this.openSettings('pause'));
        document.getElementById('btn-pause-quit').addEventListener('click', () => this.callbacks.onQuitToMenu());
        document.getElementById('btn-hud-pause').addEventListener('click', () => {
            this.audio.init();
            this.callbacks.onResume ? null : null;
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
        });

        this.hud.muteBtn.addEventListener('click', () => {
            this.audio.init();
            const settings = this.storage.loadSettings();
            settings.muted = !settings.muted;
            this.storage.saveSettings(settings);
            this.callbacks.onSettingsChanged(settings);
            this.updateMuteButton(settings.muted);
        });

        // Game Over
        document.getElementById('btn-gameover-restart').addEventListener('click', () => this.callbacks.onRestart());
        document.getElementById('btn-gameover-menu').addEventListener('click', () => this.callbacks.onQuitToMenu());

        // Settings controls
        const syncSettings = () => {
            const settings = this.storage.loadSettings();
            settings.das = Number(this.settingsEls.das.value);
            settings.arr = Number(this.settingsEls.arr.value);
            const sdfSlider = Number(this.settingsEls.sdf.value);
            settings.sdf = sdfSlider >= 21 ? 999 : sdfSlider;
            settings.areFrames = Number(this.settingsEls.are.value);
            settings.lineClearFrames = Number(this.settingsEls.lcd.value);
            settings.volume = Number(this.settingsEls.volume.value);
            settings.musicVolume = Number(this.settingsEls.musicVol.value);
            settings.musicEnabled = this.settingsEls.musicEnabled.checked;
            settings.muted = this.settingsEls.muted.checked;
            settings.colorblind = this.settingsEls.colorblind.checked;
            settings.theme = this.settingsEls.theme.value;
            settings.nextCount = Number(this.settingsEls.nextCount.value);

            this.settingsEls.dasVal.textContent = `${settings.das} ms`;
            this.settingsEls.arrVal.textContent = `${settings.arr} ms`;
            this.settingsEls.sdfVal.textContent = settings.sdf >= 999 ? 'INF' : `${settings.sdf}x`;
            this.settingsEls.areVal.textContent = `${settings.areFrames} f`;
            this.settingsEls.lcdVal.textContent = `${settings.lineClearFrames} f`;
            this.settingsEls.volumeVal.textContent = `${settings.volume}%`;
            this.settingsEls.musicVolVal.textContent = `${settings.musicVolume}%`;

            this.storage.saveSettings(settings);
            this.callbacks.onSettingsChanged(settings);
            this.updateMuteButton(settings.muted);
        };

        this.settingsEls.das.addEventListener('input', syncSettings);
        this.settingsEls.arr.addEventListener('input', syncSettings);
        this.settingsEls.sdf.addEventListener('input', syncSettings);
        this.settingsEls.are.addEventListener('input', syncSettings);
        this.settingsEls.lcd.addEventListener('input', syncSettings);
        this.settingsEls.volume.addEventListener('input', syncSettings);
        this.settingsEls.musicVol.addEventListener('input', syncSettings);
        this.settingsEls.musicEnabled.addEventListener('change', syncSettings);
        this.settingsEls.muted.addEventListener('change', syncSettings);
        this.settingsEls.colorblind.addEventListener('change', syncSettings);
        this.settingsEls.theme.addEventListener('change', syncSettings);
        this.settingsEls.nextCount.addEventListener('change', syncSettings);

        document.getElementById('btn-reset-keys').addEventListener('click', () => {
            const settings = this.storage.loadSettings();
            settings.keybindings = structuredClone(DEFAULT_KEYBINDINGS);
            this.storage.saveSettings(settings);
            this.callbacks.onSettingsChanged(settings);
            this.renderKeybindings(settings);
        });

        document.getElementById('btn-export-data').addEventListener('click', () => {
            const blob = new Blob([this.storage.exportAll()], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `neon-tetris-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('btn-import-data').addEventListener('click', () => {
            this.settingsEls.importInput.click();
        });

        this.settingsEls.importInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    this.storage.importAll(reader.result);
                    const updated = this.storage.loadSettings();
                    this.populateSettings(updated);
                    this.callbacks.onSettingsChanged(updated);
                    this.updateMenuHighScore();
                    alert('Data imported successfully.');
                } catch {
                    alert('Invalid backup JSON file.');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        document.getElementById('btn-clear-data').addEventListener('click', () => {
            if (confirm('Clear all high scores, stats, replays, and settings?')) {
                this.storage.clearAll();
                const fresh = this.storage.loadSettings();
                this.populateSettings(fresh);
                this.callbacks.onSettingsChanged(fresh);
                this.updateMenuHighScore();
            }
        });
    }

    showOverlay(name) {
        const isModal = name === 'settings' || name === 'stats';
        this.hud.modalBackdrop.classList.toggle('hidden', !isModal);
        Object.entries(this.overlays).forEach(([key, el]) => {
            el.classList.toggle('hidden', key !== name);
        });
    }

    hideAllOverlays() {
        this.hud.modalBackdrop.classList.add('hidden');
        Object.values(this.overlays).forEach((el) => el.classList.add('hidden'));
    }

    renderControlsLegend(keybindings) {
        const list = this.hud.controlsLegendList;
        if (!list) return;
        list.innerHTML = '';
        for (const [label, actions] of LEGEND_ACTIONS) {
            const row = document.createElement('div');
            row.className = 'legend-row';
            const titleSpan = document.createElement('span');
            titleSpan.textContent = label;
            const keysSpan = document.createElement('span');
            keysSpan.style.display = 'flex';
            keysSpan.style.gap = '3px';
            for (const act of actions) {
                const code = (keybindings[act] && keybindings[act][0]) || '';
                const kbd = document.createElement('kbd');
                kbd.className = 'keycap';
                kbd.textContent = formatKeyCode(code);
                keysSpan.appendChild(kbd);
            }
            row.appendChild(titleSpan);
            row.appendChild(keysSpan);
            list.appendChild(row);
        }
    }

    ensureNextSlots(count) {
        const container = this.hud.nextContainer;
        while (container.children.length < count) {
            const c = document.createElement('canvas');
            c.width = 110;
            c.height = 64;
            c.className = 'preview-canvas';
            container.appendChild(c);
        }
        while (container.children.length > count) {
            container.removeChild(container.lastChild);
        }
    }

    updateSessionPanel(engine, mode = this.selectedMode) {
        const records = this.storage.loadModeRecords();
        const scores = this.storage.loadHighScores();
        const marathonPb = scores.length > 0 ? scores[0].score : 0;

        let pbText = '--';
        let paceText = '--';
        let progressPct = 0;

        if (mode === 'sprint') {
            pbText = records.sprintBestMs !== null ? formatTimeMs(records.sprintBestMs) : '--';
            if (engine && engine.lines > 0) {
                progressPct = Math.min(100, (engine.lines / SPRINT_TARGET_LINES) * 100);
                if (records.sprintBestMs !== null && engine.elapsedFrames > 0) {
                    const currentMs = engine.elapsedFrames * FRAME_DURATION;
                    const projectedMs = (currentMs / engine.lines) * SPRINT_TARGET_LINES;
                    const deltaSec = (projectedMs - records.sprintBestMs) / 1000;
                    paceText = `${deltaSec >= 0 ? '+' : ''}${deltaSec.toFixed(1)}s`;
                } else {
                    paceText = `${engine.lines}/${SPRINT_TARGET_LINES}L`;
                }
            }
        } else if (mode === 'ultra') {
            pbText = records.ultraBestScore > 0 ? records.ultraBestScore.toLocaleString() : '--';
            if (engine) {
                progressPct = Math.min(100, (engine.elapsedFrames / ULTRA_DURATION_FRAMES) * 100);
                paceText = records.ultraBestScore > 0
                    ? `${Math.round((engine.score / records.ultraBestScore) * 100)}% PB`
                    : `${engine.score.toLocaleString()}`;
            }
        } else if (mode === 'cheese') {
            pbText = records.cheeseBestMs !== null ? formatTimeMs(records.cheeseBestMs) : '--';
            if (engine) {
                progressPct = Math.min(100, (engine.cheeseCleared / CHEESE_TARGET_LINES) * 100);
                paceText = `${engine.cheeseCleared}/${CHEESE_TARGET_LINES}L`;
            }
        } else if (mode === 'vs_ai') {
            pbText = `${records.vsAiWins} Wins`;
            paceText = engine ? `${engine.attackSent} ATK` : '--';
        } else {
            pbText = marathonPb > 0 ? marathonPb.toLocaleString() : '--';
            if (engine && marathonPb > 0) {
                progressPct = Math.min(100, (engine.score / marathonPb) * 100);
                paceText = `${Math.round(progressPct)}% PB`;
            }
        }

        this.hud.sessionPb.textContent = pbText;
        this.hud.sessionPace.textContent = paceText;
        this.hud.sessionProgressFill.style.width = `${progressPct}%`;
    }

    updateMenuHighScore() {
        const scores = this.storage.loadHighScores();
        const best = scores.length > 0 ? scores[0].score : 0;
        this.hud.menuHighScore.textContent = best.toLocaleString();
    }

    updateMuteButton(muted) {
        this.hud.muteBtn.textContent = muted ? '🔇' : '🔊';
        this.hud.muteBtn.title = muted ? 'Unmute (M)' : 'Mute (M)';
    }

    openSettings(returnTo) {
        this.returnOverlay = returnTo;
        const settings = this.storage.loadSettings();
        this.populateSettings(settings);
        this.showOverlay('settings');
    }

    populateSettings(settings) {
        this.settingsEls.das.value = settings.das;
        this.settingsEls.dasVal.textContent = `${settings.das} ms`;
        this.settingsEls.arr.value = settings.arr;
        this.settingsEls.arrVal.textContent = `${settings.arr} ms`;
        const sdfVal = settings.sdf >= 999 ? 21 : settings.sdf;
        this.settingsEls.sdf.value = sdfVal;
        this.settingsEls.sdfVal.textContent = settings.sdf >= 999 ? 'INF' : `${settings.sdf}x`;
        this.settingsEls.are.value = settings.areFrames;
        this.settingsEls.areVal.textContent = `${settings.areFrames} f`;
        this.settingsEls.lcd.value = settings.lineClearFrames;
        this.settingsEls.lcdVal.textContent = `${settings.lineClearFrames} f`;
        this.settingsEls.volume.value = settings.volume;
        this.settingsEls.volumeVal.textContent = `${settings.volume}%`;
        this.settingsEls.musicVol.value = settings.musicVolume;
        this.settingsEls.musicVolVal.textContent = `${settings.musicVolume}%`;
        this.settingsEls.musicEnabled.checked = settings.musicEnabled;
        this.settingsEls.muted.checked = settings.muted;
        this.settingsEls.colorblind.checked = settings.colorblind;
        this.settingsEls.theme.value = settings.theme || 'cyberpunk';
        this.settingsEls.nextCount.value = String(settings.nextCount);
        this.renderKeybindings(settings);
    }

    renderKeybindings(settings) {
        const container = this.settingsEls.keybindList;
        container.innerHTML = '';

        for (const [action, codes] of Object.entries(settings.keybindings)) {
            const row = document.createElement('div');
            row.className = 'keybind-row';

            const label = document.createElement('span');
            label.textContent = ACTION_LABELS[action] || action;

            const btn = document.createElement('button');
            btn.className = 'btn-key';
            btn.textContent = codes.join(' / ');
            btn.addEventListener('click', () => {
                btn.textContent = 'Press a key...';
                btn.classList.add('listening');
                this.input.startListeningForKey((newCode) => {
                    btn.classList.remove('listening');
                    if (newCode === 'Escape' && action !== 'pause') {
                        this.renderKeybindings(settings);
                        return;
                    }
                    const conflictAction = Object.keys(settings.keybindings).find(
                        (act) => act !== action && settings.keybindings[act].includes(newCode)
                    );
                    if (conflictAction) {
                        const swap = confirm(
                            `${newCode} is already bound to "${ACTION_LABELS[conflictAction]}". Swap bindings?`
                        );
                        if (!swap) {
                            this.renderKeybindings(settings);
                            return;
                        }
                        settings.keybindings[conflictAction] = [...codes];
                    }
                    settings.keybindings[action] = [newCode];
                    this.storage.saveSettings(settings);
                    this.callbacks.onSettingsChanged(settings);
                    this.renderKeybindings(settings);
                });
            });

            row.appendChild(label);
            row.appendChild(btn);
            container.appendChild(row);
        }
    }

    openStats() {
        const stats = this.storage.loadStats();
        const records = this.storage.loadModeRecords();
        const scores = this.storage.loadHighScores();
        const replays = this.storage.loadReplayMeta();

        document.getElementById('stat-games').textContent = stats.gamesPlayed;
        document.getElementById('stat-lines').textContent = stats.totalLines;
        document.getElementById('stat-tspins').textContent = stats.totalTSpins;
        document.getElementById('stat-best').textContent = stats.bestScore.toLocaleString();
        const mins = Math.floor(stats.playTimeSec / 60);
        const secs = stats.playTimeSec % 60;
        document.getElementById('stat-time').textContent = `${mins}m ${secs}s`;
        document.getElementById('stat-sprint').textContent = records.sprintBestMs !== null ? formatTimeMs(records.sprintBestMs) : '--';
        document.getElementById('stat-ultra').textContent = records.ultraBestScore.toLocaleString();
        document.getElementById('stat-cheese').textContent = records.cheeseBestMs !== null ? formatTimeMs(records.cheeseBestMs) : '--';
        document.getElementById('stat-ai-wins').textContent = records.vsAiWins;

        const hsBody = document.getElementById('highscore-list');
        hsBody.innerHTML = scores.length === 0
            ? '<div class="empty-msg">No high scores yet</div>'
            : scores.map((s, idx) =>
                `<div class="hs-row"><span>#${idx + 1}</span><span>${s.score.toLocaleString()}</span><span>Lv ${s.level}</span><span>${s.lines}L</span></div>`
            ).join('');

        const replayList = document.getElementById('replay-list');
        replayList.innerHTML = '';
        if (replays.length === 0) {
            replayList.innerHTML = '<div class="empty-msg">No saved replays</div>';
        } else {
            replays.slice().reverse().forEach((meta) => {
                const item = document.createElement('div');
                item.className = 'replay-row';
                const modeTag = (meta.mode || 'marathon').toUpperCase();
                item.innerHTML = `<span>${modeTag} • ${meta.score.toLocaleString()} (${meta.lines}L)</span>`;
                const btnGroup = document.createElement('div');
                btnGroup.style.display = 'flex';
                btnGroup.style.gap = '4px';

                const watchBtn = document.createElement('button');
                watchBtn.className = 'btn-small';
                watchBtn.textContent = 'Watch';
                watchBtn.addEventListener('click', () => this.callbacks.onWatchReplay(meta.slot));

                const ghostBtn = document.createElement('button');
                ghostBtn.className = 'btn-small';
                ghostBtn.textContent = 'Ghost';
                ghostBtn.addEventListener('click', () => this.callbacks.onRaceGhost(meta.slot));

                btnGroup.appendChild(watchBtn);
                btnGroup.appendChild(ghostBtn);
                item.appendChild(btnGroup);
                replayList.appendChild(item);
            });
        }

        this.showOverlay('stats');
    }

    setDualMode(enabled, oppTitle = 'AI: RIVAL', showGarbage = false) {
        this.hud.playLayout.classList.toggle('dual-mode', enabled);
        this.hud.oppStage.classList.toggle('hidden', !enabled);
        this.hud.playerGarbageMeter.classList.toggle('hidden', !showGarbage);
        this.hud.oppGarbageMeter.classList.toggle('hidden', !showGarbage);
        this.hud.oppLabel.textContent = oppTitle;
        this.updateGarbageMeter(this.hud.playerGarbageFill, 0);
        this.updateGarbageMeter(this.hud.oppGarbageFill, 0);
    }

    updateGarbageMeter(fillEl, lines) {
        const pct = Math.min(100, (lines / 20) * 100);
        fillEl.style.height = `${pct}%`;
    }

    updateHUD(engine, renderer) {
        this.hud.score.textContent = engine.score.toLocaleString();
        this.hud.level.textContent = engine.level;
        if (engine.mode === 'sprint') {
            this.hud.lines.textContent = `${engine.lines}/${SPRINT_TARGET_LINES}`;
        } else if (engine.mode === 'cheese') {
            this.hud.lines.textContent = `${engine.cheeseCleared}/${CHEESE_TARGET_LINES}`;
        } else {
            this.hud.lines.textContent = engine.lines;
        }

        const timeMs = engine.mode === 'ultra'
            ? Math.max(0, (ULTRA_DURATION_FRAMES - engine.elapsedFrames) * FRAME_DURATION)
            : engine.elapsedFrames * FRAME_DURATION;
        this.hud.time.textContent = formatTimeMs(timeMs);

        const secs = Math.max(0.01, (engine.elapsedFrames * FRAME_DURATION) / 1000);
        this.hud.pps.textContent = (engine.piecesLocked / secs).toFixed(2);

        this.hud.badgeB2b.classList.toggle('hidden', !engine.b2bActive);
        this.hud.badgeCombo.classList.toggle('hidden', engine.comboCount < 1);
        if (engine.comboCount >= 1) {
            this.hud.badgeCombo.textContent = `${engine.comboCount}x`;
        }

        renderer.renderPreview(this.hud.holdCanvas, engine.holdType);

        const queue = engine.getNextQueue();
        this.ensureNextSlots(queue.length);
        const container = this.hud.nextContainer;
        for (let i = 0; i < queue.length; i++) {
            renderer.renderPreview(container.children[i], queue[i]);
        }

        this.updateSessionPanel(engine, engine.mode);
    }

    showGameOver({ score, level, lines, victory, isNewHigh, onSaveReplay }) {
        const heading = this.overlays.gameOver.querySelector('.overlay-heading');
        heading.textContent = victory ? 'VICTORY!' : 'GAME OVER';
        heading.classList.toggle('danger', !victory);

        document.getElementById('go-score').textContent = score.toLocaleString();
        document.getElementById('go-level').textContent = level;
        document.getElementById('go-lines').textContent = lines;
        document.getElementById('go-newhigh').classList.toggle('hidden', !isNewHigh);

        const saveBtn = document.getElementById('btn-save-replay');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Replay';
        saveBtn.onclick = () => {
            const ok = onSaveReplay();
            saveBtn.textContent = ok ? 'Replay Saved!' : 'Storage Full';
            saveBtn.disabled = true;
        };

        this.showOverlay('gameOver');
    }

    updateCountdown(value) {
        this.hud.countdownText.textContent = value > 0 ? String(value) : 'GO!';
    }
}
