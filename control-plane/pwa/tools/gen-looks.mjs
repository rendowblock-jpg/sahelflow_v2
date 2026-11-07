// node control-plane/pwa/tools/gen-looks.mjs : rewrite src/styles/looks.css from the desktop app's colour files.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { generateLooksCss } from "./looks.mjs";

const root = (p) => fileURLToPath(new URL("../../../" + p, import.meta.url));
export const DESKTOP_FILES = ["src/app/globals.css", "src/app/product-system.css", "src/app/theme-preset-system.css"];
export const readDesktop = () => DESKTOP_FILES.map((f) => readFileSync(root(f), "utf8"));

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = fileURLToPath(new URL("../src/styles/looks.css", import.meta.url));
  const css = generateLooksCss(readDesktop());
  writeFileSync(out, css);
  process.stdout.write(`wrote ${out} ${css.length} bytes\n`);
}
