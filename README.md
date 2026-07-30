# Fix je Shit — OpenStad Headless plugin

Client-side widget voor jongeren die 18 worden (Gemeente Nijmegen). Een
zelf-check (swipe-quiz) voor administratieve zaken: DigiD, zorgverzekering,
zorgtoeslag, wonen, werk, donorregister en meer.

- **Type:** widget-only plugin — geen API, models of migraties. Volledig
  client-side (React, in de bundle meegeleverd).
- **Widget key:** `fixJeShit`
- **Global:** `window.OpenstadHeadlessFixJeShit.loadWidget(elementId, props)`
- **Compatibel met:** OpenStad Headless **v2.7.0+** (plugin-systeem).

## Installatie (api-server)

De plugin wordt geladen via `require()` — installeren kan **niet** via het
admin-paneel, dit is een deployment-stap.

1. **Installeer het pakket** (vanaf GitHub, met versie-tag):

   ```bash
   npm install github:GemeenteNijmegen/openstad-fix-je-shit-plugin#v1.0.0
   ```

   De `dist/`-bundle is al meegeleverd; `prepare` bouwt hem zo nodig opnieuw.

2. **Voeg toe aan `plugins.json`** (of via Helm `plugins.items`):

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

   In Kubernetes kan dit ook via `PLUGIN_JSON_OVERRIDE` /
   `OPENSTAD_PLUGINS_PATH`.

3. **Herstart de api-server** (nieuwe widget-definities worden bij startup
   samengevoegd).

## Verificatie

- Controleer de logs op `[plugin-loader]` — geen `Invalid manifest` of
  `Failed to load plugin`.
- `GET /api/plugin/registry` — of controleer dat de widget `fixJeShit`
  beschikbaar is in de widget-lijst.
- Maak in het admin-paneel een widget-instantie aan → je krijgt een **widget
  ID**. Dat ID kan in de bestaande TYPO3 "OpenStad"-koppeling.

## Embedden buiten OpenStad (optioneel)

De bundle mount ook automatisch op elk element met `data-fjs`:

```html
<div data-fjs data-fjs-config='{}'></div>
<script src="/pad/naar/fix-je-shit.iife.js"></script>
```

## Styling

Alle stijlen zitten in de component, scoped op `.fjs-root`, dus ze lekken niet
naar de hostpagina. Optionele overrides via CSS-variabelen op `.fjs-root`:

- `--fjs-min-height` (standaard `100dvh`)
- `--fjs-card-height` (standaard `min(560px, calc(100dvh - 178px))`)

## Licentie

EUPL-1.2
