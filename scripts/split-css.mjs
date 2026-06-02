/**
 * CSS Split Script — Splits globals.css into modular files
 * Run: node scripts/split-css.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const SRC = join(process.cwd(), 'src', 'app');
const STYLES_DIR = join(SRC, 'styles');
const INPUT = join(SRC, 'globals.css');

// Ensure styles directory exists
if (!existsSync(STYLES_DIR)) mkdirSync(STYLES_DIR, { recursive: true });

const css = readFileSync(INPUT, 'utf8');
const lines = css.split('\n');

// Section definitions: [startLine (1-indexed), endLine (1-indexed), filename]
const sections = [
  // Base stays in globals.css (tokens import, themes, reset, scrollbar)
  // Lines 1-270 stay in globals.css

  // Component classes: cards, buttons, inputs, badges, stats, tables, modals, toggles, etc.
  [271, 691, 'components.css'],

  // Layout: sidebar, topbar, mobile nav, main content, page header, grids, theme toggle, lang switcher
  [692, 1049, 'layout.css'],

  // AI Assistant panel, chat bubbles, action cards
  [1050, 1246, 'ai-assistant.css'],

  // Keyframe animations
  [1247, 1329, 'animations.css'],

  // Responsive: tablet + mobile + mobile utilities
  [1330, 1537, 'responsive.css'],

  // Dashboard home page utility classes
  [1538, 1671, 'dashboard.css'],

  // Image uploader
  [1672, 1743, 'image-uploader.css'],

  // Toast notifications
  [1744, 1907, 'toast.css'],

  // Command palette (first block)
  [1908, 2123, 'command-palette.css'],

  // Command palette (second block - likely duplicate/extended)
  [2124, 2293, 'command-palette-ext.css'],

  // Phase 61: System-wide UI/UX overhaul
  [2294, 3686, 'ui-overhaul.css'],

  // Phase 3: Component primitives (Auth, topbar enhanced, stat cards, cashflow, etc.)
  [3687, 4244, 'primitives.css'],

  // Phase 3A + 3B: Utility classes + inline style elimination
  [4245, 5045, 'utilities.css'],

  // A+ Finish Phase 4b + 4c + 4d: Products, integrations, risk, automation, delivery, inbox
  [5046, 6107, 'pages.css'],

  // Accessibility
  [6108, 6167, 'accessibility.css'],
];

// Extract base (lines 1-270) — this stays in globals.css
const baseCss = lines.slice(0, 270).join('\n');

// Extract each section into its own file
for (const [start, end, filename] of sections) {
  const sectionLines = lines.slice(start - 1, end);
  const content = sectionLines.join('\n');
  const outPath = join(STYLES_DIR, filename);
  writeFileSync(outPath, content + '\n', 'utf8');
  console.log(`✅ ${filename}: ${sectionLines.length} lines (L${start}-L${end})`);
}

// Generate new globals.css with imports
const newGlobals = `@import "./tokens.css";

/* ═══════════════════════════════════════════════
   SahelFlow Design System v3.0
   Modular CSS Architecture
   ═══════════════════════════════════════════════ */

${baseCss.split('\n').slice(2).join('\n')}

/* ═══ Modular Imports ═══ */
@import "./styles/components.css";
@import "./styles/layout.css";
@import "./styles/ai-assistant.css";
@import "./styles/animations.css";
@import "./styles/responsive.css";
@import "./styles/dashboard.css";
@import "./styles/image-uploader.css";
@import "./styles/toast.css";
@import "./styles/command-palette.css";
@import "./styles/command-palette-ext.css";
@import "./styles/ui-overhaul.css";
@import "./styles/primitives.css";
@import "./styles/utilities.css";
@import "./styles/pages.css";
@import "./styles/accessibility.css";
`;

// Write the new globals.css
writeFileSync(INPUT, newGlobals, 'utf8');
console.log(`\\n✅ globals.css rewritten with ${sections.length} imports`);
console.log(`📁 ${sections.length} files created in src/app/styles/`);

// Verify total line count
const totalExtracted = sections.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
console.log(`📊 Total lines extracted: ${totalExtracted} / ${lines.length}`);
console.log(`📊 Base lines kept in globals.css: 270`);
