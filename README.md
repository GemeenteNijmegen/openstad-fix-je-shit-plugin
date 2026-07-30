# Fix je Shit — OpenStad Headless plugin

Client-side widget for young people turning 18 (Gemeente Nijmegen). A self-check
(swipe quiz) for administrative essentials: DigiD, health insurance, healthcare
allowance (zorgtoeslag), housing, work, donor register and more.

- **Type:** widget-only plugin — no API, models or migrations. Fully
  client-side (React is bundled into the build).
- **Widget key:** `fixJeShit`
- **Global:** `window.OpenstadHeadlessFixJeShit.loadWidget(elementId, props)`
- **Compatible with:** OpenStad Headless **v2.7.0+** (plugin system).

## Installation (production)

Plugins are installed by the platform maintainer via the Helm chart, not through
the admin panel. The package is published to **GitHub Packages** under the
`@gemeentenijmegen` scope.

| Item | Value |
|------|-------|
| packageName | `@gemeentenijmegen/fix-je-shit-plugin` |
| version | `1.0.0` |
| registry | `https://npm.pkg.github.com` (scope `@gemeentenijmegen`) |
| ENV vars | none |

See **[LEVERING.md](./LEVERING.md)** for the exact Helm values, the `.npmrc`
snippet and the read-token instructions.

## Local / development install

For a local OpenStad (Docker) you can install straight from the repo:

```bash
npm install github:GemeenteNijmegen/openstad-fix-je-shit-plugin#v1.0.0
```

Then register it in `plugins.json` (or via `PLUGIN_JSON_OVERRIDE`):

```json
{
  "plugins": [
    {
      "name": "fix-je-shit",
      "packageName": "@gemeentenijmegen/fix-je-shit-plugin",
      "enabled": true,
      "config": {}
    }
  ]
}
```

Restart the api-server; the widget definitions are merged at startup.

## Verification

- Check the logs for `[plugin-loader]` — no `Invalid manifest` or
  `Failed to load plugin`.
- `GET /api/plugin/registry` — the `fixJeShit` widget should be listed, with its
  `image` (admin thumbnail) filled in.
- In the admin panel, create a widget instance to obtain a **widget ID**. That ID
  goes into the existing TYPO3 "OpenStad" integration.

## Embedding outside OpenStad (optional)

The bundle also auto-mounts on any element with `data-fjs`:

```html
<div data-fjs data-fjs-config='{}'></div>
<script src="/path/to/fix-je-shit.iife.js"></script>
```

## Styling

All styles live inside the component, scoped to `.fjs-root`, so they never leak
into the host page. Optional overrides via CSS variables on `.fjs-root`:

- `--fjs-min-height` (default `100dvh`)
- `--fjs-card-height` (default `min(560px, calc(100dvh - 178px))`)

## Development

```bash
npm install
npm run build      # -> dist/fix-je-shit.iife.js + dist/fix-je-shit.css
```

`build.mjs` bundles `src/widget.jsx` into an IIFE with React embedded (minified,
production). `prepare` runs the build automatically on install/publish.

## Publishing

Pushing a version tag (`v*`) triggers `.github/workflows/publish.yml`, which
publishes the package to GitHub Packages. Consumers only need read access.

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

EUPL-1.2
