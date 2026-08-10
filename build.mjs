import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";

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
  entryPoints: ["src/admin.jsx"],
  outfile: "dist/fix-je-shit.admin.iife.js",
});

writeFileSync("dist/fix-je-shit.css", "");
