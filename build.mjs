/*
 * Standalone build — no Vite required.
 *   dist/fix-je-shit.iife.js        front-end widget (React bundled, minified)
 *   dist/fix-je-shit-admin.iife.js  widget-admin panel for the OpenStad admin (plain DOM)
 *   dist/fix-je-shit.css            stub (styles are inlined, scoped to .fjs-root)
 * Run: node build.mjs  (also runs automatically on `npm install` via prepare)
 */
import { build } from "esbuild";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/widget.jsx"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".js": "jsx", ".jsx": "jsx" },
  outfile: "dist/fix-je-shit.iife.js",
  logLevel: "info",
});

await build({
  entryPoints: ["src/widget-admin.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"],
  define: { __FJS_VERSION__: JSON.stringify(version) },
  outfile: "dist/fix-je-shit-admin.iife.js",
  logLevel: "info",
});

writeFileSync(
  "dist/fix-je-shit.css",
  "/* Fix je Shit: styles are inlined in the component, scoped to .fjs-root. */\n",
);
console.log(
  "Build klaar: dist/fix-je-shit.iife.js + dist/fix-je-shit-admin.iife.js + dist/fix-je-shit.css",
);
