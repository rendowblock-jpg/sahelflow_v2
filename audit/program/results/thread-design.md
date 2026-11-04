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
| phone controls (390x844, 360x740) | composer buttons size-9 = 36 px (+ min var that is 0px for a fine pointer), search/voice/emoji/template/message-row/held-send buttons h-7..h-9, emoji cells size-8 | every thread-pane control has an explicit `max-sm:` floor of 40 px (send/back 44); 10-test contract scans 11 files, RED 6 fails (52 controls) -> GREEN | READ IN CODE + contract test; NOT YET measured in Chromium |
| composer row at 360 px | one line: field would get 112 px (40 px buttons) / 80 px (real phone, 48 px) | under 640 px the row wraps: field on its own 336 px line (`max-sm:order-first basis-full`), the two button groups share the second line (250 px) | COMPUTED in the contract test; desktop unchanged |
| emoji popover on phone | 8 columns of 32 px cells | 7 columns of 40 px+ cells (8 x 40 = 334 px > 315 px popover), 40 px category tabs and search | COMPUTED |
| header primary-action word | `@min-[36rem]/inbox-thread:inline` suspected undeclared | CHECKED: container declared by `[data-inbox-thread]` (workspace-system.css), Tailwind 4.3.1 compiles it to `@container inbox-thread (width >= 36rem)`; kept | compile() on the VM + contract test; word at desktop width NOT YET seen in Chromium |

## Not done / for the Modal browser run (honest)
- Chromium: computed field border vs footer (Oasis dark + light), header word at 1366 px and absent in a 400-575 px pane, primary-soft text contrast, bubble outlines.
- Phone sweep of /inbox WITH a conversation open (390x844 and 360x740, en + ar): tap-target, overlap-controls, covered-control, no sideways overflow of the wrapped composer;
  composer above the on-screen keyboard (visualViewport code untouched, not re-verified); emoji popover inside 360 px.
- INFERRED: the earlier inbox sweep (inbox-before) lists only list-pane tap-target offenders, so it probably ran with no conversation open and sampled the thread
  controls barely; the contract test is the guard until a run with a conversation open exists.
