import * as pdfjsLib from "./pdfjs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL("./pdfjs/pdf.worker.mjs", import.meta.url).href;

const api = typeof browser !== "undefined" ? browser
  : (typeof chrome !== "undefined" ? chrome : null);

// ---- elements ----
const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const controls = document.getElementById("controls");
const modeSeg = document.getElementById("modeSeg");
const strSeg = document.getElementById("strSeg");
const bionicToggle = document.getElementById("bionicToggle");
const newFile = document.getElementById("newFile");
const docName = document.getElementById("docName");
const status = document.getElementById("status");
const reader = document.getElementById("reader");
const pagesEl = document.getElementById("pages");

// ---- state ----
let pdfDoc = null;
let mode = "layout";          // "layout" | "read"
let strength = 0.45;
let bionicOn = true;
let pageViews = [];           // layout-mode page descriptors
let extracted = null;         // reflow-mode paragraphs, lazily built
const viewByEl = new WeakMap();

// ---- bionic core ----
function fixationLength(n, s) {
  if (n <= 3) return 1;
  return Math.min(Math.max(Math.round(n * s), 1), n - 1);
}
const WORD_RE = /\p{L}[\p{L}\p{M}\u2019']*/gu;
// Build a DocumentFragment for the text. When bold is true, each word's
// fixation prefix is wrapped in <b>. Uses DOM nodes (no innerHTML) so the
// text is never parsed as markup.
function bionicFrag(text, s, bold) {
  const frag = document.createDocumentFragment();
  let last = 0, m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    const w = m[0], start = m.index;
    if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
    if (bold) {
      const k = fixationLength(w.length, s);
      const b = document.createElement("b");
      b.textContent = w.slice(0, k);
      frag.appendChild(b);
      const rest = w.slice(k);
      if (rest) frag.appendChild(document.createTextNode(rest));
    } else {
      frag.appendChild(document.createTextNode(w));
    }
    last = start + w.length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

function setStatus(msg, isErr) {
  status.hidden = !msg;
  status.textContent = msg || "";
  status.classList.toggle("err", !!isErr);
}

// ================= LAYOUT (structure-preserving) VIEW =================

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      const view = viewByEl.get(e.target);
      if (view && !view.rendered) renderLayoutPage(view);
    }
  }
}, { rootMargin: "800px 0px" });

async function buildLayout() {
  pagesEl.replaceChildren();
  pageViews = [];
  const targetW = Math.min((pagesEl.clientWidth || window.innerWidth) - 40, 1000);
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = targetW / base.width;
    const viewport = page.getViewport({ scale });

    const wrap = document.createElement("div");
    wrap.className = "page-wrap" + (bionicOn ? " bionic" : "");
    wrap.style.width = viewport.width + "px";
    wrap.style.height = viewport.height + "px";

    const canvas = document.createElement("canvas");
    canvas.className = "pg-canvas";
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";

    const tl = document.createElement("div");
    tl.className = "text-layer";
    tl.style.width = viewport.width + "px";
    tl.style.height = viewport.height + "px";

    wrap.append(canvas, tl);
    pagesEl.appendChild(wrap);

    const view = { pageNum: i, wrap, canvas, tl, page, viewport, rendered: false, items: null };
    pageViews.push(view);
    viewByEl.set(wrap, view);
    io.observe(wrap);
  }
}

async function renderLayoutPage(view) {
  view.rendered = true;
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = view.viewport;
    view.canvas.width = Math.floor(vp.width * dpr);
    view.canvas.height = Math.floor(vp.height * dpr);
    const ctx = view.canvas.getContext("2d", { willReadFrequently: true });
    ctx.scale(dpr, dpr);
    await view.page.render({ canvasContext: ctx, viewport: vp }).promise;

    // Grab the rendered pixels so we can sample the local background colour
    // behind each text run (used to mask the original text in bionic mode
    // while leaving images/figures on the canvas visible).
    let img = null;
    try { img = ctx.getImageData(0, 0, view.canvas.width, view.canvas.height); }
    catch (e) { img = null; }

    const tc = await view.page.getTextContent();
    view.items = tc.items.filter((it) => typeof it.str === "string" && it.str.length);
    buildTextLayer(view, img, dpr);
  } catch (e) {
    console.error("page render error", view.pageNum, e);
  }
}

// Pick the brightest of a few points around a text run as its background
// colour (works for the common case of dark text on a light page).
function sampleBg(img, W, H, dpr, left, top, fh, w) {
  if (!img) return "rgb(255,255,255)";
  const d = img.data;
  const pts = [
    [left + w * 0.5, top - 2],
    [left + 1, top - 2],
    [left + w * 0.5, top + fh + 2],
    [left - 4, top + fh * 0.5],
    [left + w + 3, top + fh * 0.5]
  ];
  let best = [255, 255, 255], bestLum = -1;
  for (const p of pts) {
    const x = Math.round(p[0] * dpr), y = Math.round(p[1] * dpr);
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = (y * W + x) * 4;
    if (d[i + 3] === 0) { best = [255, 255, 255]; bestLum = 255; continue; }
    const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (lum > bestLum) { bestLum = lum; best = [d[i], d[i + 1], d[i + 2]]; }
  }
  return "rgb(" + best[0] + "," + best[1] + "," + best[2] + ")";
}

// Mask the original canvas text under a span (bionic on) or reveal it (off).
function styleBionicSpan(span, on) {
  if (on) {
    const bg = span.dataset.bg || "rgb(255,255,255)";
    span.style.color = "var(--ink)";
    span.style.backgroundColor = bg;
    span.style.boxShadow = "0 0 0 1px " + bg; // expand mask to cover glyph edges
  } else {
    span.style.color = "";
    span.style.backgroundColor = "";
    span.style.boxShadow = "";
  }
}

function buildTextLayer(view, img, dpr) {
  const tl = view.tl;
  const frag = document.createDocumentFragment();
  const W = view.canvas.width, H = view.canvas.height;
  for (const item of view.items) {
    const tx = pdfjsLib.Util.transform(view.viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    if (fontHeight < 0.5) continue;
    const leftCss = tx[4], topCss = tx[5] - fontHeight;
    const widthCss = item.width * view.viewport.scale;
    const span = document.createElement("span");
    span.style.left = leftCss.toFixed(2) + "px";
    span.style.top = topCss.toFixed(2) + "px";
    span.style.fontSize = fontHeight.toFixed(2) + "px";
    span.dataset.w = widthCss.toFixed(2);
    span.dataset.bg = sampleBg(img, W, H, dpr, leftCss, topCss, fontHeight, widthCss);
    if (bionicOn) {
      span.appendChild(bionicFrag(item.str, strength, true));
      styleBionicSpan(span, true);
    } else {
      span.textContent = item.str;
    }
    frag.appendChild(span);
  }
  tl.replaceChildren(frag);
  rescaleSpans(tl);
}

// Stretch each span horizontally so the substitute font matches the
// original text width, preserving the page's structure.
function rescaleSpans(tl) {
  const spans = tl.children;
  const widths = new Array(spans.length);
  for (let i = 0; i < spans.length; i++) {
    spans[i].style.transform = "";
    widths[i] = spans[i].getBoundingClientRect().width;
  }
  for (let i = 0; i < spans.length; i++) {
    const target = parseFloat(spans[i].dataset.w);
    const w = widths[i];
    if (w > 0 && target > 0) {
      spans[i].style.transform = "scaleX(" + (target / w).toFixed(4) + ")";
    }
  }
}

function refreshLayoutText() {
  for (const view of pageViews) {
    view.wrap.classList.toggle("bionic", bionicOn);
    if (!view.rendered || !view.items) continue;
    const spans = view.tl.children;
    for (let i = 0; i < view.items.length && i < spans.length; i++) {
      if (bionicOn) {
        spans[i].replaceChildren(bionicFrag(view.items[i].str, strength, true));
        styleBionicSpan(spans[i], true);
      } else {
        spans[i].textContent = view.items[i].str;
        styleBionicSpan(spans[i], false);
      }
    }
    rescaleSpans(view.tl);
  }
}

// ================= REFLOW VIEW =================

function extractPageParas(tc) {
  const items = tc.items.filter((it) => typeof it.str === "string" && it.str.length);
  const rows = [];
  for (const it of items) {
    const y = it.transform[5], x = it.transform[4];
    const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 12;
    const prev = rows[rows.length - 1];
    if (prev && Math.abs(prev.y - y) <= Math.max(2, h * 0.6)) {
      const needSpace = !/\s$/.test(prev.text) && !/^\s/.test(it.str) && x - prev.endX > h * 0.25;
      prev.text += (needSpace ? " " : "") + it.str;
      prev.endX = x + (it.width || 0);
    } else {
      rows.push({ y, x, endX: x + (it.width || 0), h, text: it.str });
    }
  }
  if (!rows.length) return [];
  const hs = rows.map((r) => r.h).sort((a, b) => a - b);
  const medianH = hs[Math.floor(hs.length / 2)] || 12;
  const paras = [];
  let cur = [], prevY = null;
  for (const r of rows) {
    const t = r.text.replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (prevY !== null) {
      const gap = prevY - r.y;
      if (gap < -medianH * 2 || gap > medianH * 1.65) {
        if (cur.length) { paras.push(cur.join(" ")); cur = []; }
      }
    }
    cur.push(t);
    prevY = r.y;
  }
  if (cur.length) paras.push(cur.join(" "));
  return paras;
}

async function ensureExtracted() {
  if (extracted) return;
  extracted = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    setStatus("Extracting text\u2026 page " + i + " of " + pdfDoc.numPages);
    const page = await pdfDoc.getPage(i);
    extracted.push(extractPageParas(await page.getTextContent()));
  }
  setStatus("");
}

function renderReader() {
  reader.classList.toggle("plain", !bionicOn);
  const frag = document.createDocumentFragment();
  extracted.forEach((paras, idx) => {
    if (idx > 0) {
      const sep = document.createElement("div");
      sep.className = "pg-sep";
      sep.textContent = "Page " + (idx + 1);
      frag.appendChild(sep);
    }
    if (!paras.length) {
      const p = document.createElement("p");
      p.style.cssText = "color:var(--ink-soft);font-style:italic";
      p.textContent = "(No selectable text on this page \u2014 it may be scanned.)";
      frag.appendChild(p);
    } else {
      for (const para of paras) {
        const p = document.createElement("p");
        if (bionicOn) p.appendChild(bionicFrag(para, strength, true));
        else p.textContent = para;
        frag.appendChild(p);
      }
    }
  });
  reader.replaceChildren(frag);
}

// ================= VIEW SWITCHING =================

async function showView() {
  if (mode === "layout") {
    reader.hidden = true;
    pagesEl.hidden = false;
    if (!pageViews.length) await buildLayout();
  } else {
    pagesEl.hidden = true;
    setStatus("");
    await ensureExtracted();
    renderReader();
    reader.hidden = false;
  }
}

// ================= LOAD =================

async function loadPDF(buffer, name) {
  try {
    drop.hidden = true;
    controls.hidden = false;
    pagesEl.hidden = true;
    reader.hidden = true;
    pageViews = [];
    extracted = null;
    pagesEl.replaceChildren();
    reader.replaceChildren();
    docName.textContent = name || "document.pdf";
    setStatus("Opening PDF\u2026");

    pdfDoc = await pdfjsLib.getDocument({
      data: buffer,
      isEvalSupported: false  // Chrome MV3 forbids eval/Function; harmless in Firefox
    }).promise;
    setStatus("");
    await showView();
  } catch (e) {
    setStatus("Could not open this PDF: " + e.message, true);
    console.error(e);
  }
}

function handleFile(file) {
  if (!file) return;
  const fr = new FileReader();
  fr.onload = () => loadPDF(new Uint8Array(fr.result), file.name);
  fr.onerror = () => setStatus("Failed to read file.", true);
  fr.readAsArrayBuffer(file);
}

// ================= EVENTS =================

fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && /pdf$/i.test(f.type || f.name)) handleFile(f);
});
window.addEventListener("dragover", (e) => { if (drop.hidden) e.preventDefault(); });
window.addEventListener("drop", (e) => {
  if (drop.hidden) {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /pdf$/i.test(f.type || f.name)) handleFile(f);
  }
});

modeSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn || btn.dataset.mode === mode) return;
  mode = btn.dataset.mode;
  [...modeSeg.children].forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  showView();
});

strSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  strength = +btn.dataset.s;
  [...strSeg.children].forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
  if (api) api.storage.local.set({ strength });
  if (!bionicOn) return;
  if (mode === "layout") refreshLayoutText(); else if (extracted) renderReader();
});

bionicToggle.addEventListener("change", () => {
  bionicOn = bionicToggle.checked;
  if (mode === "layout") refreshLayoutText();
  else if (extracted) renderReader();
});

newFile.addEventListener("click", () => {
  pdfDoc = null; pageViews = []; extracted = null;
  pagesEl.replaceChildren(); reader.replaceChildren();
  controls.hidden = true; pagesEl.hidden = true; reader.hidden = true;
  setStatus("");
  drop.hidden = false;
  fileInput.value = "";
});

// initial strength from shared storage
(async () => {
  if (!api) return;
  try {
    const { strength: s = 0.45 } = await api.storage.local.get({ strength: 0.45 });
    strength = s;
    [...strSeg.children].forEach((b) =>
      b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.s - strength) < 0.001)));
  } catch (_) {}
})();
