import React from "react";
import { createRoot } from "react-dom/client";

const roots = new WeakMap();

function FixJeShitAdmin() {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: 8,
        padding: 24,
        color: "#2A2E65",
        fontFamily:
          "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>Fix je Shit</h2>
      <p style={{ margin: 0, color: "#5b5b72", lineHeight: 1.5 }}>
        Geen instellingen nodig. Ga naar het tabblad Publiceren om de widget te
        plaatsen.
      </p>
    </div>
  );
}

function mount(container, props = {}) {
  if (!container) return;
  let root = roots.get(container);
  if (!root) {
    root = createRoot(container);
    roots.set(container, root);
  }
  root.render(React.createElement(FixJeShitAdmin, props || {}));
}

function unmount(container) {
  if (!container) return;
  const root = roots.get(container);
  if (root) {
    root.unmount();
    roots.delete(container);
  }
}

if (typeof window !== "undefined") {
  window["OpenStadPlugin_fix-je-shit"] = { mount, unmount, FixJeShitAdmin };
}

export { mount, unmount, FixJeShitAdmin };
