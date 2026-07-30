# Aanlevering — Fix je Shit plugin (voor Draad)

Alles wat nodig is om deze plugin via de Helm-chart te installeren.

| Item | Waarde |
|------|--------|
| **packageName** | `@gemeentenijmegen/fix-je-shit-plugin` |
| **version** | `1.0.0` |
| **bron / registry** | GitHub Packages — `https://npm.pkg.github.com` (scope `@gemeentenijmegen`) |
| **repository** | `GemeenteNijmegen/openstad-fix-je-shit-plugin` |
| **ENV vars** | **Geen.** Volledig client-side widget; geen backend, geen config. |
| **config** | `{}` (geen widget-config nodig) |
| **read token** | Vereist — GitHub token met scope `read:packages` (zie onder). |

## Helm `values.yaml`

```yaml
plugins:
  enabled: true
  npmrcSecret: plugin-npmrc      # secret met .npmrc (read token, zie onder)
  items:
    - name: fix-je-shit
      packageName: "@gemeentenijmegen/fix-je-shit-plugin"
      version: "1.0.0"
      enabled: true
```

## `.npmrc` voor de `npmrcSecret`

```
@gemeentenijmegen:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${READ_TOKEN}
```

```bash
kubectl create secret generic plugin-npmrc \
  --from-file=.npmrc=./.npmrc -n <namespace>
```

De init container draait dan `npm install --no-save @gemeentenijmegen/fix-je-shit-plugin@1.0.0`
en de api-server laadt het via `NODE_PATH` + `PLUGIN_JSON_OVERRIDE`.

## Read token

Wordt apart (niet via mail) aangeleverd. Minimale scope: `read:packages`.
Publicatie naar GitHub Packages gebeurt automatisch bij een versie-tag
(`.github/workflows/publish.yml`), dus jullie hebben alleen leesrechten nodig.

## Front-end bundle

De widget-bundle (`dist/fix-je-shit.iife.js`, React meegeleverd, `.fjs-root`-scoped)
wordt op dezelfde manier geserveerd als de core-widgets (`packageName` /
`directory` / `js`). Geen aparte hosting nodig als dat pad al door het platform
wordt afgehandeld — graag even verifiëren bij de eerste render.
