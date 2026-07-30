/*
 * Standalone build — no Vite required.
 * Produces dist/fix-je-shit.iife.js (React bundled, minified) and a CSS
 * placeholder (styles are inlined in the component, scoped to .fjs-root).
 *
 * Run: node build.mjs  (also runs automatically on `npm install` via prepare)
 */
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";

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

// The manifest requires a css file to exist. All visual styles live inside the
// component in a <style> tag scoped to .fjs-root, so this file stays a stub.
writeFileSync(
  "dist/fix-je-shit.css",
  "/* Fix je Shit: styles are inlined in the component, scoped to .fjs-root. */\n",
);

console.log("Build klaar: dist/fix-je-shit.iife.js + dist/fix-je-shit.css");
