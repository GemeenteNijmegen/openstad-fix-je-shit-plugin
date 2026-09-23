/*
 * Fix je Shit — widget-admin bundle.
 * Shown in the OpenStad admin as the widget's "settings" panel. The widget has
 * no settings, so this only renders an informative panel (+ plugin version).
 *
 * Contract (admin PluginComponentLoader, plugin-system.md §8):
 *   window.OpenStadPlugin_<manifest name> = { mount(container, props), unmount(container) }
 * Plain DOM, no React → no host-React version coupling.
 */
(function () {
  var PLUGIN_NAME = "fix-je-shit";
  var VERSION = typeof __FJS_VERSION__ !== "undefined" ? __FJS_VERSION__ : "";

  function mount(container) {
    if (!container) return;
    container.innerHTML = "";
    var el = document.createElement("div");
    el.setAttribute("data-fjs-admin", "1");
    el.style.cssText =
      "font:14px/1.5 system-ui,sans-serif;color:#2a2e65;padding:16px;" +
      "border:1px solid #d6d8ea;border-radius:8px;background:#f6f7fc;max-width:560px";
    el.innerHTML =
      '<strong style="display:block;font-size:16px;margin:0 0 6px">Fix je Shit</strong>' +
      '<p style="margin:0 0 8px">Deze widget heeft geen instellingen. Sla de widget op en ' +
      "plaats hem op een pagina, of gebruik het widget-ID in de TYPO3-koppeling.</p>" +
      '<p style="margin:0;color:#5b5f8a">@gemeentenijmegen/fix-je-shit-plugin' +
      (VERSION ? " v" + VERSION : "") +
      "</p>";
    container.appendChild(el);
  }

  function unmount(container) {
    if (container) container.innerHTML = "";
  }

  window["OpenStadPlugin_" + PLUGIN_NAME] = { mount: mount, unmount: unmount };
})();