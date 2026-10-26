# Design Decisions — XBrain TechTalk

Checked: 2026-10-26

## Discovery

- `getdesignmd` command: not installed.
- `getdesign.md`: not present.
- Existing source of truth: `design-system/xbrain-techtalk-slides/MASTER.md`.
- Installed local guidance: UI/UX Pro Max, Vercel React best practices, GSAP core/React/timeline/performance, and web-design-guidelines.
- Existing stack: React 19, TypeScript, Vite, GSAP, Lucide.
- Available assets: presenter-supplied Hanoi photo, event banner, two reference diagrams, and the official AWS Architecture Icon Package dated 2026-07-31.

## Selected direction

**Editorial Cloud Infrastructure × Operational Dashboard × XBrain Orange**

The deck behaves like a technical product story rather than a PowerPoint template. It combines large editorial typography, restrained operational UI details, and purpose-built infrastructure diagrams.

- Canvas: fixed-ratio 16:9 stage with uniform viewport scaling.
- Palette: near-black navy, warm paper, XBrain orange, AWS orange, and cyan only for data movement.
- Typography: Inter for presentation readability; IBM Plex Mono for commands, evidence labels, coordinates, and metrics.
- Layout: one thesis per slide; asymmetrical editorial grids; large diagrams; 110 px logical safe area.
- Architecture: official AWS service icons inside custom SVG/HTML topology. Boundaries, fault domains, and cross-border edges are always labeled.
- Motion: 360–700 ms entrance timelines using transform/opacity only. Data flows reveal in reading order. Reduced-motion users receive the completed state immediately.
- Interaction: Arrow/Space/Home/End navigation, URL hashes, fullscreen, overview, speaker notes, print layout, and touch swipe.
- Evidence: status chips use `VERIFIED`, `VERIFY`, `ASSUMPTION`, `ASSET_NEEDED`, or `BENCHMARK_PENDING`.

## Layout families

1. Dramatic editorial cover/closing.
2. Split thesis + topology.
3. Bounded geography/fault-domain diagram.
4. Terminal + procedure flow.
5. Evidence chain/editorial comparison.
6. Architecture triptych.
7. Benchmark console + empty-state chart.
8. Qualitative decision matrix.

## Rejected alternatives

- **Full sci-fi HUD:** too theatrical for an internal architecture talk and weakens evidence hierarchy.
- **Glassmorphism/card wall:** reduces projector contrast and makes every idea look equally important.
- **Stock-cloud photography:** visually generic and often implies facilities or capabilities that are not shown.
- **Scroll-driven website:** the talk requires deterministic slide navigation and presenter timing.
- **Heavy WebGL/3D:** unnecessary performance and QA risk; diagrams communicate the architecture more precisely.
- **Existing `dilemma.png` and `3-tier.png` as slide art:** retained only as references because labels/status may be outdated or incorrect. The deck redraws these ideas.

## Asset policy

- Use the local official AWS Architecture Icons package for AWS services.
- Treat `hanoi.png` as presenter-provided; confirm source and presentation rights before external publication.
- Do not imply the skyline is an AWS facility.
- No benchmark number is rendered until supplied from the actual lab.
- User-drawn Hanoi/parent-Region architecture should replace the reserved asset slots when ready.

