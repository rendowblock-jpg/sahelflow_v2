# SahelFlow Remotion Launch System

This workspace contains SahelFlow's isolated marketing and product-demonstration video system. It does not change the application runtime, database, Tauri shell, product logic, or release behavior.

## Included compositions

| Composition | Format | Duration | Purpose |
|---|---:|---:|---|
| `SahelFlow-Launch-60` | 1920×1080 | 60s | Main product launch film |
| `SahelFlow-Social-30` | 1920×1080 | 30s | Social advertisement and product overview |
| `SahelFlow-Vertical-15` | 1080×1920 | 15s | Reels, TikTok, and Shorts cut |
| `SahelFlow-Demo-90` | 1920×1080 | 90s | Guided product-demonstration film |

All compositions run at 30 FPS and share the same motion design system, interface components, status language, product positioning, and visual tokens.

## Current creative direction

The first system is intentionally built around SahelFlow's documented product and existing design language:

- dark graphite operational surfaces;
- Sahel emerald as the primary brand color;
- restrained blue, amber, magenta, and cyan operational accents;
- Windows-first and local-first positioning;
- Algerian COD workflows;
- orders, inventory, customers, delivery, WhatsApp workflows, automation, and analytics;
- Arabic, French, and English readiness;
- calm, precise, high-trust motion rather than generic SaaS spectacle.

The UI shown in this first render is a coded motion facsimile derived from the application's actual design system and documented workflows. It is suitable for creative review and early marketing previews. Final evidence-grade demonstration cuts should replace facsimile moments with approved real application captures where exact behavior must be shown.

## Truth boundary

The videos must not claim capabilities that are absent, unverified, or only planned. The current copy deliberately avoids claims such as guaranteed provider reliability, certified performance, automatic cloud recovery, or completed release evidence.

Final product-demonstration renders should use:

1. real approved application captures;
2. representative but non-sensitive demo data;
3. verified feature wording;
4. current Arabic, French, and English labels;
5. explicit disclosure when a screen is illustrative rather than captured.

## Run locally

From this directory:

```bash
npm install
npm run studio
```

The Remotion Studio opens all four compositions.

## Typecheck

```bash
npm run typecheck
```

## Render

```bash
npm run render:launch
npm run render:social
npm run render:vertical
npm run render:demo
```

Preview bundle:

```bash
npm run render:preview
```

Rendered files are written to `marketing/remotion/renders/` and are ignored by Git.

## Structure

```text
marketing/remotion/
├── package.json
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts
    ├── Root.tsx
    ├── theme.ts
    ├── components.tsx
    └── compositions.tsx
```

## Creative sequence

### 60-second launch film

1. COD operational chaos
2. SahelFlow brand reveal
3. live command center
4. order workflow
5. seller-controlled automation
6. connected operating system
7. Windows-first, local-first, multilingual positioning
8. final brand lockup

### 90-second demonstration

1. product framing
2. command center walkthrough
3. order-state walkthrough
4. capture-to-insight operating rhythm
5. automation walkthrough
6. connected feature system
7. language and local environment
8. operational outcome
9. final brand lockup

## Next production passes

- Capture approved application journeys at 1920×1080.
- Replace selected facsimile scenes with real footage inside reusable device frames.
- Add Arabic and French copy variants.
- Add subtitle tracks and voice-over timing sheets.
- Add licensed music and sound design.
- Produce 6-second bumper, feature-specific cuts, and silent-caption variants.
- Export final MP4, WebM, thumbnail, poster frame, and subtitle deliverables.

## Dependency policy

Remotion packages are pinned to the same exact version. This follows Remotion's package-alignment requirement and avoids version skew between the core and CLI packages.
