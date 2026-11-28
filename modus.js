"use strict";
// Hell, dunkel oder automatisch. Läuft vor dem Zeichnen der Seite, damit nichts aufblitzt.
const modus = {
  lies() { try { const m = localStorage.getItem("newsradar-modus"); return m === "hell" || m === "dunkel" ? m : "auto"; } catch (_) { return "auto"; } },
  dunkel() { const m = document.documentElement.dataset.modus; return m ? m === "dunkel" : matchMedia("(prefers-color-scheme: dark)").matches; },
  setze(m) {
    if (m === "hell" || m === "dunkel") document.documentElement.dataset.modus = m; else delete document.documentElement.dataset.modus;
    try { m === "auto" ? localStorage.removeItem("newsradar-modus") : localStorage.setItem("newsradar-modus", m); } catch (_) { /* privater Modus */ }
    const f = { hell: "#f1f3f4", dunkel: "#101315" };
    for (const t of document.querySelectorAll("meta[name=theme-color]")) t.content = f[m] || f[t.media.includes("dark") ? "dunkel" : "hell"];
  }
};
modus.setze(modus.lies());
