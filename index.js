/*
 * Fix je Shit — OpenStad Headless plugin manifest.
 *
 * Widget-only plugin: no api / models / migrations (fully client-side).
 * The loader reads `module.exports` (or `.manifest`) and merges `widgets`
 * into the core widget definitions via getWidgetDefinitions().
 */
const { version } = require("./package.json");
const thumbnail = require("./thumbnail"); // data-URI admin thumbnail

module.exports = {
  name: "fix-je-shit",
  version,
  widgets: {
    // Widget key — must be unique vs. core & other plugins (core wins on conflict).
    fixJeShit: {
      packageName: "@gemeentenijmegen/fix-je-shit-plugin",
      directory: "dist",
      js: "fix-je-shit.iife.js",
      css: "fix-je-shit.css",
      // Global set by the IIFE: window.OpenstadHeadlessFixJeShit.loadWidget(...)
      functionName: "OpenstadHeadlessFixJeShit",
      componentName: "FixJeShit",
      defaultConfig: {},
      name: "Fix je Shit",
      description:
        "Zelf-check voor jongeren die 18 worden: DigiD, zorgverzekering, zorgtoeslag, wonen, werk en meer.",
      image: thumbnail,
    },
  },
};
