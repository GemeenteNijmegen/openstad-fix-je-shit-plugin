const { version } = require("./package.json");
const thumbnail = require("./thumbnail");

module.exports = {
  name: "fix-je-shit",
  version,
  widgets: {
    fixJeShit: {
      packageName: "@gemeentenijmegen/fix-je-shit-plugin",
      directory: "dist",
      js: ["dist/fix-je-shit.iife.js"],
      css: ["dist/fix-je-shit.css"],
      functionName: "OpenstadHeadlessFixJeShit",
      componentName: "FixJeShit",
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
