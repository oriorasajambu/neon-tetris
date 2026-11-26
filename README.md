# NEON TETRIS

Zero-dependency, offline-first, guideline-compliant web Tetris with a neon cyberpunk aesthetic.

## Features
- **Zero External Dependencies**: Pure HTML, CSS, and vanilla ES modules. No CDNs, external fonts, or audio files.
- **Tetris Guideline Mechanics**:
  - 10×20 visible playfield + 4 hidden buffer rows (Block Out & Lock Out).
  - Seeded `xorshift128` 7-bag randomizer.
  - Full SRS rotation & wall kicks (JLSTZ + I-piece).
  - T-Spin detection (3-corner rule, Mini vs Full, 5th-kick upgrade) & All-Clear bonus.
  - Guideline gravity curve reaching 20G at Level 15+.
  - Lock delay (500ms, max 15 resets, 5s hard cap).
- **Neon Cyberpunk Rendering**: 3-layer Canvas 2D stack with cached glow, active piece pulse, particle bursts, screen shake, and optional colorblind patterns.
- **Web Audio Synthesizer**: Runtime-generated sound effects (no music, zero audio assets).
- **Deterministic Replays**: Compact input-based replay recording stored in `localStorage` with 1×/2×/4× playback.
- **Configurable Controls & Mobile Touch**: Rebindable keys, DAS/ARR sliders (0–300ms), and dedicated mobile touch buttons with haptic feedback.

## Default Controls
| Action | Key(s) |
|---|---|
| Move Left | `ArrowLeft` / `A` |
| Move Right | `ArrowRight` / `D` |
| Soft Drop | `ArrowDown` / `S` |
| Hard Drop | `Space` |
| Rotate CW | `ArrowUp` / `X` |
| Rotate CCW | `Z` |
| Hold Piece | `C` / `Shift` |
| Pause | `P` / `Esc` |
| Mute | `M` |

## Local Development
Because the project uses native ES modules (`<script type="module">`), serve it over HTTP rather than `file://`:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

### Run Tests
```bash
npm test
```

## GitHub Pages Deployment
Push to `main`. The `.github/workflows/deploy.yml` workflow runs ESLint, executes the Node.js unit test suite, and deploys the repository root to GitHub Pages.
