# Image and Asset Requirements

Use this file as the hand-off list for assets that still need presenter confirmation or replacement.

| Priority | Recommended filename | Slide | Needed image / short description | Current status |
|---|---|---:|---|---|
| High | `hanoi-night-skyline-licensed.jpg` | 01 | Wide 16:9 Hanoi skyline at night, generous dark sky/negative space on the left or top. Must not depict or imply an AWS facility. | `hanoi.png` is usable visually; source and presentation/publication rights must be confirmed. |
| High | `hanoi-local-zone-parent-region-v1.svg` | 03 | Presenter-drawn overview: Hanoi Local Zone bounded separately from Singapore parent Region, with control-plane and regional-dependency arrows. | `ASSET_NEEDED`; the deck currently renders a clean built-in topology placeholder. |
| High | `hanoi-local-zone-parent-region-v2.svg` | 05 or 12 | Presenter-drawn detailed data-flow/fault-domain version showing local compute/storage, Singapore dependencies, backup destinations and cross-border edges. | `ASSET_NEEDED`; a second reserved slot is documented in the slide notes. |
| High | `benchmark-results.json` | 10 | Real run output for `/health`, `/products`, `/checkout-sim`: p50, p95, error rate, sample size, client location, timestamp and environment. | `BENCHMARK_PENDING`; no invented bars or values are shown. |
| Medium | `benchmark-terminal-recording.mp4` | 10 | 20–40 second prerecorded terminal capture as fallback if the live demo fails. No secrets/account identifiers. | `ASSET_NEEDED`. |
| Medium | `cli-placement-proof.png` | 04 | Cropped terminal screenshot proving opt-in discovery and instance placement in `ap-southeast-1-han-1a`. Redact account IDs, IPs and credentials. | Optional; the deck currently shows validated command text. |
| Medium | `xbrain-logo-white.svg` | 01, 14 | Official vector XBrain logo supplied by brand owner. | Current deck uses a text wordmark to avoid extracting an unofficial logo from the banner. |
| Low | `lab-network-path.svg` | 10 | Minimal lab map: Vietnam test client → Hanoi/Singapore endpoints, including connection type and test conditions. | Can be generated once the lab topology is confirmed. |

## Existing files retained as references

- `techtalk-banner.png`: official event context and color reference.
- `timeline.png`: timing reference.
- `dilemma.png`: older ASEAN infrastructure reference; do not publish without revalidating every label.
- `3-tier.png`: conceptual reference only; contains questionable labels and is not used as factual architecture art.
- `icon-package-aws/`: official AWS Architecture Icon package supplied with the repository; selected SVGs are imported directly by the app.

