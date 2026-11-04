# thread lane (R50, fix/s42-thread) - progress file

## Done (pushed)
1. COMPOSER: reply field now has a visible boundary (`border` = foreground mixed into the bar colour: 55 % light / 50 % dark,
   contract-tested >= 3:1 vs bar AND vs field for sahel/atlas/oasis/dune, both modes), bg-card, min-h-11 (44 px), text-base (16 px) on
   phone / 15 px desktop, placeholder = foreground 70 % on card (>= 4.5:1, contract-tested), focus-visible ring 3 px. Order:
   [attach, emoji, templates] | field | [mic, send]; send is 44 px, has tooltip + data-inbox-send. Emoji + templates buttons got Tooltips.
   Files: inbox-composer-style.ts (new, single source of the colour numbers), inbox-v3-thread.tsx, inbox-emoji-picker.tsx,
   canned-response-picker.tsx. Test: __tests__/inbox-thread-composer-contract.test.ts (RED first: module missing / 7 fails; GREEN 22).
   inbox-workspace-contract.test.ts line 259 now reads the style module for `text-start`.

2. HEADER (pushed): ONE solid primary action "Create order" (sparkle + word, word shown when the thread container >= 36rem, icon-only 40 px on phone;
   long sentence stays in the tooltip), then a labelled toolbar (role=toolbar, aria-label threadActions) with search / mark unread / context, 40 px on phone.
   New copy keys threadActions + threadOrderAction (src/lib/i18n/inbox-workspace.ts en/fr/ar). Name 15 px + leading-6 (sweep text-cut on the h3:
   "needs 23px, box 18px"), avatar hides under 480 px so the status chip no longer overlaps the search button (sweep overlap-controls on phone),
   status chip: focus ring + max-sm:min-h-10. Test: __tests__/inbox-thread-header.render.test.tsx (RED 4 fails, GREEN 9; the chip test was written together with the fix).
   CHECK IN THE BROWSER: the container-query class `@min-[36rem]/inbox-thread:inline` really shows the word at desktop widths.

3. BUBBLES (pushed): outlines are measured, not guessed: incoming = foreground 55 % (light) / 50 % (dark) into the pane, outgoing = primary 85 % / 60 %;
   contract test computes >= 3:1 vs the pane for sahel/atlas/oasis/dune x light/dark (RED: 14 failures incl. outgoing 2.78-2.94:1 at 70 %), text >= 4.5:1
   on card and on primary-soft (8 % primary over the pane, approximated in OKLab: CONFIRM in Chromium). max-w 46rem/70 %, min-w-0, `[overflow-wrap:anywhere]`,
   time visible only on the last bubble of a sender's run (sr-only otherwise; ticks stay). Files: inbox-thread-message.tsx, inbox-composer-style.ts.

## NEXT STEPS FOR A CONTINUATION (state at helper turn ~62)
DONE + pushed: steps 1 composer, 2 header, 3 bubbles (code + contract/render tests, inbox __tests__ = 60 files / 609 tests green). Draft PR #694.
LEFT, in this order:
1. ONE measuring batch: `bash audit/program/ui/devslot.sh thread 3116 start`; screenshots with the see tool (url http://127.0.0.1:3116/inbox, device desktop, locale ar,
   scheme dark/light, then en light, then phone 390x844): LOOK at composer, header, bubbles. Check with layout/inspect_page: (a) computed border colour of
   the textarea vs the footer background >= 3:1 in Oasis dark and light (Chromium handles color-mix), (b) the primary header button shows the WORD at desktop
   width (container-query class `@min-[36rem]/inbox-thread:inline` in inbox-thread-header.tsx - if it never shows, replace with `max-sm:hidden`),
   (c) bubble `bg-primary-soft` text contrast >= 4.5:1, (d) phone: no overlap of status chip and search button, composer above the keyboard.
   Sweep: `python3 audit/program/ui/sweep-triage.py tap-target overlap-controls text-cut covered-control` on a fresh run; compare with audit/ui-s42/sweep/inbox-before/.
   Then `devslot.sh thread 3116 stop`.
2. Step 4 phone: composer buttons are size-9 (36 px) + min touch var; the sweep reports tap-target offenders - fix any thread-side one found.
3. Step 5: add render tests for skeleton / empty / failed+retry / offline / sending-failed-held in en/fr/ar (components: inbox-thread-states.tsx, held-send-notice.tsx).
4. Fill the measured numbers into audit/program/results/thread-design.md and update PR #694 body.
Commands: tests `flock /tmp/vt.lock sf vt wt-s42-thread src/components/inbox/__tests__`; commit `sf commit wt-s42-thread fix/s42-thread "thread: ..." FILES...` (WT is the full worktree name, paths relative to it, run from /opt/agent-sandbox/workspace).
Learned: `getInboxWorkspaceCopy(locale, key)`; bg-primary-soft = primary 8 % alpha (globals.css:83); product tokens parse like contrast-contract.test.ts.
