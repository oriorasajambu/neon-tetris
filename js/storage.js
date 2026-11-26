import { DEFAULT_SETTINGS } from './constants.js';

const KEYS = {
    HIGHSCORES: 'tetris_highscores',
    MODE_RECORDS: 'tetris_mode_records',
    SETTINGS: 'tetris_settings',
    STATS: 'tetris_stats',
    REPLAY_META: 'tetris_replay_meta',
    REPLAY_PREFIX: 'tetris_replay_'
};

const MAX_REPLAYS = 20;
const TOTAL_BUDGET_BYTES = 4.5 * 1024 * 1024;

function safeGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

function safeSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

export class StorageManager {
    loadSettings() {
        const saved = safeGet(KEYS.SETTINGS, null);
        if (!saved) return structuredClone(DEFAULT_SETTINGS);
        return {
            ...structuredClone(DEFAULT_SETTINGS),
            ...saved,
            keybindings: {
                ...structuredClone(DEFAULT_SETTINGS.keybindings),
                ...(saved.keybindings || {})
            }
        };
    }

    saveSettings(settings) {
        return safeSet(KEYS.SETTINGS, settings);
    }

    loadHighScores() {
        return safeGet(KEYS.HIGHSCORES, []);
    }

    addHighScore(entry) {
        const scores = this.loadHighScores();
        scores.push({
            score: entry.score,
            level: entry.level,
            lines: entry.lines,
            date: new Date().toISOString()
        });
        scores.sort((a, b) => b.score - a.score);
        const top10 = scores.slice(0, 10);
        safeSet(KEYS.HIGHSCORES, top10);
        const isNewHigh = top10.length > 0 && top10[0].score === entry.score && entry.score > 0;
        return { top10, isNewHigh };
    }

    loadStats() {
        return safeGet(KEYS.STATS, {
            gamesPlayed: 0,
            totalLines: 0,
            totalTSpins: 0,
            playTimeSec: 0,
            bestScore: 0
        });
    }

    recordGameStats({ score, lines, tSpins, durationSec }) {
        const stats = this.loadStats();
        stats.gamesPlayed += 1;
        stats.totalLines += lines;
        stats.totalTSpins += tSpins;
        stats.playTimeSec += Math.round(durationSec);
        if (score > stats.bestScore) {
            stats.bestScore = score;
        }
        safeSet(KEYS.STATS, stats);
        return stats;
    }

    loadModeRecords() {
        return safeGet(KEYS.MODE_RECORDS, {
            sprintBestMs: null,
            ultraBestScore: 0,
            cheeseBestMs: null,
            vsAiWins: 0
        });
    }

    recordModeResult(summary) {
        const records = this.loadModeRecords();
        let isNewBest = false;
        if (summary.mode === 'sprint' && summary.victory) {
            if (records.sprintBestMs === null || summary.timeMs < records.sprintBestMs) {
                records.sprintBestMs = summary.timeMs;
                isNewBest = true;
            }
        } else if (summary.mode === 'ultra') {
            if (summary.score > records.ultraBestScore) {
                records.ultraBestScore = summary.score;
                isNewBest = true;
            }
        } else if (summary.mode === 'cheese' && summary.victory) {
            if (records.cheeseBestMs === null || summary.timeMs < records.cheeseBestMs) {
                records.cheeseBestMs = summary.timeMs;
                isNewBest = true;
            }
        } else if (summary.mode === 'vs_ai' && summary.victory) {
            records.vsAiWins += 1;
            isNewBest = true;
        }
        safeSet(KEYS.MODE_RECORDS, records);
        return { records, isNewBest };
    }

    loadReplayMeta() {
        return safeGet(KEYS.REPLAY_META, []);
    }

    getTotalStorageBytes() {
        let total = 0;
        try {
            for (const key of Object.keys(localStorage)) {
                if (key.startsWith('tetris_')) {
                    total += (localStorage.getItem(key) || '').length * 2;
                }
            }
        } catch {
            return 0;
        }
        return total;
    }

    saveReplay(replayData) {
        const meta = this.loadReplayMeta();
        const serialized = JSON.stringify(replayData);

        // Evict oldest replays if at cap or over budget
        while (
            meta.length >= MAX_REPLAYS ||
            (this.getTotalStorageBytes() + serialized.length * 2 > TOTAL_BUDGET_BYTES && meta.length > 0)
        ) {
            const oldest = meta.shift();
            try {
                localStorage.removeItem(KEYS.REPLAY_PREFIX + oldest.slot);
            } catch {
                // ignore
            }
        }

        // Find free slot 0..MAX_REPLAYS-1
        const usedSlots = new Set(meta.map((m) => m.slot));
        let slot = 0;
        while (usedSlots.has(slot) && slot < MAX_REPLAYS) {
            slot++;
        }

        if (!safeSet(KEYS.REPLAY_PREFIX + slot, replayData)) {
            return false;
        }

        meta.push({
            slot,
            mode: replayData.mode || 'marathon',
            score: replayData.finalScore || 0,
            lines: replayData.lines || 0,
            timeMs: replayData.timeMs || 0,
            date: replayData.date || new Date().toISOString()
        });
        safeSet(KEYS.REPLAY_META, meta);
        return true;
    }

    loadReplay(slot) {
        return safeGet(KEYS.REPLAY_PREFIX + slot, null);
    }

    exportAll() {
        return JSON.stringify({
            version: 1,
            exportedAt: new Date().toISOString(),
            settings: this.loadSettings(),
            highscores: this.loadHighScores(),
            stats: this.loadStats()
        }, null, 2);
    }

    importAll(jsonString) {
        const parsed = JSON.parse(jsonString);
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Invalid backup format');
        }
        if (parsed.settings && typeof parsed.settings === 'object') {
            this.saveSettings({
                ...structuredClone(DEFAULT_SETTINGS),
                ...parsed.settings
            });
        }
        if (Array.isArray(parsed.highscores)) {
            safeSet(KEYS.HIGHSCORES, parsed.highscores.slice(0, 10));
        }
        if (parsed.stats && typeof parsed.stats === 'object') {
            safeSet(KEYS.STATS, parsed.stats);
        }
    }

    clearAll() {
        try {
            for (const key of Object.keys(localStorage)) {
                if (key.startsWith('tetris_')) {
                    localStorage.removeItem(key);
                }
            }
        } catch {
            // ignore
        }
    }
}
