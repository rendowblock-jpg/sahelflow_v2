import * as React from "react";

/**
 * wrangler always compiles JSX with the classic transform (it passes
 * `jsxFactory: "React.createElement"` to esbuild, which overrides the repo's
 * `"jsx": "react-jsx"`), so the shared storefront components, written for the
 * automatic runtime, reach for a global `React` at render time. This module
 * provides it. Import it before anything that renders; the shared components
 * themselves stay untouched for the Studio and Next.
 */
(globalThis as { React?: typeof React }).React = React;
