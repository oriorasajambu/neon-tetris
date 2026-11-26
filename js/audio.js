/**
 * Zero-asset Web Audio API synthesizer for Tetris SFX + procedural generative Synthwave music.
 * Lazily initializes AudioContext on first user interaction.
 */
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.compressor = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;

        this.volume = 0.7;
        this.musicVolume = 0.45;
        this.muted = false;
        this.musicEnabled = true;

        this.activeVoices = 0;
        this.maxVoices = 12;
        this.lastMoveTime = 0;

        // Procedural Synthwave sequencer state
        this.seqTimer = null;
        this.seqRunning = false;
        this.seqStep = 0;
        this.nextNoteTime = 0;
        this.musicState = { level: 1, b2b: false, danger: false };
    }

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            return;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;

        this.ctx = new AudioCtx();
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -14;
        this.compressor.knee.value = 18;
        this.compressor.ratio.value = 6;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.15;

        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : this.volume;

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 1.0;

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicEnabled ? this.musicVolume : 0;

        this.sfxGain.connect(this.compressor);
        this.musicGain.connect(this.compressor);
        this.compressor.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
    }

    setVolume(percent) {
        this.volume = Math.max(0, Math.min(1, percent / 100));
        if (this.masterGain && !this.muted) {
            this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
        }
    }

    setMusicVolume(percent) {
        this.musicVolume = Math.max(0, Math.min(1, percent / 100));
        if (this.musicGain && this.musicEnabled) {
            this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.02);
        }
    }

    setMusicEnabled(enabled) {
        this.musicEnabled = enabled;
        if (this.musicGain) {
            this.musicGain.gain.setTargetAtTime(
                this.musicEnabled ? this.musicVolume : 0,
                this.ctx.currentTime,
                0.02
            );
        }
        if (!enabled) {
            this.stopMusic();
        }
    }

    setMuted(muted) {
        this.muted = muted;
        if (this.masterGain) {
            this.masterGain.gain.setTargetAtTime(
                this.muted ? 0 : this.volume,
                this.ctx.currentTime,
                0.01
            );
        }
    }

    updateMusicState({ level = 1, b2b = false, danger = false }) {
        this.musicState.level = level;
        this.musicState.b2b = b2b;
        this.musicState.danger = danger;
    }

    startMusic() {
        this.init();
        if (!this.ctx || !this.musicEnabled || this.seqRunning) return;
        this.seqRunning = true;
        this.seqStep = 0;
        this.nextNoteTime = this.ctx.currentTime + 0.05;
        this.seqTimer = setInterval(() => this.scheduleMusicLookahead(), 25);
    }

    stopMusic() {
        this.seqRunning = false;
        if (this.seqTimer !== null) {
            clearInterval(this.seqTimer);
            this.seqTimer = null;
        }
    }

    scheduleMusicLookahead() {
        if (!this.seqRunning || !this.ctx || this.ctx.state !== 'running' || !this.musicEnabled) {
            return;
        }
        const { level, danger } = this.musicState;
        const bpm = Math.min(156, 126 + (level - 1) * 1.8 + (danger ? 10 : 0));
        const stepDuration = 60 / bpm / 4; // 16th note

        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.scheduleStep(this.seqStep, this.nextNoteTime, stepDuration);
            this.nextNoteTime += stepDuration;
            this.seqStep = (this.seqStep + 1) % 64;
        }
    }

    scheduleStep(step, time, stepDur) {
        const { level, b2b, danger } = this.musicState;
        const bar = Math.floor(step / 16);
        const stepInBar = step % 16;

        // A minor / Phrygian cyberpunk bass progression: A1, F1, G1, E1
        const bassRoots = [55.0, 43.65, 49.0, 41.2];
        const root = bassRoots[bar] * (danger ? 1.05946 : 1.0); // +1 semitone in danger

        // Layer 1: Driving 8th/16th synthwave bass
        if (stepInBar % 2 === 0) {
            const octave = stepInBar % 4 === 2 ? root * 2 : root;
            this.playMusicBass(octave, time, stepDur * 1.6, danger ? 1400 : 750);
        }

        // Layer 2: Kick & Snare/Hat (Level >= 2 or B2B or Danger)
        if (level >= 2 || b2b || danger) {
            if (stepInBar % 4 === 0) {
                this.playMusicKick(time);
            }
            if (stepInBar === 4 || stepInBar === 12) {
                this.playMusicSnare(time);
            } else if (stepInBar % 2 === 1) {
                this.playMusicHat(time);
            }
        }

        // Layer 3: Neon Arpeggiator (Level >= 5 or B2B or Danger)
        if (level >= 5 || b2b || danger) {
            const arpRatios = [4, 4.7568, 6, 8, 6, 4.7568, 4, 3];
            const freq = root * arpRatios[stepInBar % arpRatios.length];
            this.playMusicArp(freq, time, stepDur * 0.9);
        }
    }

    playMusicBass(freq, time, dur, cutoff) {
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(cutoff, time);
        filter.frequency.exponentialRampToValueAtTime(160, time + dur);

        gain.gain.setValueAtTime(0.22, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + dur);
    }

    playMusicKick(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(135, time);
        osc.frequency.exponentialRampToValueAtTime(38, time + 0.11);
        gain.gain.setValueAtTime(0.38, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.13);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.13);
    }

    playMusicSnare(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(210, time);
        osc.frequency.exponentialRampToValueAtTime(90, time + 0.09);
        gain.gain.setValueAtTime(0.18, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.11);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.11);
    }

    playMusicHat(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(6400, time);
        gain.gain.setValueAtTime(0.03, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.03);
    }

    playMusicArp(freq, time, dur) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0.09, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + dur);
    }

    canSpawnVoice() {
        return this.activeVoices < this.maxVoices;
    }

    trackVoice(osc, stopTime) {
        this.activeVoices++;
        osc.onended = () => {
            this.activeVoices = Math.max(0, this.activeVoices - 1);
        };
        osc.stop(stopTime);
    }

    play(event) {
        if (this.muted || !this.ctx || this.ctx.state !== 'running') return;

        if (event === 'move') {
            const nowMs = performance.now();
            if (nowMs - this.lastMoveTime < 25) return;
            this.lastMoveTime = nowMs;
        }

        if (!this.canSpawnVoice() && event !== 'gameOver' && event !== 'allClear') {
            return;
        }

        switch (event) {
            case 'move': this.playTone(200, 'square', 0.045, 0.12); break;
            case 'rotate': this.playSweep(300, 600, 'sine', 0.075, 0.18); break;
            case 'softDrop': this.playTone(150, 'triangle', 0.028, 0.08); break;
            case 'hardDrop': this.playHardDrop(); break;
            case 'lock': this.playTone(85, 'sine', 0.09, 0.22); break;
            case 'hold': this.playBiTone(220, 440, 0.06, 0.15); break;
            case 'clear1': this.playArpeggio([523.25, 659.25, 783.99], 0.06, 0.18); break;
            case 'clear2': this.playArpeggio([523.25, 659.25, 783.99, 1046.5], 0.055, 0.2); break;
            case 'clear3': this.playChord([523.25, 659.25, 783.99], 0.24, 0.2); break;
            case 'tetris': this.playTetris(); break;
            case 'tSpin': this.playTSpin(); break;
            case 'allClear': this.playAllClear(); break;
            case 'gameOver': this.playGameOver(); break;
            case 'countdownTick': this.playTone(440, 'sine', 0.09, 0.2); break;
            case 'countdownGo': this.playTone(880, 'sine', 0.14, 0.25); break;
            case 'menuSelect': this.playTone(480, 'sine', 0.045, 0.15); break;
            default: break;
        }
    }

    playTone(freq, type, duration, peakGain) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(peakGain, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        this.trackVoice(osc, now + duration);
    }

    playSweep(startFreq, endFreq, type, duration, peakGain) {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
        gain.gain.setValueAtTime(peakGain, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now);
        this.trackVoice(osc, now + duration);
    }

    playBiTone(f1, f2, stepDur, peakGain) {
        this.playTone(f1, 'sine', stepDur, peakGain);
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f2, now + stepDur * 0.7);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.setValueAtTime(peakGain, now + stepDur * 0.7);
        gain.gain.exponentialRampToValueAtTime(0.001, now + stepDur * 2);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(now + stepDur * 0.7);
        this.trackVoice(osc, now + stepDur * 2);
    }

    playHardDrop() {
        this.playSweep(120, 48, 'sine', 0.14, 0.35);
        this.playNoise(0.08, 0.16);
    }

    playNoise(duration, peakGain) {
        const sampleCount = Math.floor(this.ctx.sampleRate * duration);
        const buffer = this.ctx.createBuffer(1, sampleCount, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < sampleCount; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const now = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(peakGain, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        src.connect(gain);
        gain.connect(this.sfxGain);
        src.start(now);
    }

    playArpeggio(freqs, stepDur, peakGain) {
        const now = this.ctx.currentTime;
        freqs.forEach((f, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            const t = now + idx * stepDur;
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(peakGain, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            this.trackVoice(osc, t + stepDur * 1.8);
        });
    }

    playChord(freqs, duration, peakGain) {
        const now = this.ctx.currentTime;
        freqs.forEach((f) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(f, now);
            gain.gain.setValueAtTime(peakGain / freqs.length, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(now);
            this.trackVoice(osc, now + duration);
        });
    }

    playTetris() {
        this.playChord([523.25, 659.25, 783.99, 1046.5], 0.38, 0.35);
        this.playNoise(0.18, 0.14);
    }

    playTSpin() {
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(680, now + 0.25);

        lfo.frequency.setValueAtTime(28, now);
        lfoGain.gain.setValueAtTime(35, now);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        lfo.start(now);
        osc.start(now);
        lfo.stop(now + 0.28);
        this.trackVoice(osc, now + 0.28);
    }

    playAllClear() {
        this.playArpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], 0.08, 0.3);
    }

    playGameOver() {
        this.playArpeggio([440, 415.3, 392, 369.99, 349.23, 329.63, 293.66], 0.12, 0.22);
        this.playNoise(0.5, 0.08);
    }
}
