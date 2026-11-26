/**
 * Core constants, piece definitions, SRS kick tables, gravity curve, and neon palette.
 * Coordinate convention: x = 0..9 (left to right), y = 0..23 (bottom to top; 0..19 visible, 20..23 buffer).
 */

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const BUFFER_ROWS = 4;
export const TOTAL_ROWS = VISIBLE_ROWS + BUFFER_ROWS;

export const FRAME_DURATION = 1000 / 60; // 16.6667 ms logical frame
export const LOCK_DELAY_FRAMES = 30;     // 500 ms at 60 fps
export const MAX_LOCK_RESETS = 15;
export const MAX_PIECE_LIFETIME_FRAMES = 300; // 5 seconds hard cap at 60 fps
export const LINE_CLEAR_DURATION_FRAMES = 24; // ~400 ms total animation

export const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const PIECE_IDS = {
    I: 1,
    O: 2,
    T: 3,
    S: 4,
    Z: 5,
    J: 6,
    L: 7
};

export const ID_TO_PIECE = {
    1: 'I',
    2: 'O',
    3: 'T',
    4: 'S',
    5: 'Z',
    6: 'J',
    7: 'L'
};

export const COLORS = {
    background: '#0a0a0f',
    grid: '#0a2a2a',
    pieces: {
        I: '#00fff7',
        O: '#ffe600',
        T: '#ff00ff',
        S: '#39ff14',
        Z: '#ff073a',
        J: '#0080ff',
        L: '#ff6600'
    }
};

// Rotation states: 0 = North (spawn), 1 = East (R), 2 = South (2), 3 = West (L)
// Coordinates are [lx, ly] relative to piece bottom-left origin, with +ly pointing UP.
export const PIECE_SHAPES = {
    I: [
        [[0, 2], [1, 2], [2, 2], [3, 2]],
        [[2, 3], [2, 2], [2, 1], [2, 0]],
        [[0, 1], [1, 1], [2, 1], [3, 1]],
        [[1, 3], [1, 2], [1, 1], [1, 0]]
    ],
    O: [
        [[1, 2], [2, 2], [1, 1], [2, 1]],
        [[1, 2], [2, 2], [1, 1], [2, 1]],
        [[1, 2], [2, 2], [1, 1], [2, 1]],
        [[1, 2], [2, 2], [1, 1], [2, 1]]
    ],
    T: [
        [[1, 2], [0, 1], [1, 1], [2, 1]],
        [[1, 2], [1, 1], [2, 1], [1, 0]],
        [[0, 1], [1, 1], [2, 1], [1, 0]],
        [[1, 2], [0, 1], [1, 1], [1, 0]]
    ],
    S: [
        [[1, 2], [2, 2], [0, 1], [1, 1]],
        [[1, 2], [1, 1], [2, 1], [2, 0]],
        [[1, 1], [2, 1], [0, 0], [1, 0]],
        [[0, 2], [0, 1], [1, 1], [1, 0]]
    ],
    Z: [
        [[0, 2], [1, 2], [1, 1], [2, 1]],
        [[2, 2], [1, 1], [2, 1], [1, 0]],
        [[0, 1], [1, 1], [1, 0], [2, 0]],
        [[1, 2], [0, 1], [1, 1], [0, 0]]
    ],
    J: [
        [[0, 2], [0, 1], [1, 1], [2, 1]],
        [[1, 2], [2, 2], [1, 1], [1, 0]],
        [[0, 1], [1, 1], [2, 1], [2, 0]],
        [[1, 2], [1, 1], [0, 0], [1, 0]]
    ],
    L: [
        [[2, 2], [0, 1], [1, 1], [2, 1]],
        [[1, 2], [1, 1], [1, 0], [2, 0]],
        [[0, 1], [1, 1], [2, 1], [0, 0]],
        [[0, 2], [1, 2], [1, 1], [1, 0]]
    ]
};

// Spawn origin (x, y) in board coordinates (bottom-left of bounding box)
// For 3x3 pieces, row 21 is ly=1 and row 22 is ly=2 -> y = 20
// For 4x4 pieces (I, O), ly=2 is row 21 -> y = 19 (so I spawns on row 21, O on rows 20-21)
export const SPAWN_POSITIONS = {
    I: { x: 3, y: 19 },
    O: { x: 3, y: 19 },
    T: { x: 3, y: 20 },
    S: { x: 3, y: 20 },
    Z: { x: 3, y: 20 },
    J: { x: 3, y: 20 },
    L: { x: 3, y: 20 }
};

// SRS Wall Kick tables (+y = UP)
export const JLSTZ_KICKS = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};

export const I_KICKS = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
};

// Front corners of the T-piece 3x3 bounding box for each rotation state
export const T_FRONT_CORNERS = {
    0: [[0, 2], [2, 2]],
    1: [[2, 2], [2, 0]],
    2: [[0, 0], [2, 0]],
    3: [[0, 2], [0, 0]]
};

export const T_ALL_CORNERS = [[0, 2], [2, 2], [0, 0], [2, 0]];

/**
 * Returns gravity in cells per 60fps frame for the given level.
 * Reaches 20G at level 15+.
 */
export function getGravity(level) {
    if (level >= 15) return 20.0;
    const clamped = Math.max(1, level);
    const secondsPerCell = Math.pow(0.8 - (clamped - 1) * 0.007, clamped - 1);
    return 1 / (secondsPerCell * 60);
}

export const ACTIONS = {
    LEFT: 0,
    RIGHT: 1,
    SOFT_DROP: 2,
    HARD_DROP: 3,
    ROTATE_CW: 4,
    ROTATE_CCW: 5,
    HOLD: 6
};

export const DEFAULT_KEYBINDINGS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    softDrop: ['ArrowDown', 'KeyS'],
    hardDrop: ['Space'],
    rotateCW: ['ArrowUp', 'KeyX'],
    rotateCCW: ['KeyZ'],
    hold: ['KeyC', 'ShiftLeft', 'ShiftRight'],
    pause: ['KeyP', 'Escape'],
    mute: ['KeyM']
};

export const DEFAULT_SETTINGS = {
    das: 133,
    arr: 10,
    volume: 70,
    muted: false,
    colorblind: false,
    nextCount: 5,
    keybindings: structuredClone(DEFAULT_KEYBINDINGS)
};

export const GAME_STATES = {
    MENU: 'MENU',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    COUNTDOWN: 'COUNTDOWN',
    LINE_CLEARING: 'LINE_CLEARING',
    GAME_OVER: 'GAME_OVER',
    REPLAY: 'REPLAY'
};
