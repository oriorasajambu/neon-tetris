/**
 * Zero-asset Web Audio API synthesizer for Tetris sound effects (no music).
 * Lazily initializes AudioContext on first user interaction.
 */
export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.volume = 0.7;
        this.muted = false;
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
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.muted ? 0 : this.volume;
        this.masterGain.connect(this.ctx.destination);
    }

    setVolume(percent) {
        this.volume = Math.max(0, Math.min(1, percent / 100));
        if (this.masterGain && !this.muted) {
            this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
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

    play(event) {
        if (this.muted || !this.ctx || this.ctx.state !== 'running') return;

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
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + duration);
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
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + duration);
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
        gain.connect(this.masterGain);
        osc.start(now + stepDur * 0.7);
        osc.stop(now + stepDur * 2);
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
        gain.connect(this.masterGain);
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
            gain.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + stepDur * 1.8);
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
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + duration);
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
        gain.connect(this.masterGain);
        lfo.start(now);
        osc.start(now);
        lfo.stop(now + 0.28);
        osc.stop(now + 0.28);
    }

    playAllClear() {
        this.playArpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98], 0.08, 0.3);
    }

    playGameOver() {
        this.playArpeggio([440, 415.3, 392, 369.99, 349.23, 329.63, 293.66], 0.12, 0.22);
        this.playNoise(0.5, 0.08);
    }
}
