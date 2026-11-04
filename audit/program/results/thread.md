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

## NEXT STEPS FOR A CONTINUATION
- Step 2 THREAD HEADER (inbox-thread-header.tsx): names + tooltips for the 4 icon buttons, one primary action, 40 px on phone.
- Step 3 BUBBLES (inbox-thread-message.tsx, inbox-message-visual.ts): contrast, max-w ~70 %, grouping, wrapping, ticks.
- Step 4 PHONE, Step 5 STATES (tests en/fr/ar), then the ONE measuring batch + audit/program/results/thread-design.md.
- Commands: `flock /tmp/vt.lock sf vt wt-s42-thread src/components/inbox/__tests__` (59 files, 580+ tests);
  commit: `sf commit thread fix/s42-thread "msg" FILES...`; server: `bash audit/program/ui/devslot.sh thread 3116 start|stop`.
