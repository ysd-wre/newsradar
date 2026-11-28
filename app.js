"use strict";
const RESSORTS = ["Politik", "Welt", "Wirtschaft", "Technik", "Wissen", "Sport", "Kultur", "Panorama"];
const $ = id => document.getElementById(id);
const ZEILEN = "Schlagzeilen", NEU = "Neueste", HEISS = "Heiß heute", MERK = "Gemerkt", FOLGEN = "Folgen", VIDEOS = "Videos";
let daten = null, ressort = "", geladen = 0, offline = false, schluessel = null, paket = null;

function el(name, klasse, text) {
  const e = document.createElement(name);
  if (klasse) e.className = klasse;
  if (text != null) e.textContent = text;
  return e;
}
function wann(iso) {
  const m = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  if (m < 1440) return `vor ${Math.floor(m / 60)} Std.`;
  return m < 2880 ? "gestern" : `vor ${Math.floor(m / 1440)} Tagen`;
}
function kopfzeile(a, zeit = a.zeit) {
  const z = el("div", "zeile"), b = el("span", "balken");
  const an = Math.max(1, [2, 3, 4, 6, 9].filter(x => a.signal >= x).length);
  for (let i = 0; i < 5; i++) b.append(el("i", i < an ? "" : "aus"));
  b.setAttribute("role", "img");
  b.setAttribute("aria-label", `${a.signal} unabhängige Berichte`);
  b.title = `${a.signal} unabhängige Berichte`;
  const r = el("b", "ressort", a.ressort);
  r.dataset.r = a.ressort;
  z.append(b, r, el("span", "", wann(zeit)));
  if (istGemerkt(a.id)) z.append(el("span", "fahne", "Gemerkt"));
  if (istNeu(a)) z.append(el("span", "neu", "Neu"));
  return z;
}
function medien(a) { return [...new Set(a.meldungen.map(m => m.q))]; }
function quellentext(a) {
  const n = medien(a);
  return n.slice(0, 3).join(", ") + (n.length > 3 ? ` und ${n.length - 3} weitere` : "");
}
function meldungsliste(liste) {
  const u = el("ul", "meldungen");
  for (const m of liste) {
    if (!/^https?:\/\//.test(m.l)) continue;
    const li = el("li"), v = el("a"), t = el("span", "mtext");
    v.href = m.l; v.target = "_blank"; v.rel = "noopener noreferrer";
    t.append(el("span", "mtitel", m.t));
    if (m.a) t.append(el("span", "manriss", m.a));
    v.append(el("b", "", m.q), t, el("time", "", m.z ? wann(m.z) : "aktuell"));
    li.append(v); u.append(li);
  }
  return u;
}
// --- Gelesen, neu und gemerkt: bleibt nur auf diesem Gerät ---
const ablage = {
  lies(n, sonst) { try { return JSON.parse(localStorage.getItem("newsradar-" + n)) ?? sonst; } catch (_) { return sonst; } },
  setze(n, w) { try { localStorage.setItem("newsradar-" + n, JSON.stringify(w)); return true; } catch (_) { return false; } },
  loesche() { for (const n of ["gelesen", "besuch", "gemerkt"]) try { localStorage.removeItem("newsradar-" + n); } catch (_) { /* privater Modus */ } gelesen = []; gemerkt = []; besuch = null; }
};
let gelesen = ablage.lies("gelesen", []), gemerkt = ablage.lies("gemerkt", []), besuch = ablage.lies("besuch", null);
const istGelesen = id => gelesen.includes(id), istGemerkt = id => gemerkt.some(a => a.id === id);
const istNeu = a => !!besuch && besuch.neu.includes(a.id) && !istGelesen(a.id);
function lese(id) { if (!istGelesen(id)) { gelesen = [id, ...gelesen].slice(0, 400); ablage.setze("gelesen", gelesen); } }
function kennung(t) { let h = 0; for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
// Neu ist, was beim letzten Besuch noch nicht da war. Auch die Links zählen, weil der Roboter andere Nummern vergibt als der Mac.
function zaehleBesuch(artikel, jetzt = Date.now()) {
  const spuren = a => [a.id, ...a.meldungen.map(m => kennung(m.l))];
  if (!besuch) besuch = { kennt: [], neu: [], zeit: jetzt, erster: true };
  else if (jetzt - besuch.zeit > 30 * 60000) { besuch.neu = []; besuch.erster = false; }
  const kennt = new Set(besuch.kennt);
  if (!besuch.erster) for (const a of artikel) if (!besuch.neu.includes(a.id) && !spuren(a).some(s => kennt.has(s))) besuch.neu.push(a.id);
  besuch.kennt = artikel.flatMap(spuren);
  besuch.zeit = jetzt;
  ablage.setze("besuch", besuch);
}
function merke(a) {
  const vorher = gemerkt;
  gemerkt = istGemerkt(a.id) ? gemerkt.filter(x => x.id !== a.id) : [a, ...gemerkt];
  if (!ablage.setze("gemerkt", gemerkt)) { gemerkt = vorher; return false; }
  return true;
}
// --- Ausblenden: gilt nur auf diesem Gerät. Ein Wort zählt auch als Wortanfang. Ebenso in Quellcode/Wahl.swift. ---
const weg = { ressorts: [], woerter: [], ...ablage.lies("ausblenden", {}) };
function muster(w) { return new RegExp("(?:^|[^\\p{L}\\p{N}])" + w.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&"), "iu"); }
let wegmuster = weg.woerter.map(muster);
const textWeg = t => wegmuster.some(m => m.test(t));
const istWeg = a => weg.ressorts.includes(a.ressort) || textWeg([a.titel, ...a.absaetze].join(" "));
const sichtbare = () => daten.artikel.filter(a => !istWeg(a));
const sichtbarHeiss = () => heiss({ stand: daten.stand, artikel: sichtbare() });
function wegHinweis() {
  const n = daten.artikel.length - sichtbare().length;
  if (!n) return "";
  const p = el("p", "weg", n === 1 ? "1 Meldung ausgeblendet. " : `${n} Meldungen ausgeblendet. `), k = el("button", "", "Ändern");
  k.type = "button"; k.onclick = oeffneEinstellungen; p.append(k);
  return p;
}
// Der erste Satz. Punkte nach Zahlen und Abkürzungen zählen nicht als Satzende. Ebenso in Quellcode/Extras.swift.
function satz(t) {
  const ende = /[.!?][“”"«»]?(?=\s|$)/g;
  for (let m; (m = ende.exec(t));) {
    if (t[m.index] === "." && /(?:\d|(?:^|[\s(„])(?:\p{L}|Dr|St|Mio|Mrd|Prof|bzw|ca|Nr|Std|Min))$/u.test(t.slice(0, m.index))) continue;
    return t.slice(0, m.index + m[0].length);
  }
  return t;
}
const kurzsatz = a => a.absaetze.length ? satz(a.absaetze[0]) : a.titel;
function saetze(t) {
  const l = [];
  for (let rest = t.trim(); rest;) { const x = satz(rest); l.push(x.trim()); rest = rest.slice(x.length).trim(); }
  return l;
}
// --- Vorlesen ---
let liest = null;
function zeigeVorlesen() { for (const b of document.querySelectorAll(".vorlesen")) b.lastChild.textContent = liest && liest.was === b.dataset.was ? "Stopp" : "Vorlesen"; }
function schweige() {
  if (!liest) return;
  liest = null;
  speechSynthesis.cancel();
  zeigeVorlesen();
}
function vorlesen(was, texte) {
  schweige();
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
  const lauf = liest = { was }, stimme = speechSynthesis.getVoices().find(v => /^de/i.test(v.lang));
  // Die Sätze bleiben in „lauf“ liegen, sonst räumt mancher Browser sie vor dem Ende weg.
  lauf.saetze = texte.map((t, i) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = "de-DE"; if (stimme) u.voice = stimme;
    u.onerror = () => { if (liest === lauf) schweige(); };
    if (i === texte.length - 1) u.onend = () => { if (liest === lauf) { liest = null; zeigeVorlesen(); } };
    return u;
  });
  for (const u of lauf.saetze) speechSynthesis.speak(u);
  zeigeVorlesen();
}
function vorleseknopf(was, texte) {
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return "";
  const v = el("button", "knopf vorlesen");
  v.type = "button"; v.dataset.was = was;
  v.append(zeichen("M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"), el("span", "", liest && liest.was === was ? "Stopp" : "Vorlesen"));
  v.onclick = () => { if (liest && liest.was === was) schweige(); else vorlesen(was, texte()); };
  return v;
}
// Mit KI-Text den ganzen Text, sonst die fünf neuesten Schlagzeilen. Ebenso in Quellcode/Extras.swift.
function vorlesetext(a) {
  return a.absaetze.length ? [a.titel, ...a.absaetze.flatMap(saetze)] : [a.titel, "Das berichten die Medien.", ...a.meldungen.slice(0, 5).map(m => `${m.q}: ${m.t}`)];
}
addEventListener("pagehide", () => schweige());
// --- Teilen ---
// Quellen ohne Bezahlschranke zuerst, damit der Link möglichst bei allen aufgeht.
const FREI = ["Tagesschau", "ZDFheute", "Deutschlandfunk", "ORF", "SRF", "Deutsche Welle", "Sportschau", "n-tv", "taz", "Der Standard", "kicker"];
function original(a) {
  const l = a.meldungen.filter(m => /^https?:\/\//.test(m.l));
  return FREI.map(q => l.find(m => m.q === q)).find(Boolean) || l[0];
}
function teiltext(a) {
  const o = original(a), t = [a.titel];
  if (a.absaetze.length) t.push(satz(a.absaetze[0]) + "\n(Kurztext von einer KI, kann Fehler enthalten)");
  if (o) t.push(`Original bei ${o.q}: ${o.l}`);
  if (daten.artikel.includes(a)) t.push(`In NewsRadar, mit Passwort: ${location.origin}${location.pathname}#${a.id}`);
  return t.join("\n\n");
}
// --- Das Wichtigste in 1 Minute ---
function kurzueberblick() {
  const l = sichtbarHeiss().slice(0, 5);
  if (l.length < 3) return null;
  const k = el("section", "kurz"), kopf = el("div", "kurzkopf"), o = el("ol");
  kopf.append(el("h2", "", "Das Wichtigste in 1 Minute"));
  kopf.append(vorleseknopf("kurz", () => ["Das Wichtigste.", ...l.map(h => kurzsatz(h.a))]));
  l.forEach((h, i) => {
    const li = el("li"), v = el("a"), n = el("b", "", i + 1);
    n.dataset.r = h.a.ressort; v.href = "#" + h.a.id;
    v.append(n, el("span", "", kurzsatz(h.a))); li.append(v); o.append(li);
  });
  k.append(kopf, o);
  return k;
}
// Worüber in den letzten 24 Stunden am meisten berichtet wird. Dieselbe Rechnung steht in Quellcode/Heiss.swift.
function heiss(d) {
  const jetzt = new Date(d.stand), je = {}, std = t => (jetzt - new Date(t)) / 3600000;
  return d.artikel.map(a => {
    const alter = Math.max(0, std(a.zeit)), tag = new Set(), frisch = new Set();
    for (const m of a.meldungen) {
      if (!m.z || std(m.z) <= 24) tag.add(m.q);
      if (m.z && std(m.z) <= 3) frisch.add(m.q);
    }
    const breite = Math.min(a.signal, tag.size);
    return { a, alter, breite, redaktionen: tag.size, frisch: frisch.size, hitze: (breite + Math.min(frisch.size, breite)) * 0.5 ** (alter / 24) };
  }).filter(h => h.alter <= 24 && h.breite >= 3)
    .sort((x, y) => y.hitze - x.hitze || (x.a.id < y.a.id ? -1 : 1))
    .filter(h => (je[h.a.ressort] = (je[h.a.ressort] || 0) + 1) <= 3)
    .slice(0, 10);
}
// Redaktionen je Stunde, die letzten 24 Stunden. Der Mac schickt sie mit; beim Roboter wird aus den 25 neuesten Berichten gerechnet. Ebenso in Quellcode/Online.swift und Kurve.swift.
function kurvenwerte(a) {
  if (Array.isArray(a.kurve) && a.kurve.length === 24) return a.kurve;
  const jetzt = new Date(daten.stand), st = Array.from({ length: 24 }, () => new Set());
  for (const m of a.meldungen) {
    if (!m.z) continue;
    const h = Math.max(0, Math.floor((jetzt - new Date(m.z)) / 3600000));
    if (h < 24) st[23 - h].add(m.q);
  }
  return st.map(s => s.size);
}
function kurventext(w) {
  const m = Math.max(...w), h = 23 - w.lastIndexOf(m);
  return `Am meisten los: ${m === 1 ? "1 Redaktion" : `${m} Redaktionen`} in einer Stunde, ${h === 0 ? "in der letzten Stunde" : `vor etwa ${h} Std.`}`;
}
function kurve(a, gross) {
  if (!daten.artikel.includes(a)) return "";
  const w = kurvenwerte(a), spitze = Math.max(...w), k = el("div", "kurve" + (gross ? " grosse" : "")), b = el("div", "stunden"), u = el("div", "achse");
  if (w.reduce((x, y) => x + y, 0) < 3) return "";
  w.forEach((n, i) => { const s = el("i", n ? (i < 21 ? "alt" : "") : "null"); if (n) s.style.height = Math.max(13, 100 * n / spitze) + "%"; b.append(s); });
  b.dataset.r = a.ressort; b.setAttribute("role", "img"); b.setAttribute("aria-label", kurventext(w)); b.title = kurventext(w);
  u.append(el("span", "", "24 Std."), el("span", "", "jetzt"));
  if (gross) k.append(el("h2", "", "Redaktionen pro Stunde"));
  k.append(b, u);
  if (gross) k.append(el("p", "hinweis", kurventext(w).replace(/\.?$/, ".")));
  return k;
}
function passt(a, s) {
  return !s || [a.titel, ...a.absaetze, ...a.meldungen.map(m => m.q + " " + m.t)].join(" ").toLowerCase().includes(s);
}
function heissliste(s) {
  const l = sichtbarHeiss().map((h, i) => ({ ...h, platz: i + 1 })).filter(h => passt(h.a, s));
  if (!l.length) return el("p", "leer", s ? `Kein heißes Thema zu „${$("suche").value.trim()}“.` : "Gerade gibt es kein heißes Thema.");
  const f = document.createDocumentFragment(), o = el("ol", "heiss");
  for (const h of l) {
    const li = el("li"), k = el("a", "karte" + (h.platz === 1 ? " erster" : "") + (istGelesen(h.a.id) ? " gelesen" : "")), t = el("div", "heisstext"), n = el("span", "platz", h.platz);
    k.href = "#" + h.a.id;
    t.append(kopfzeile(h.a), el("h2", "", h.a.titel));
    if (h.a.absaetze.length) t.append(el("p", "", h.a.absaetze[0]));
    t.append(kurve(h.a));
    t.append(el("p", "quellen", `${h.redaktionen} Redaktionen` + (h.frisch ? `, ${h.frisch} davon in den letzten 3 Std.` : " in 24 Std.")));
    k.append(n, t); li.append(k); o.append(li);
  }
  f.append(el("p", "einleitung", "Darüber berichten gerade die meisten Redaktionen. Letzte 24 Stunden."), o);
  return f;
}
// --- Neueste: jedes Thema nur einmal, das Neueste oben ---
// Die Uhrzeit (zweite Redaktion dabei) schickt der Mac als „neu“ mit, doppelte Themen haben keine. Fehlt sie überall, kommt der Stand vom alten Roboter; dann rechnet die App selbst.
function neueste() {
  const mitMac = daten.artikel.some(a => a.neu), stand = new Date(daten.stand);
  return sichtbare().map(a => ({ a, zeit: new Date((mitMac ? a.neu : (verlaufsliste(a)[1] || {}).z) || NaN) }))
    .filter(n => stand - n.zeit < 86400000 && stand - n.zeit > -600000)
    .sort((x, y) => y.zeit - x.zeit || (x.a.id < y.a.id ? -1 : 1));
}
function neuesteliste(s) {
  const l = neueste().filter(n => passt(n.a, s)), gruppen = [[1, "Letzte Stunde"], [3, "Letzte 3 Stunden"], [6, "Letzte 6 Stunden"], [12, "Letzte 12 Stunden"], [25, "Letzte 24 Stunden"], [Infinity, "Früher"]];
  if (!l.length) return el("p", "leer", s ? `Nichts Neues zu „${$("suche").value.trim()}“.` : "Gerade gibt es nichts Neues.");
  const f = document.createDocumentFragment();
  f.append(el("p", "einleitung", "Jedes Thema nur einmal, das Neueste oben. Nur was mehrere Redaktionen berichten."));
  let name = "", o = null;
  for (const { a, zeit } of l) {
    const g = gruppen.find(([std]) => Date.now() - zeit < std * 3600000)[1];
    if (g !== name) { name = g; o = el("ol", "neueste"); f.append(el("h2", "zwischen", g), o); }
    const li = el("li"), k = el("a", "karte" + (istGelesen(a.id) ? " gelesen" : ""));
    k.href = "#" + a.id;
    k.append(kopfzeile(a, zeit), el("h2", "", a.titel), el("p", "quellen", quellentext(a)));
    li.append(k); o.append(li);
  }
  f.append(wegHinweis());
  return f;
}
// --- Folgen: eigene Wörter, nur auf diesem Gerät. Zeigt immer alles, auch was sonst ausgeblendet ist. ---
let folgen = ablage.lies("folgen", []), folgeWahl = "", folgeText = "";
// Passt, wenn das Wort in Titel oder Text steht oder in mindestens jeder vierten Schlagzeile des Themas.
function folgtreffer(w) {
  const r = muster(w);
  return daten.artikel.filter(a => {
    if (r.test([a.titel, ...a.absaetze].join(" "))) return true;
    const n = a.meldungen.filter(m => r.test(m.t)).length;
    return n > 0 && n * 4 >= a.meldungen.length;
  });
}
function setzeFolgen(l) { folgen = l; if (!folgen.includes(folgeWahl)) folgeWahl = ""; ablage.setze("folgen", folgen); zeige(false); }
function folgeform() {
  const f = el("form", "wortform folgeform"), i = el("input"), k = el("button", "knopf voll", "Folgen");
  i.type = "text"; i.id = "folgewort"; i.maxLength = 40; i.placeholder = "z. B. Brasilien oder FC Bayern"; i.autocomplete = "off"; i.value = folgeText;
  i.setAttribute("aria-label", "Wort, dem du folgen willst");
  i.oninput = () => { folgeText = i.value; };
  f.onsubmit = e => {
    e.preventDefault();
    const w = i.value.trim().replace(/\s+/g, " "), schon = folgen.find(x => x.toLowerCase() === w.toLowerCase());
    if (w.length < 2) return;
    folgeText = ""; i.blur();
    if (schon) { folgeWahl = schon; zeige(false); return; }
    folgeWahl = w;
    setzeFolgen([...folgen, w].slice(-30));
  };
  f.append(i, k);
  return f;
}
function folgenliste(s) {
  const f = document.createDocumentFragment(), je = new Map(folgen.map(w => [w, folgtreffer(w)])), u = el("ul", "folgechips");
  f.append(folgeform());
  if (!folgen.length) { f.append(el("p", "leer", "Du folgst noch nichts. Gib oben ein Wort ein, zum Beispiel deinen Verein, eine Stadt oder ein Land.")); return f; }
  const zeilen = w => { const r = muster(w), drin = new Set(je.get(w).flatMap(a => a.meldungen.map(m => m.l))); return daten.schlagzeilen.filter(m => r.test(m.t) && !drin.has(m.l)); };
  const chip = (wert, text) => {
    const li = el("li", wert === folgeWahl ? "an" : ""), b = el("button", "", text);
    b.type = "button"; b.setAttribute("aria-pressed", String(wert === folgeWahl)); b.onclick = () => { folgeWahl = wert; zeige(false); };
    li.append(b);
    if (wert) {
      const x = el("button", "zu", "×");
      x.type = "button"; x.setAttribute("aria-label", `${wert} nicht mehr folgen`); x.onclick = () => setzeFolgen(folgen.filter(y => y !== wert));
      li.append(x);
    }
    return li;
  };
  if (folgen.length > 1) u.append(chip("", "Alle"));
  else folgeWahl = folgen[0];
  for (const w of folgen) u.append(chip(w, `${w} (${je.get(w).length + zeilen(w).length})`));
  f.append(u);
  const aktiv = folgeWahl ? [folgeWahl] : folgen, links = new Set();
  const artikel = daten.artikel.filter(a => aktiv.some(w => je.get(w).includes(a)) && passt(a, s)).sort((x, y) => new Date(y.zeit) - new Date(x.zeit));
  for (const a of artikel) for (const m of a.meldungen) links.add(m.l);
  const einzeln = daten.schlagzeilen.filter(m => !links.has(m.l) && aktiv.some(w => muster(w).test(m.t)) && (!s || (m.t + " " + m.q).toLowerCase().includes(s)));
  if (artikel.length) f.append(karten(artikel, false));
  if (einzeln.length) { const k = el("div", "blatt"); k.append(meldungsliste(einzeln)); f.append(el("h2", "zwischen", "Einzelne Schlagzeilen"), k); }
  if (!artikel.length && !einzeln.length) f.append(el("p", "leer", s ? `Nichts zu „${$("suche").value.trim()}“.` : `Zu ${folgeWahl ? `„${folgeWahl}“` : "deinen Wörtern"} gibt es gerade nichts. Sobald eine Redaktion darüber berichtet, steht es hier.`));
  f.append(el("p", "weg", `Gesucht wird in ${daten.artikel.length} Meldungen und ${daten.schlagzeilen.length} Schlagzeilen. Deine Wörter bleiben auf diesem Gerät.`));
  return f;
}
function karten(l, erstegross) {
  const g = el("div", "gitter");
  l.forEach((a, i) => {
    const k = el("a", "karte" + (i === 0 && erstegross ? " gross" : "") + (istGelesen(a.id) ? " gelesen" : ""));
    k.href = "#" + a.id;
    k.append(kopfzeile(a), el("h2", "", a.titel), a.absaetze.length ? el("p", "", a.absaetze[0]) : el("p", "ueberblick", `Überblick: Das berichten ${medien(a).length} Medien`), el("p", "quellen", quellentext(a)));
    g.append(k);
  });
  return g;
}
// --- Videos: eigene Videos vom Mac, verschlüsselt wie die Meldungen. Das Neueste oben. ---
let filme = [], spielt = null;
const bilder = new Map();
function spielzeit(s) { const t = Math.round(s || 0); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`; }
function bildVon(v) {
  if (!bilder.has(v.id)) bilder.set(v.id, holeGeheim(`videos/${v.id}.bild`).then(r => URL.createObjectURL(new Blob([r], { type: "image/jpeg" }))).catch(() => { bilder.delete(v.id); return null; }));
  return bilder.get(v.id);
}
async function zeigeBild(v, box) {
  const u = await bildVon(v);
  if (!u) return;
  const i = el("img"); i.alt = ""; i.src = u; box.prepend(i);
}
function videoliste(s) {
  if (!filme.length) return el("p", "leer", "Noch keine Videos.");
  const l = filme.filter(v => !s || v.t.toLowerCase().includes(s));
  if (!l.length) return el("p", "leer", `Kein Video zu „${$("suche").value.trim()}“.`);
  const g = el("div", "gitter filme");
  for (const v of l) {
    const k = el("button", "karte film"), b = el("div", "bild");
    k.type = "button"; k.onclick = () => spiele(v);
    k.setAttribute("aria-label", `${v.t}, ${spielzeit(v.d)} Minuten, abspielen`);
    if (v.b > 0 && v.h > 0) b.style.aspectRatio = `${v.b} / ${v.h}`;
    b.append(el("span", "dauer", spielzeit(v.d)));
    k.append(b, el("h2", "", v.t), el("p", "quellen", wann(v.z)));
    zeigeBild(v, b);
    g.append(k);
  }
  return g;
}
const spieler = el("dialog");
spieler.id = "spieler"; spieler.setAttribute("aria-label", "Video");
function raeumeSpielerAuf() {
  const l = spielt;
  spielt = null;
  for (const f of spieler.querySelectorAll("video")) { f.pause(); f.removeAttribute("src"); f.load(); }
  spieler.replaceChildren();
  if (l && l.url) URL.revokeObjectURL(l.url);
}
// Das Video kommt ganz, wird im Gerät entschlüsselt und dann abgespielt.
async function spiele(v) {
  schweige();
  raeumeSpielerAuf();
  const lauf = spielt = {}, m = el("p", "hinweis", "Video wird geladen …"), z = el("button", "knopf", "Schließen");
  z.type = "button"; z.onclick = () => spieler.close();
  spieler.replaceChildren(el("h2", "", v.t), m, z);
  if (!spieler.open) spieler.showModal();
  try {
    const roh = await holeGeheim(`videos/${v.id}.film`, a => { if (spielt === lauf) m.textContent = `Video wird geladen … ${Math.min(99, Math.round(a * 100))} %`; });
    if (spielt !== lauf) return;
    lauf.url = URL.createObjectURL(new Blob([roh], { type: "video/mp4" }));
    const f = el("video");
    f.controls = true; f.playsInline = true; f.preload = "auto"; f.src = lauf.url;
    m.replaceWith(f);
    f.play().catch(() => { /* manche Browser starten erst nach Antippen */ });
  } catch (_) {
    if (spielt === lauf) m.textContent = offline ? "Ohne Internet lassen sich Videos nicht laden." : "Das Video ließ sich nicht laden. Versuch es gleich noch einmal.";
  }
}
// Das Ereignis kommt etwas später; ist inzwischen schon das nächste Video offen, bleibt es.
spieler.addEventListener("close", () => { if (!spieler.open) raeumeSpielerAuf(); });
function liste() {
  const s = $("suche").value.trim().toLowerCase();
  if (ressort === VIDEOS) return videoliste(s);
  if (ressort === HEISS) return heissliste(s);
  if (ressort === NEU) return neuesteliste(s);
  if (ressort === FOLGEN) return folgenliste(s);
  const merkliste = ressort === MERK;
  if (ressort === ZEILEN) {
    const z = daten.schlagzeilen.filter(m => !textWeg(m.t) && (!s || (m.t + " " + m.q).toLowerCase().includes(s)));
    if (!z.length) return el("p", "leer", "Keine Schlagzeile gefunden.");
    const k = el("div", "blatt"); k.append(meldungsliste(z)); return k;
  }
  const treffer = merkliste ? gemerkt.filter(a => passt(a, s)) : sichtbare().filter(a => (!ressort || a.ressort === ressort) && passt(a, s));
  if (merkliste && !treffer.length && !s) return el("p", "leer", "Noch nichts gemerkt. Öffne eine Meldung und tippe auf „Merken“. Gemerktes bleibt auf diesem Gerät, auch wenn die Meldung sonst verschwindet.");
  if (!treffer.length && !s && !ressort && daten.artikel.length) { const f = document.createDocumentFragment(); f.append(el("p", "leer", "Alles ist ausgeblendet."), wegHinweis()); return f; }
  if (!treffer.length) return el("p", "leer", s ? `Keine Meldung zu „${$("suche").value.trim()}“.` : "In diesem Ressort gibt es gerade keine Meldungen.");
  const g = karten(treffer, !s && !merkliste);
  if (ressort || s) return g;
  const f = document.createDocumentFragment(), neu = sichtbare().filter(istNeu).length, kurz = kurzueberblick();
  if (neu) f.append(el("p", "seitdem", neu === 1 ? "1 neue Meldung seit deinem letzten Besuch" : `${neu} neue Meldungen seit deinem letzten Besuch`));
  if (kurz) f.append(kurz);
  f.append(g, wegHinweis());
  return f;
}
// Der erste Bericht jeder Redaktion, älteste zuerst. Nur mit sicherer Uhrzeit. Ebenso in Quellcode/Wahl.swift.
function verlaufsliste(a) {
  const gesehen = new Set();
  return a.meldungen.filter(m => m.z && /^https?:\/\//.test(m.l)).sort((x, y) => new Date(x.z) - new Date(y.z)).filter(m => !gesehen.has(m.q) && gesehen.add(m.q));
}
function verlauf(a) {
  const l = verlaufsliste(a);
  if (l.length < 3) return null;
  const uhr = z => new Date(z).toLocaleString("de", { weekday: "short", hour: "2-digit", minute: "2-digit" }) + " Uhr";
  const d = el("details", "verlauf"), o = el("ol"), n = l.slice(1).filter(m => new Date(m.z) - new Date(l[0].z) <= 3 * 3600000).length;
  d.append(el("summary", "", "So lief die Geschichte"), el("p", "hinweis", `Frühester Bericht hier: ${l[0].q}, ${uhr(l[0].z)}.` + (n ? ` In den 3 Stunden danach ${n === 1 ? "kam 1 Redaktion" : `kamen ${n} Redaktionen`} dazu.` : "")));
  for (const m of l) {
    const li = el("li"), v = el("a", "", m.t), kopf = el("div");
    v.href = m.l; v.target = "_blank"; v.rel = "noopener noreferrer";
    kopf.append(el("b", "", m.q), el("time", "", uhr(m.z)));
    li.append(kopf, v); o.append(li);
  }
  o.dataset.r = a.ressort;
  d.append(o);
  return d;
}
function artikel(a) {
  const f = document.createDocumentFragment(), l = el("div", "leiste"), k = el("article", "artikel");
  const z = el("button", "knopf", "Zurück"), t = el("button", "knopf", "Teilen"), b = el("button", "knopf"), rechts = el("div", "rechts");
  const zeigeMerken = () => { b.textContent = istGemerkt(a.id) ? "Gemerkt ✓" : "Merken"; b.setAttribute("aria-pressed", String(istGemerkt(a.id))); };
  b.onclick = () => { if (merke(a)) { zeigeMerken(); navigation(); } else b.textContent = "Kein Platz auf dem Gerät"; };
  zeigeMerken();
  z.onclick = () => { location.hash = ""; };
  t.onclick = async () => {
    try {
      if (navigator.share) return await navigator.share({ title: a.titel, text: teiltext(a) });
      await navigator.clipboard.writeText(teiltext(a));
      t.textContent = "Text kopiert"; setTimeout(() => { t.textContent = "Teilen"; }, 1800);
    } catch (_) { /* Teilen abgebrochen */ }
  };
  rechts.append(b, t);
  l.append(z, rechts);
  k.append(kopfzeile(a), el("h1", "", a.titel), vorleseknopf(a.id, () => vorlesetext(a)), ...a.absaetze.map(p => el("p", "", p)));
  const zeit = new Date(a.geschrieben).toLocaleString("de", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  k.append(el("p", "hinweis", a.absaetze.length
    ? `Mit KI geschrieben am ${zeit}. Kann Fehler enthalten – im Zweifel gilt das Original.`
    : "Zu diesem Thema gibt es gerade keinen eigenen Text. Hier siehst du, was die Medien berichten."));
  k.append(kurve(a, true));
  const v = verlauf(a);
  if (v) k.append(v);
  k.append(el("h2", "", `Das berichten ${medien(a).length} Medien`), meldungsliste(a.meldungen));
  f.append(l, k);
  return f;
}
function zeige(nachOben) {
  if (!daten) return;
  let id = location.hash.slice(1);
  try { id = decodeURIComponent(id); } catch (_) { /* kaputter Link: dann eben „nicht mehr verfügbar“ */ }
  const a = id && (daten.artikel.find(x => x.id === id) || gemerkt.find(x => x.id === id));
  let inhalt;
  if (a) { lese(a.id); inhalt = artikel(a); }
  else if (id) {
    inhalt = el("div", "leer");
    const k = el("button", "knopf", "Alle Meldungen ansehen");
    k.onclick = () => { location.hash = ""; };
    inhalt.append(el("p", "", "Diese Meldung ist nicht mehr verfügbar."), k);
  } else inhalt = liste();
  $("inhalt").replaceChildren(inhalt);
  document.title = a ? `${a.titel} – NewsRadar` : "NewsRadar";
  $("stand").textContent = (offline ? "Keine Verbindung. Gespeicherter Stand: " : "Aktualisiert ") + wann(daten.stand).replace(/\.$/, "") + ".";
  if (nachOben) { scrollTo(0, 0); if (a) $("inhalt").focus({ preventScroll: true }); }
}
function navigation() {
  const da = RESSORTS.filter(r => !weg.ressorts.includes(r) && daten.artikel.some(a => a.ressort === r));
  if (ressort && ![NEU, ZEILEN, HEISS, VIDEOS, FOLGEN, MERK].includes(ressort) && !da.includes(ressort)) ressort = "";
  $("ressorts").replaceChildren(...["", NEU, HEISS, ...(filme.length || ressort === VIDEOS ? [VIDEOS] : []), FOLGEN, MERK, ...da, ZEILEN].map(r => {
    const b = el("button", "", r === MERK && gemerkt.length ? `${MERK} (${gemerkt.length})` : r || "Alle");
    if (da.includes(r)) b.dataset.r = r;
    if (r === HEISS || r === VIDEOS || r === FOLGEN || r === MERK) b.className = "obenweg";
    b.setAttribute("aria-pressed", String(r === ressort));
    b.onclick = () => { schweige(); sucheZu(); ressort = r; navigation(); if (location.hash) location.hash = ""; else zeige(true); };
    return b;
  }));
  zeigeUnten();
}
// --- Als App installieren ---
let einladung = null;
const istInstalliert = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); einladung = e; });
addEventListener("appinstalled", () => { einladung = null; $("appleiste").hidden = true; if ($("installieren2")) $("installieren2").hidden = true; });
function schritte() {
  const u = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return [
    "Öffne diese Seite in Safari.",
    "Tippe auf „Teilen“ (Viereck mit Pfeil nach oben). Siehst du es nicht, tippe zuerst auf „…“.",
    "Wähle „Zum Home-Bildschirm“ und dann „Hinzufügen“."];
  if (/Android/.test(u)) return [
    "Öffne diese Seite in Chrome.",
    "Tippe oben rechts auf die drei Punkte.",
    "Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“."];
  if (/Firefox/.test(u)) return ["Öffne diese Seite in Chrome, Edge oder (am Mac) in Safari.", "Klicke dort noch einmal auf „App herunterladen“."];
  if (/Macintosh/.test(u) && !/Chrome|Edg/.test(u)) return ["Klicke oben in der Menüleiste auf „Ablage“.", "Wähle „Zum Dock hinzufügen“ und dann „Hinzufügen“."];
  return ["Öffne das Menü des Browsers (drei Punkte oben rechts).", "Wähle „Seite als App installieren“. In manchen Browsern steht es unter „Streamen, speichern und teilen“ oder „Apps“."];
}
async function installiere() {
  if (einladung) {
    const e = einladung; einladung = null;
    try { await e.prompt(); return; } catch (_) { /* dann die Anleitung zeigen */ }
  }
  const d = $("anleitung"), t = el("h2", "", "NewsRadar installieren"), o = el("ol"), z = el("button", "knopf voll", "Verstanden");
  t.id = "anleitungtitel"; z.onclick = () => d.close();
  o.append(...schritte().map(s => el("li", "", s)));
  d.replaceChildren(t, o, el("p", "", "Öffne danach die App und gib dort einmal das Passwort ein."), z);
  d.showModal();
}
$("installieren").onclick = installiere;
// Kurz nach einem Update kann der Browser noch die alte Seite zeigen. Dann fehlen die neuen Knöpfe.
const neueSeite = typeof modus !== "undefined" && !!$("umschalten");
$("appleiste").hidden = istInstalliert() || (neueSeite && ablage.lies("kasten", "") === "zu");
if (neueSeite) {
  const zweiter = $("installieren2");
  zweiter.hidden = istInstalliert() || !$("appleiste").hidden;
  zweiter.onclick = installiere;
  $("kastenzu").onclick = () => { ablage.setze("kasten", "zu"); $("appleiste").hidden = true; zweiter.hidden = false; };
  $("umschalten").onclick = () => modus.setze(modus.dunkel() ? "hell" : "dunkel");
}
// --- Einstellungen ---
const SCHRIFT = { klein: ["Klein", 0.9], normal: ["Normal", 1], gross: ["Groß", 1.15], sehrgross: ["Sehr groß", 1.3] };
let schrift = ablage.lies("schrift", "normal");
function setzeSchrift(w) { schrift = SCHRIFT[w] ? w : "normal"; ablage.setze("schrift", schrift); document.documentElement.style.setProperty("--g", SCHRIFT[schrift][1]); }
setzeSchrift(schrift);
function setzeWeg() {
  wegmuster = weg.woerter.map(muster);
  ablage.setze("ausblenden", weg);
  if (daten) { navigation(); zeige(false); }
}
function auswahl(titel, name, werte, jetzt, waehle) {
  const f = el("fieldset"), reihe = el("div", "wahl");
  f.append(el("legend", "", titel), reihe);
  for (const [wert, text] of werte) {
    const l = el("label"), i = el("input");
    i.type = "radio"; i.name = name; i.value = wert; i.checked = wert === jetzt; i.onchange = () => waehle(wert);
    l.append(i, text); reihe.append(l);
  }
  return f;
}
function wortliste() {
  const u = el("ul", "woerter");
  for (const w of weg.woerter) {
    const li = el("li", "", w), x = el("button", "", "×");
    x.type = "button"; x.setAttribute("aria-label", `${w} wieder zeigen`);
    x.onclick = () => { weg.woerter = weg.woerter.filter(y => y !== w); setzeWeg(); u.replaceWith(wortliste()); };
    li.append(x); u.append(li);
  }
  return u;
}
const fenster = el("dialog");
fenster.id = "einstellungen"; fenster.setAttribute("aria-labelledby", "einstellungentitel");
function oeffneEinstellungen() {
  const t = el("h2", "", "Einstellungen"), ressorts = el("fieldset"), reihe = el("div", "wahl"), woerter = el("fieldset"), form = el("form", "wortform"), i = el("input"), k = el("button", "knopf", "Hinzufügen"), fertigKnopf = el("button", "knopf voll", "Fertig");
  t.id = "einstellungentitel";
  ressorts.append(el("legend", "", "Diese Ressorts zeigen"), reihe);
  for (const r of RESSORTS) {
    const l = el("label"), c = el("input");
    c.type = "checkbox"; c.checked = !weg.ressorts.includes(r);
    c.onchange = () => { weg.ressorts = weg.ressorts.filter(x => x !== r); if (!c.checked) weg.ressorts.push(r); setzeWeg(); };
    l.append(c, r); reihe.append(l);
  }
  i.type = "text"; i.maxLength = 40; i.placeholder = "z. B. Fußball"; i.autocomplete = "off"; i.setAttribute("aria-label", "Wort");
  form.onsubmit = e => {
    e.preventDefault();
    const w = i.value.trim();
    i.value = "";
    if (w.length < 2 || weg.woerter.some(x => x.toLowerCase() === w.toLowerCase())) return;
    weg.woerter.push(w); setzeWeg(); woerter.querySelector("ul").replaceWith(wortliste());
  };
  form.append(i, k);
  woerter.append(el("legend", "", "Meldungen mit diesen Wörtern ausblenden"), form, wortliste());
  fertigKnopf.type = "button"; fertigKnopf.onclick = () => fenster.close();
  const teile = [t];
  if (neueSeite) teile.push(auswahl("Aussehen", "modus", [["auto", "Automatisch"], ["hell", "Hell"], ["dunkel", "Dunkel"]], modus.lies(), modus.setze));
  teile.push(auswahl("Schriftgröße", "schrift", Object.entries(SCHRIFT).map(([w, [text]]) => [w, text]), schrift, setzeSchrift), ressorts, woerter,
    el("p", "", "Alles gilt nur auf diesem Gerät. Unter „Schlagzeilen“ wirken nur die Wörter, „Folgen“ und „Gemerkt“ zeigen immer alles."), fertigKnopf);
  fenster.replaceChildren(...teile);
  fenster.showModal();
}
function zeichen(pfad) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"), p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); p.setAttribute("d", pfad); s.append(p);
  return s;
}
const zahnrad = el("button", "rund");
zahnrad.type = "button"; zahnrad.title = "Einstellungen"; zahnrad.setAttribute("aria-label", "Einstellungen"); zahnrad.onclick = oeffneEinstellungen;
zahnrad.append(zeichen("M3 7h9M18 7h3M3 17h3M12 17h9M12 7a3 3 0 1 0 6 0a3 3 0 1 0-6 0M6 17a3 3 0 1 0 6 0a3 3 0 1 0-6 0"));
document.querySelector(".kopf").append(zahnrad);
// --- Leiste unten auf dem Handy ---
const leisteUnten = el("nav", "unten");
leisteUnten.setAttribute("aria-label", "Hauptbereiche");
function sucheZu() { if (document.body.classList.contains("suchend")) { document.body.classList.remove("suchend"); $("suche").value = ""; } }
for (const [text, ziel, pfad] of [["Start", "", "M4 11l8-7l8 7v9h-5v-6H9v6H4z"], ["Heiß", HEISS, "M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-2 1-4 2-5c0 2 1 3 2 3c2-2 0-5 2-9z"], ["Videos", VIDEOS, "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM10 9v6l5-3z"], ["Folgen", FOLGEN, "M12 3l2.8 5.7l6.2.9l-4.5 4.4l1.1 6.2L12 17.3l-5.6 2.9l1.1-6.2L3 9.6l6.2-.9z"], ["Gemerkt", MERK, "M6 4h12v16l-6-4l-6 4z"], ["Suche", null, "M4 11a7 7 0 1 0 14 0a7 7 0 1 0-14 0M16 16l5 5"]]) {
  const b = el("button");
  b.type = "button"; b.append(zeichen(pfad), el("span", "", text));
  b.dataset.ziel = ziel === null ? "suche" : ziel;
  b.onclick = () => {
    if (!daten) return;
    schweige();
    if (ziel === null) { ressort = ""; document.body.classList.add("suchend"); $("suche").focus(); } else { sucheZu(); ressort = ziel; }
    navigation();
    if (location.hash) location.hash = ""; else zeige(true);
    if (ziel === null) $("suche").focus();
  };
  leisteUnten.append(b);
}
document.body.append(leisteUnten, fenster, spieler);
document.body.classList.add("mitleiste");
function zeigeUnten() {
  const suchend = document.body.classList.contains("suchend");
  for (const b of leisteUnten.children) {
    const z = b.dataset.ziel;
    if (z === VIDEOS) b.hidden = !filme.length && ressort !== VIDEOS;
    b.setAttribute("aria-pressed", String(suchend ? z === "suche" : z === ([HEISS, VIDEOS, FOLGEN, MERK].includes(ressort) ? ressort : "")));
  }
}
// --- Passwort und Entschlüsselung ---
const b64 = t => Uint8Array.from(atob(t), c => c.charCodeAt(0));
const zugang = {
  lies() { try { return JSON.parse(localStorage.getItem("newsradar")); } catch (_) { return null; } },
  setze(w) { try { w ? localStorage.setItem("newsradar", JSON.stringify(w)) : localStorage.removeItem("newsradar"); } catch (_) { /* privater Modus */ } }
};
async function ausPasswort(passwort, p) {
  const roh = await crypto.subtle.importKey("raw", new TextEncoder().encode(passwort.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64(p.salz), iterations: p.runden }, roh, 256));
}
async function entschluessle(bits, p) {
  const k = await crypto.subtle.importKey("raw", bits, "AES-GCM", false, ["decrypt"]);
  const gepackt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(p.iv) }, k, b64(p.daten));
  return JSON.parse(await new Response(new Blob([gepackt]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text());
}
// Videos und Vorschaubilder: 12 Byte Zufall, dann der verschlüsselte Inhalt. `fortschritt` bekommt den geladenen Anteil (0 bis 1).
async function holeGeheim(pfad, fortschritt) {
  const r = await fetch(pfad);
  if (!r.ok) throw new Error(r.status);
  const n = +r.headers.get("Content-Length") || 0;
  let d;
  if (fortschritt && n && r.body && r.body.getReader) {
    const leser = r.body.getReader();
    d = new Uint8Array(n);
    let pos = 0;
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      if (pos + value.length > d.length) { const g = new Uint8Array(Math.max(d.length * 2, pos + value.length)); g.set(d.subarray(0, pos)); d = g; }
      d.set(value, pos); pos += value.length;
      fortschritt(pos / n);
    }
    d = d.subarray(0, pos);
  } else d = new Uint8Array(await r.arrayBuffer());
  const k = await crypto.subtle.importKey("raw", schluessel, "AES-GCM", false, ["decrypt"]);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: d.subarray(0, 12) }, k, d.subarray(12));
}
// Die Liste der Videos liegt in einer eigenen Datei, die nur der Mac schreibt. Fehlt sie, gibt es keine Videos.
async function ladeFilme() {
  const k = schluessel, salz = paket && paket.salz;
  let l = filme;
  try {
    const r = await fetch("videos.json?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" });
    if (r.status === 404) l = [];
    else if (r.ok) { const p = await r.json(); if (p.salz === salz) l = await entschluessle(k, p); }
  } catch (_) { /* ohne Netz: die bisherige Liste bleibt */ }
  if (k !== schluessel || !daten || !Array.isArray(l)) return;
  const vorher = filme.map(v => v.id + v.t).join("|");
  filme = l.filter(v => v && typeof v.id === "string" && /^[0-9a-f]+$/.test(v.id) && typeof v.t === "string");
  if (filme.map(v => v.id + v.t).join("|") === vorher) return;
  navigation();
  if (ressort === VIDEOS && !location.hash) zeige(false);
}
function sperre(meldung) {
  daten = null; schluessel = null; filme = [];
  for (const p of bilder.values()) p.then(u => u && URL.revokeObjectURL(u));
  bilder.clear();
  if (spieler.open) spieler.close();
  document.body.classList.add("gesperrt");
  $("ressorts").replaceChildren();
  $("stand").textContent = "";
  const f = el("form", "anmelden"), i = el("input"), l = el("label", "", "Passwort"), k = el("button", "knopf voll", "Öffnen"), m = el("p", "fehler", meldung || "");
  i.type = "password"; i.id = "passwort"; i.autocomplete = "current-password"; i.required = true; i.autocapitalize = "none"; i.spellcheck = false;
  l.htmlFor = "passwort"; m.setAttribute("role", "alert");
  const n = el("button", "knopf laden", "App herunterladen");
  n.type = "button"; n.hidden = istInstalliert(); n.onclick = installiere;
  f.append(el("h1", "", "NewsRadar"), el("p", "hinweis", "Diese Nachrichten sind privat. Gib das Passwort ein, das du bekommen hast."), l, i, k, m, n);
  f.onsubmit = async e => {
    e.preventDefault();
    k.disabled = true; k.textContent = "Wird geöffnet …"; m.textContent = "";
    let bits;
    try {
      bits = await ausPasswort(i.value.trim().toLowerCase(), paket);
      daten = await entschluessle(bits, paket);
    } catch (_) {
      k.disabled = false; k.textContent = "Öffnen"; m.textContent = "Das Passwort stimmt nicht."; i.select();
      return;
    }
    // Erst nach dem Entschlüsseln anzeigen: Ein Fehler in der Anzeige ist kein falsches Passwort
    schluessel = bits;
    zugang.setze({ salz: paket.salz, k: btoa(String.fromCharCode(...bits)) });
    fertig();
  };
  $("inhalt").replaceChildren(f);
  if (!matchMedia("(pointer: coarse)").matches) i.focus();
}
function fertig() {
  document.body.classList.remove("gesperrt");
  zaehleBesuch(daten.artikel);
  navigation();
  if (!document.activeElement || document.activeElement.id !== "folgewort") zeige(false);
  ladeFilme();
}
async function lade() {
  try {
    const r = await fetch("news.json?t=" + Math.floor(Date.now() / 60000), { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    paket = await r.json();
    offline = r.headers.get("X-Offline") === "1";
    geladen = Date.now();
  } catch (_) {
    offline = true;
    if (!daten) $("inhalt").replaceChildren(el("p", "leer", "Die Meldungen sind gerade nicht erreichbar. Prüfe deine Internetverbindung und lade die Seite neu."));
    else zeige(false);
    return;
  }
  if (!window.crypto || !crypto.subtle || !window.DecompressionStream) {
    $("inhalt").replaceChildren(el("p", "leer", "Dein Browser ist zu alt für diese Seite. Bitte aktualisiere ihn.")); return;
  }
  const g = zugang.lies();
  if (!schluessel && g && g.salz === paket.salz) schluessel = b64(g.k);
  if (schluessel) {
    try { daten = await entschluessle(schluessel, paket); }
    catch (_) { zugang.setze(null); return sperre("Das Passwort wurde geändert. Bitte gib das neue ein."); }
    return fertig();
  }
  if (!document.body.classList.contains("gesperrt")) sperre(g ? "Das Passwort wurde geändert. Bitte gib das neue ein." : "");
}
$("abmelden").onclick = () => {
  if (gemerkt.length && !confirm(`Beim Abmelden werden auch deine gemerkten Meldungen auf diesem Gerät gelöscht (${gemerkt.length}). Trotzdem abmelden?`)) return;
  schweige(); ablage.loesche(); zugang.setze(null); location.hash = ""; document.body.classList.remove("gesperrt"); sperre(""); };
let position = 0;
addEventListener("hashchange", e => {
  schweige();
  const vorher = new URL(e.oldURL).hash;
  if (!vorher || vorher === "#") position = scrollY;
  const zurListe = !location.hash;
  zeige(!zurListe);
  if (zurListe) scrollTo(0, position);
});
$("suche").addEventListener("input", () => {
  if (!daten) return;
  schweige();
  if (location.hash) history.replaceState(null, "", location.pathname); zeige(false); scrollTo(0, 0); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && daten && Date.now() - geladen > 120000) lade(); });
setInterval(() => { if (!document.hidden && daten) lade(); }, 300000);
lade();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
