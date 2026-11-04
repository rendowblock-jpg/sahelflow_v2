# thread lane (R50, fix/s42-thread, draft PR #694) - progress file

Labels: READ IN CODE / COMPUTED (maths over the live token files inside a contract test) / UNKNOWN until the Modal browser run.

## Done (pushed)
1. COMPOSER: visible 3:1 field boundary (foreground 55 % light / 50 % dark into the bar), bg-card, min-h-11 (44 px), 16 px text on phone / 15 px desktop,
   placeholder foreground 70 % (>= 4.5:1), 3 px focus ring. Order [attach, emoji, templates] | field | [mic, send]; send 44 px + tooltip. Colour numbers live in
   inbox-composer-style.ts. Test: inbox-thread-composer-contract.test.ts (22 tests, 8 cascades).
2. HEADER: one solid labelled primary action "Create order", labelled toolbar (role=toolbar), name 15 px / leading-6, avatar hidden < 480 px (no chip/search overlap).
   Test: inbox-thread-header.render.test.tsx (9).
3. BUBBLES: computed 3:1 outlines (incoming fg 55/50 %, outgoing primary 85/60 %), text >= 4.5:1 on card AND on primary-soft (the same contract test, OKLab maths,
   8 cascades), max 70 %, anywhere-wrapping, time on the last bubble of a run.
4. STATES: 25 render tests (skeleton / empty / failed + retry / offline / sending / failed / held) in en, fr, ar: inbox-thread-states.render.test.tsx,
   inbox-thread-states.i18n.render.test.tsx, held-send-notice.render.test.tsx.
5. PHONE TARGETS (this round, commit b5e3704b): every control in the thread pane is >= 40 css px under 640 px, with an EXPLICIT `max-sm:` class (see why below).
   Files: inbox-v3-thread.tsx (search prev/next/close + input, load-older, unread divider, scroll-to-bottom, reply-chip close, voice discard/cancel/send/finish,
   attach, mic, composer row), inbox-emoji-picker.tsx (trigger, search, tabs, cells), canned-response-picker.tsx (trigger, search, items), held-send-notice.tsx,
   inbox-thread-message.tsx (copy, reply, choose-candidate, cancel-upload, quote jump, map link, retry x2), inbox-thread-states.tsx (retry), voice-note-player.tsx
   (play, speed, retry), inbox-media-attachment.tsx (download, lightbox close, open image), conversation-controls.tsx (status chip already had it; snooze presets,
   date field, priority/assign/labels triggers, assign buttons, label chip remove, label input + add).
   Test: inbox-thread-phone-targets.contract.test.ts, 10 tests. RED first: 6 failed (52 controls without a phone floor, 9 icon buttons not square, scroll button,
   composer not wrapped, emoji grid 8 columns, `hidden xl:inline` expectation). GREEN 10/10; whole inbox folder 62 files / 645 tests green.
   Mutation check: removing `max-sm:size-10` from the attach button fails 2 tests and names `inbox-v3-thread.tsx:1192`; restored.

## Why an explicit max-sm class (READ IN CODE)
Button `icon-sm` = size-9, `icon` = var(--control-height) (36 px), `sm` = h-9; they reach the touch floor only through `--sf-touch-target`, which
dashboard-layout.tsx sets to 3rem for a COARSE pointer and to 0px otherwise. A phone emulator, and a touch laptop in a narrow window, report a fine pointer,
so the 36 px sizes stayed. `max-sm:` is deterministic and leaves desktop untouched. On a real phone the floor is 48 px (3rem), which only makes things larger.

## Composer width decision at 360 px (COMPUTED in the test)
One line = attach+emoji+templates (3x40+4) + mic+send (40+44+4) + 2 gaps 12 + padding 24: the field gets 112 px (40 px buttons) or 80 px (real phone, 48 px buttons).
Too narrow to write in. DECISION: under 640 px the row wraps (`flex-wrap`): the field is `max-sm:order-first max-sm:basis-full` (a whole 336 px line), the start group
and the end group (`max-sm:ms-auto`) share the second line (3x48+4 + 48+44+4 + 6 = 250 px, fits). Desktop is unchanged. DOM order is unchanged (attach, field, mic/send),
so desktop tab order is correct; on the phone the visual order differs from the reading order (field first), accepted: the field is the primary control.
Rejected: an overflow menu for emoji + templates (two Radix popovers would have to open from a menu item, a behaviour change); swapping mic and send (changes the voice flow).
Emoji popover: 8 x 40 px cells need 334 px, the popover has 315 px at 360 px, so the grid is 7 columns on the phone (292 px) and headings use `col-span-full`.

## Container query (item 2): REPORT
The class `hidden @min-[36rem]/inbox-thread:inline` is correct, nothing replaced. The container IS declared: `[data-inbox-thread] { container-name: inbox-thread;
container-type: inline-size }` (src/app/workspace-system.css:335), and the header is a child of `<section data-inbox-thread="active">` in inbox-v3-thread.tsx.
Tailwind is 4.3.1 and `compile()` turns the class into `@container inbox-thread (width >= 36rem) { display: inline }` (run on the VM, no browser).
The test now guards three things: every named container variant in the inbox folder has a declared container, the css rule exists, the header sits inside the pane.

## NOT yet proven (the Modal browser run must confirm)
- computed `border-color` of the reply field vs the footer background >= 3:1 in Oasis dark + light (Chromium evaluates color-mix);
- the header WORD shows at 1366 px (pane 700+ px) and is hidden in a 400-575 px pane;
- bubble `bg-primary-soft` text contrast in Chromium (the test approximates 8 % primary over the pane in OKLab);
- phone 390x844 and 360x740: no horizontal overflow of the wrapped composer, all thread controls >= 40x40 (sweep class tap-target on /inbox with a conversation open),
  composer stays above the on-screen keyboard (visualViewport code untouched), emoji popover fits 360 px;
- `sm:[@media(pointer:fine)]:min-h-8` (retry in inbox-thread-states) compiles as a nested media rule.

## How to re-run
`flock /tmp/vt.lock sf vt wt-s42-thread src/components/inbox/__tests__` (62 files, 645 tests). Sweep: `python3 audit/program/ui/sweep-triage.py tap-target overlap-controls text-cut covered-control`.
