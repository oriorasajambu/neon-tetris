/**
 * Deterministic xorshift128 PRNG for reproducible 7-bag generation and replays.
 */
export class PRNG {
    /**
     * @param {number} seed Integer seed
     */
    constructor(seed) {
        const s = (seed >>> 0) || 1;
        this.state = [
            s,
            (s ^ 0x12345678) >>> 0,
            (s ^ 0x9ABCDEF0) >>> 0,
            (s ^ 0xDEADBEEF) >>> 0
        ];
        // Warm up the state to avoid initial correlation
        for (let i = 0; i < 8; i++) {
            this.next();
        }
    }

    /**
     * @returns {number} Pseudo-random float in [0, 1)
     */
    next() {
        let t = this.state[3];
        t ^= t << 11;
        t ^= t >>> 8;
        this.state[3] = this.state[2];
        this.state[2] = this.state[1];
        this.state[1] = this.state[0];
        const s = this.state[0];
        t ^= s;
        t ^= s >>> 19;
        this.state[0] = t >>> 0;
        return this.state[0] / 0x100000000;
    }

    /**
     * @param {number} max Exclusive upper bound
     * @returns {number} Integer in [0, max - 1]
     */
    nextInt(max) {
        return Math.floor(this.next() * max);
    }
}
