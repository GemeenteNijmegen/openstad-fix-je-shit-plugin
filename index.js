/*
 * Fix je Shit — OpenStad Headless plugin manifest (widget-only: no api/models/migrations).
 * Merged into the core widget definitions via getWidgetDefinitions().
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
      // Arrays of package-root-relative paths: the core script builder does
      // js.forEach(f => fs.readFileSync(require.resolve(`${packageName}/${f}`))).
      js: ["dist/fix-je-shit.iife.js"],
      css: ["dist/fix-je-shit.css"],
      // Core loader calls window[functionName][componentName].loadWidget(id, config).
      functionName: "OpenstadHeadlessFixJeShit",
      componentName: "FixJeShit",
      // Required for the widget to appear in the admin picker (registry filter).
      adminBundle: {
        js: "dist/fix-je-shit.admin.iife.js",
        componentName: "FixJeShitAdmin",
      },
      defaultConfig: {},
      name: "Fix je Shit",
      description:
        "Zelf-check voor jongeren die 18 worden: DigiD, zorgverzekering, zorgtoeslag, wonen, werk en meer.",
      image: thumbnail,
    },
  },
};