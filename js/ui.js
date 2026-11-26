import { DEFAULT_KEYBINDINGS } from './constants.js';

const ACTION_LABELS = {
    left: 'Move Left',
    right: 'Move Right',
    softDrop: 'Soft Drop',
    hardDrop: 'Hard Drop',
    rotateCW: 'Rotate CW',
    rotateCCW: 'Rotate CCW',
    hold: 'Hold Piece',
    pause: 'Pause',
    mute: 'Mute Audio'
};

export class UIManager {
    constructor({ storage, input, audio, onStartGame, onResume, onRestart, onQuitToMenu, onSettingsChanged, onWatchReplay }) {
        this.storage = storage;
        this.input = input;
        this.audio = audio;
        this.callbacks = { onStartGame, onResume, onRestart, onQuitToMenu, onSettingsChanged, onWatchReplay };
        this.returnOverlay = 'menu';

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
            holdCanvas: document.getElementById('hold-canvas'),
            nextContainer: document.getElementById('next-queue'),
            menuHighScore: document.getElementById('menu-highscore'),
            countdownText: document.getElementById('countdown-text'),
            replayBar: document.getElementById('replay-bar'),
            replaySpeedBtn: document.getElementById('btn-replay-speed'),
            replayToggleBtn: document.getElementById('btn-replay-toggle'),
            muteBtn: document.getElementById('btn-hud-mute')
        };

        this.settingsEls = {
            das: document.getElementById('setting-das'),
            dasVal: document.getElementById('setting-das-val'),
            arr: document.getElementById('setting-arr'),
            arrVal: document.getElementById('setting-arr-val'),
            volume: document.getElementById('setting-volume'),
            volumeVal: document.getElementById('setting-volume-val'),
            muted: document.getElementById('setting-muted'),
            colorblind: document.getElementById('setting-colorblind'),
            nextCount: document.getElementById('setting-next-count'),
            keybindList: document.getElementById('keybind-list'),
            importInput: document.getElementById('import-file-input')
        };
    }

    bindEvents() {
        document.getElementById('btn-start').addEventListener('click', () => {
            this.audio.init();
            this.audio.play('menuSelect');
            this.callbacks.onStartGame();
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
            this.showOverlay('menu');
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
            settings.volume = Number(this.settingsEls.volume.value);
            settings.muted = this.settingsEls.muted.checked;
            settings.colorblind = this.settingsEls.colorblind.checked;
            settings.nextCount = Number(this.settingsEls.nextCount.value);

            this.settingsEls.dasVal.textContent = `${settings.das} ms`;
            this.settingsEls.arrVal.textContent = `${settings.arr} ms`;
            this.settingsEls.volumeVal.textContent = `${settings.volume}%`;

            this.storage.saveSettings(settings);
            this.callbacks.onSettingsChanged(settings);
            this.updateMuteButton(settings.muted);
        };

        this.settingsEls.das.addEventListener('input', syncSettings);
        this.settingsEls.arr.addEventListener('input', syncSettings);
        this.settingsEls.volume.addEventListener('input', syncSettings);
        this.settingsEls.muted.addEventListener('change', syncSettings);
        this.settingsEls.colorblind.addEventListener('change', syncSettings);
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
        Object.entries(this.overlays).forEach(([key, el]) => {
            el.classList.toggle('hidden', key !== name);
        });
    }

    hideAllOverlays() {
        Object.values(this.overlays).forEach((el) => el.classList.add('hidden'));
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
        this.settingsEls.volume.value = settings.volume;
        this.settingsEls.volumeVal.textContent = `${settings.volume}%`;
        this.settingsEls.muted.checked = settings.muted;
        this.settingsEls.colorblind.checked = settings.colorblind;
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
        const scores = this.storage.loadHighScores();
        const replays = this.storage.loadReplayMeta();

        document.getElementById('stat-games').textContent = stats.gamesPlayed;
        document.getElementById('stat-lines').textContent = stats.totalLines;
        document.getElementById('stat-tspins').textContent = stats.totalTSpins;
        document.getElementById('stat-best').textContent = stats.bestScore.toLocaleString();
        const mins = Math.floor(stats.playTimeSec / 60);
        const secs = stats.playTimeSec % 60;
        document.getElementById('stat-time').textContent = `${mins}m ${secs}s`;

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
                item.innerHTML = `<span>${meta.score.toLocaleString()} pts (${meta.lines}L)</span>`;
                const watchBtn = document.createElement('button');
                watchBtn.className = 'btn-small';
                watchBtn.textContent = 'Watch';
                watchBtn.addEventListener('click', () => {
                    this.callbacks.onWatchReplay(meta.slot);
                });
                item.appendChild(watchBtn);
                replayList.appendChild(item);
            });
        }

        this.showOverlay('stats');
    }

    updateHUD(engine, renderer) {
        this.hud.score.textContent = engine.score.toLocaleString();
        this.hud.level.textContent = engine.level;
        this.hud.lines.textContent = engine.lines;

        renderer.renderPreview(this.hud.holdCanvas, engine.holdType);

        const queue = engine.getNextQueue();
        const container = this.hud.nextContainer;
        while (container.children.length < queue.length) {
            const c = document.createElement('canvas');
            c.width = 96;
            c.height = 60;
            c.className = 'preview-canvas';
            container.appendChild(c);
        }
        while (container.children.length > queue.length) {
            container.removeChild(container.lastChild);
        }
        for (let i = 0; i < queue.length; i++) {
            renderer.renderPreview(container.children[i], queue[i]);
        }
    }

    showGameOver({ score, level, lines, isNewHigh, onSaveReplay }) {
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
