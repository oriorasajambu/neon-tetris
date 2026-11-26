import { findBestMove } from './ai-core.js';

self.onmessage = (event) => {
    const { id, payload } = event.data;
    const plan = findBestMove(payload);
    self.postMessage({ id, plan });
};
