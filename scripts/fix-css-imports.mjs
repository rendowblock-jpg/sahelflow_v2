import { readFileSync, writeFileSync } from 'fs';

const css = readFileSync('src/app/globals.css', 'utf8');
const lines = css.split('\n');

// Extract lines 8 through 274 (the base CSS: themes, reset, scrollbar)
const baseLines = lines.slice(7, 274);
writeFileSync('src/app/styles/base.css', baseLines.join('\n') + '\n');
console.log('base.css:', baseLines.length, 'lines');

// Rewrite globals.css as pure imports
const newGlobals = [
  "@import './tokens.css';",
  "@import './styles/base.css';",
  "@import './styles/components.css';",
  "@import './styles/layout.css';",
  "@import './styles/ai-assistant.css';",
  "@import './styles/animations.css';",
  "@import './styles/responsive.css';",
  "@import './styles/dashboard.css';",
  "@import './styles/image-uploader.css';",
  "@import './styles/toast.css';",
  "@import './styles/command-palette.css';",
  "@import './styles/command-palette-ext.css';",
  "@import './styles/ui-overhaul.css';",
  "@import './styles/primitives.css';",
  "@import './styles/utilities.css';",
  "@import './styles/pages.css';",
  "@import './styles/accessibility.css';",
  ""
].join('\n');

writeFileSync('src/app/globals.css', newGlobals);
console.log('globals.css: imports only (' + newGlobals.split('\n').length + ' lines)');
