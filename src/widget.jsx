/*
 * Fix je Shit — mount entry (dual target).
 *
 * 1) OpenStad Headless front-end contract. The core widget loader
 *    (routes/widget/widget-output.js) calls
 *      window[functionName][componentName].loadWidget(elementId, config)
 *    i.e. window.OpenstadHeadlessFixJeShit.FixJeShit.loadWidget(...), because
 *    core widgets are Vite IIFE libs whose global holds the component and the
 *    component carries a static loadWidget. Older loaders and our own embeds
 *    call window.OpenstadHeadlessFixJeShit.loadWidget(...) directly. We expose
 *    BOTH shapes so every platform version can mount us. React is bundled into
 *    the IIFE so it never conflicts with the host React version.
 *
 * 2) Standalone / TYPO3 / plain HTML auto-mount:
 *      <div data-fjs data-fjs-config='{ ... }'></div>
 */
import React from "react";
import { createRoot } from "react-dom/client";
import FixJeShit from "./FixJeShit.jsx";

// Keep one React root per host element so re-loads reuse (not stack) roots.
const roots = new WeakMap();

function resolveEl(elementIdOrNode) {
  if (!elementIdOrNode) return null;
  if (typeof elementIdOrNode === "string") {
    return document.getElementById(elementIdOrNode);
  }
  return elementIdOrNode; // already a DOM node
}

function loadWidget(elementIdOrNode, props = {}) {
  const el = resolveEl(elementIdOrNode);
  if (!el) return;

  let root = roots.get(el);
  if (!root) {
    root = createRoot(el);
    roots.set(el, root);
  }
  root.render(React.createElement(FixJeShit, props || {}));

  // NL Design System: tell the host that content has been (re)rendered.
  try {
    el.dispatchEvent(new CustomEvent("nlds:content-updated", { bubbles: true }));
  } catch (e) {
    /* CustomEvent unsupported — safe to ignore */
  }
}

function unmount(elementIdOrNode) {
  const el = resolveEl(elementIdOrNode);
  if (!el) return;
  const root = roots.get(el);
  if (root) {
    root.unmount();
    roots.delete(el);
    delete el.dataset.fjsMounted;
  }
}

// --- OpenStad Headless global ------------------------------------------------
// Static methods on the component = the core widget pattern.
FixJeShit.loadWidget = loadWidget;
FixJeShit.unmount = unmount;

if (typeof window !== "undefined") {
  window.OpenstadHeadlessFixJeShit = {
    FixJeShit, // window.OpenstadHeadlessFixJeShit.FixJeShit.loadWidget(...)  (core loader)
    loadWidget, // window.OpenstadHeadlessFixJeShit.loadWidget(...)            (direct / legacy)
    unmount,
  };
}

// --- Standalone / TYPO3 auto-mount -------------------------------------------
function autoMount() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-fjs]").forEach((node) => {
    if (node.dataset.fjsMounted === "1") return; // guard against double mount
    node.dataset.fjsMounted = "1";

    let cfg = {};
    const raw = node.getAttribute("data-fjs-config");
    if (raw) {
      try {
        cfg = JSON.parse(raw);
      } catch (e) {
        /* invalid JSON — mount with empty config */
      }
    }
    loadWidget(node, cfg);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoMount);
  } else {
    autoMount();
  }
}

export { loadWidget, unmount };
export default FixJeShit;
