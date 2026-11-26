import { COLS, TOTAL_ROWS, VISIBLE_ROWS, PIECE_IDS } from './constants.js';

/**
 * Represents the 10x24 Tetris playfield (20 visible rows + 4 hidden buffer rows).
 * Row 0 is the bottom of the board; row 23 is the top of the buffer zone.
 */
export class Board {
    constructor() {
        this.cols = COLS;
        this.rows = TOTAL_ROWS;
        this.visibleRows = VISIBLE_ROWS;
        this.grid = this.createEmptyGrid();
    }

    createEmptyGrid() {
        return Array.from({ length: this.rows }, () => new Uint8Array(this.cols));
    }

    reset() {
        this.grid = this.createEmptyGrid();
    }

    /**
     * Checks if a cell coordinate is occupied or out of bounds.
     */
    isOccupied(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
            return true;
        }
        return this.grid[y][x] !== 0;
    }

    /**
     * Validates whether a piece with given blocks at (x, y) fits on the board.
     * @param {Array<[number, number]>} blocks Local [lx, ly] block offsets
     * @param {number} x Board X of piece origin
     * @param {number} y Board Y of piece origin
     */
    isValidPosition(blocks, x, y) {
        for (let i = 0; i < blocks.length; i++) {
            const nx = x + blocks[i][0];
            const ny = y + blocks[i][1];
            if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) {
                return false;
            }
            if (this.grid[ny][nx] !== 0) {
                return false;
            }
        }
        return true;
    }

    /**
     * Locks a piece into the grid.
     * @returns {{ lockedOut: boolean }} True if all blocks locked above visible rows
     */
    lockPiece(piece) {
        const blocks = piece.getBlocks();
        const id = PIECE_IDS[piece.type];
        let allAboveVisible = true;

        for (let i = 0; i < blocks.length; i++) {
            const nx = piece.x + blocks[i][0];
            const ny = piece.y + blocks[i][1];
            if (ny >= 0 && ny < this.rows && nx >= 0 && nx < this.cols) {
                this.grid[ny][nx] = id;
            }
            if (ny < this.visibleRows) {
                allAboveVisible = false;
            }
        }

        return { lockedOut: allAboveVisible };
    }

    /**
     * Returns sorted indices (ascending) of all completely filled rows.
     */
    getFullRows() {
        const fullRows = [];
        for (let y = 0; y < this.rows; y++) {
            let full = true;
            for (let x = 0; x < this.cols; x++) {
                if (this.grid[y][x] === 0) {
                    full = false;
                    break;
                }
            }
            if (full) {
                fullRows.push(y);
            }
        }
        return fullRows;
    }

    /**
     * Removes specified rows and shifts higher rows downward.
     * @param {number[]} rowsToClear Sorted ascending row indices
     */
    clearRows(rowsToClear) {
        if (rowsToClear.length === 0) return;
        const clearSet = new Set(rowsToClear);
        const newGrid = [];

        for (let y = 0; y < this.rows; y++) {
            if (!clearSet.has(y)) {
                newGrid.push(this.grid[y]);
            }
        }
        while (newGrid.length < this.rows) {
            newGrid.push(new Uint8Array(this.cols));
        }
        this.grid = newGrid;
    }

    /**
     * Checks if every cell on the board is empty (All-Clear / Perfect Clear).
     */
    isEmpty() {
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.grid[y][x] !== 0) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Computes the Y coordinate where the active piece would land on hard drop.
     */
    getGhostY(piece) {
        const blocks = piece.getBlocks();
        let ghostY = piece.y;
        while (this.isValidPosition(blocks, piece.x, ghostY - 1)) {
            ghostY--;
        }
        return ghostY;
    }
}
