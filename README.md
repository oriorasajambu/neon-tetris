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

## Contributing and Release Flow

Name working branches with a lowercase kebab-case description:

```text
feature/add-audio-controls
bug/fix-replay-loading
chore/update-eslint
docs/clarify-controls
refactor/split-renderer
hotfix/fix-release-crash
```

Use `rc` as the release candidate branch. Feature, bug, chore, docs, and refactor branches target `rc` (or `dev` if that optional integration branch is created); `dev` promotes only to `rc`; and `rc` promotes to `main`. Hotfix branches may target `rc` or `main`. Direct pushes to protected release branches are not part of the release flow.

## GitHub Pages Deployment

The GitHub Actions workflow validates branch names and pull request targets, then runs ESLint, the Node.js test suite, and static-site packaging checks for code/config changes. Markdown, `docs/**`, and `LICENSE`-only changes skip the heavy checks while still producing the required successful status. Merge queues are supported on `rc` and `main`.

Code/config changes deploy the static app assets to GitHub Pages only after the required checks pass on `main`. Docs-only merges do not redeploy the unchanged site. GitHub Pages must be configured to use GitHub Actions.
