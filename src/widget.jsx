import React from "react";
import { createRoot } from "react-dom/client";
import FixJeShit from "./FixJeShit.jsx";

const roots = new WeakMap();

function resolveEl(elementIdOrNode) {
  if (!elementIdOrNode) return null;
  if (typeof elementIdOrNode === "string") {
    return document.getElementById(elementIdOrNode);
  }
  return elementIdOrNode;
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

  try {
    el.dispatchEvent(
      new CustomEvent("nlds:content-updated", { bubbles: true }),
    );
  } catch (e) {}
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

if (typeof window !== "undefined") {
  window.OpenstadHeadlessFixJeShit = { FixJeShit: { loadWidget, unmount } };
}

function autoMount() {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-fjs]").forEach((node) => {
    if (node.dataset.fjsMounted === "1") return;
    node.dataset.fjsMounted = "1";

    let cfg = {};
    const raw = node.getAttribute("data-fjs-config");
    if (raw) {
      try {
        cfg = JSON.parse(raw);
      } catch (e) {}
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
