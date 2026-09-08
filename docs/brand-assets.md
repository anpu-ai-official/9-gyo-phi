# 9-gyo-φ brand assets

The supplied identity sheet was separated into a production asset system. The final application assets are vector-first so edges remain crisp and the palette stays stable at every scale.

| Asset                                             | Intended use                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/static/brand-symbol.svg`                     | Sidebar, favicon, onboarding, compact UI placements, transparent backgrounds |
| `src/static/brand-lockup.svg`                     | Website headers, release pages, documentation, wide placements               |
| `src/static/brand-symbol-reversed.svg`            | Light cards, cream surfaces, partner or press placements                     |
| `src/static/app-icon-master.svg`                  | Source for desktop, mobile, Windows, and store icon generation               |
| `src/static/brand-assets/symbol-128.png`          | Raster fallback for compact UI and email templates                           |
| `src/static/brand-assets/symbol-512.png`          | General transparent raster mark                                              |
| `src/static/brand-assets/symbol-reversed-512.png` | Reversed raster mark                                                         |
| `src/static/brand-assets/lockup-1600.png`         | Lossless wide raster lockup                                                  |
| `src/static/brand-assets/lockup-1600.webp`        | Optimized web/marketing lockup                                               |

## Core palette

- Deep plum: `#2B102E`
- Plum: `#45183F`
- Highlight plum: `#6B315E`
- Warm cream: `#FFFDF7`
- Soft cream: `#F1E4D5`

## Usage rules

- Keep at least ten percent of the symbol width as clear space.
- Use the compact mark below approximately 320 pixels of available width; use the lockup only when the tagline remains readable.
- Use the normal transparent mark on light or neutral UI surfaces and the reversed tile when a bounded cream treatment is needed.
- Generate platform icons only from `app-icon-master.svg` with `npx tauri icon src/static/app-icon-master.svg`.
- Do not stretch, rotate, recolor individual bars, replace the Greek phi in the visual wordmark, or place additional copy inside the mark.

The AI reconstruction pass was used to study and regularize the low-resolution source geometry. Its simulated checkerboard transparency was rejected; the production assets were rebuilt as deterministic SVG and their raster derivatives were rendered from those masters.
