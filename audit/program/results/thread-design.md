# thread pane design - before / after per element (lane thread, branch fix/s42-thread, PR #694 draft)

Labels: READ IN CODE = from the source; COMPUTED = OKLab maths over the live token files inside the contract test
(src/components/inbox/__tests__/inbox-thread-composer-contract.test.ts, 8 cascades = sahel/atlas/oasis/dune x light/dark);
NOT YET MEASURED IN CHROMIUM = the one browser batch was not reached (helper turn budget). Run it first (see thread.md).

| element | before (READ IN CODE) | after | proof |
|---|---|---|---|
| reply field boundary | `border-0 bg-transparent` in a tray `border-border/75` (token 0.85 L on 0.95 L, about 1.3:1): invisible in light | `border` + foreground 55 % (light) / 50 % (dark) into the bar colour, bg-card | COMPUTED >= 3:1 vs bar AND vs field, 8/8 cascades (RED first: dark at 42 % gave 2.85:1) |
| field height | min-h-10 (40 px) | min-h-11 (44 px), grows to max-h-32 | READ IN CODE |
| placeholder | 14 px, muted-foreground | 16 px phone / 15 px desktop, foreground 70 % on card | COMPUTED >= 4.5:1, 8/8 |
| focus | ring-0 on the field, ring on the tray | field: border-ring + 3 px ring (ring-ring/35) | READ IN CODE |
| composer order | attach, mic, emoji, templates, field, send (icons crowd the start side) | [attach, emoji, templates] \| field \| [mic, send]; send 44 px, disabled when empty, tooltip | READ IN CODE; Enter/Shift+Enter test kept |
| emoji / templates buttons | name only (templates had `title`) | name + Radix tooltip from the same dictionary string | contract test |
| header actions | 4 equal 36 px icon buttons (one outlined sparkle), names only in aria/tooltip | ONE solid primary "Create order" (word shown at thread width >= 36rem, icon-only 40 px on phone) + labelled toolbar (search, unread, context) | render test en/fr/ar |
| header name | 13 px, `truncate` with a 18 px box: Arabic needs 23 px (sweep text-cut) | 15 px, leading-6 (24 px) | render test |
| header on phone | chip overlapped the search button (sweep overlap-controls, en+ar dark phone) | avatar hidden under 480 px, buttons size-10, chip max-sm:min-h-10 + focus ring | render test; NOT YET re-swept |
| bubble outline | incoming border-border/70 (about 1.3:1), outgoing border-primary/20 | incoming fg 55/50 %, outgoing primary 85/60 % into the pane | COMPUTED >= 3:1 vs pane, 8/8 (RED: outgoing 2.78-2.94:1 at 70 %) |
| bubble text | foreground on card / primary-soft | unchanged tokens | COMPUTED >= 4.5:1, 8/8 (primary-soft approximated as 8 % primary over the pane) |
| bubble width / wrapping | max 75 %, `break-words` | max 70 %, min-w-0, `overflow-wrap:anywhere` | READ IN CODE |
| grouping | mt-4 / mt-1 existed | time shown only on the last bubble of a run (sr-only otherwise); ticks stay on each outgoing bubble | contract test |

## Not done (honest)
- Browser batch (Chromium computed colours, sweep '/inbox' 8 cells, screenshots ar dark / ar light / en light): NOT RUN.
- Step 4 phone composer above the keyboard + back control: back control exists (size-11); visualViewport code untouched, NOT re-verified.
- Step 5 states (skeleton/empty/failed/offline/sending/held en/fr/ar): existing tests (inbox-thread-states.render.test.tsx, held-send-notice.render.test.tsx) still pass; no new state tests written.
