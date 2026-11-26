import {
    PIECE_TYPES,
    PIECE_SHAPES,
    SPAWN_POSITIONS,
    JLSTZ_KICKS,
    I_KICKS
} from './constants.js';

/**
 * Active tetromino with SRS rotation state and kick support.
 */
export class Tetromino {
    /**
     * @param {string} type One of 'I', 'O', 'T', 'S', 'Z', 'J', 'L'
     */
    constructor(type) {
        this.type = type;
        this.rotation = 0;
        const spawn = SPAWN_POSITIONS[type];
        this.x = spawn.x;
        this.y = spawn.y;
        this.lastMoveWasRotation = false;
        this.lastKickIndex = 0;
    }

    /**
     * Returns block offsets for current or specified rotation state.
     */
    getBlocks(rotation = this.rotation) {
        return PIECE_SHAPES[this.type][rotation];
    }

    /**
     * Returns SRS kick offsets for transitioning from current rotation to targetRotation.
     */
    getKicks(targetRotation) {
        if (this.type === 'O') {
            return [[0, 0]];
        }
        const key = `${this.rotation}>${targetRotation}`;
        return this.type === 'I' ? I_KICKS[key] : JLSTZ_KICKS[key];
    }

    clone() {
        const copy = new Tetromino(this.type);
        copy.rotation = this.rotation;
        copy.x = this.x;
        copy.y = this.y;
        copy.lastMoveWasRotation = this.lastMoveWasRotation;
        copy.lastKickIndex = this.lastKickIndex;
        return copy;
    }
}

/**
 * 7-Bag randomizer backed by a deterministic PRNG.
 */
export class BagRandomizer {
    /**
     * @param {import('./rng.js').PRNG} prng
     */
    constructor(prng) {
        this.prng = prng;
        this.bag = [];
    }

    refill() {
        const nextBag = [...PIECE_TYPES];
        for (let i = nextBag.length - 1; i > 0; i--) {
            const j = this.prng.nextInt(i + 1);
            const tmp = nextBag[i];
            nextBag[i] = nextBag[j];
            nextBag[j] = tmp;
        }
        this.bag.push(...nextBag);
    }

    /**
     * Draws and removes the next piece type from the queue.
     */
    next() {
        if (this.bag.length <= 7) {
            this.refill();
        }
        return this.bag.shift();
    }

    /**
     * Peeks at the next `count` piece types without removing them.
     */
    peek(count) {
        while (this.bag.length < count) {
            this.refill();
        }
        return this.bag.slice(0, count);
    }
}
