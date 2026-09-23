/*
 * Standalone build — no Vite required. Runs on `npm install` / `npm publish` via `prepare`.
 *   dist/fix-je-shit.iife.js        front-end widget (React bundled, minified)
 *   dist/fix-je-shit.admin.iife.js  admin settings panel (React bundled)
 *   dist/fix-je-shit.css            stub — all styles are inlined, scoped to .fjs-root
 * dist/ is gitignored; `npm publish` ships it via package.json "files".
 */
import { build } from "esbuild";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
mkdirSync("dist", { recursive: true });

const sharedOptions = {
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2019"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".js": "jsx", ".jsx": "jsx" },
  logLevel: "info",
};

await build({
  ...sharedOptions,
  entryPoints: ["src/widget.jsx"],
  outfile: "dist/fix-je-shit.iife.js",
});

await build({
  ...sharedOptions,
  define: { ...sharedOptions.define, __FJS_VERSION__: JSON.stringify(version) },
  entryPoints: ["src/admin.jsx"],
  outfile: "dist/fix-je-shit.admin.iife.js",
});

writeFileSync("dist/fix-je-shit.css", "");
