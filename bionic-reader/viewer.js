import * as pdfjsLib from "./pdfjs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  new URL("./pdfjs/pdf.worker.mjs", import.meta.url).href;

const api = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);

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
let mode = "read";              // "read" | "page"
let strength = 0.45;
let bionicOn = true;
let extracted = [];             // [{ paras: [string,...] }] per page
let pagesRendered = false;      // original-page canvases drawn?

// ---- bionic core ----
function fixationLength(n, s) {
  if (n <= 3) return 1;
  return Math.min(Math.max(Math.round(n * s), 1), n - 1);
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const WORD_RE = /\p{L}[\p{L}\p{M}\u2019']*/gu;
function applyBionic(text, s) {
  let out = "", last = 0, m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    const w = m[0], start = m.index;
    if (start > last) out += esc(text.slice(last, start));
    const k = fixationLength(w.length, s);
    out += "<b>" + esc(w.slice(0, k)) + "</b>" + esc(w.slice(k));
    last = start + w.length;
  }
  out += esc(text.slice(last));
  return out;
}

// ---- text extraction + reflow ----
async function extractPage(page) {
  const tc = await page.getTextContent();
  const items = tc.items.filter((it) => typeof it.str === "string" && it.str.length);

  // group items into visual lines by baseline y
  const rows = [];
  for (const it of items) {
    const y = it.transform[5];
    const x = it.transform[4];
    const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 12;
    const prev = rows[rows.length - 1];
    if (prev && Math.abs(prev.y - y) <= Math.max(2, h * 0.6)) {
      // same line: add a space if pdf didn't and there's a horizontal gap
      const needSpace =
        !/\s$/.test(prev.text) && !/^\s/.test(it.str) && x - prev.endX > h * 0.25;
      prev.text += (needSpace ? " " : "") + it.str;
      prev.endX = x + (it.width || 0);
    } else {
      rows.push({ y, x, endX: x + (it.width || 0), h, text: it.str });
    }
  }

  if (!rows.length) return { paras: [] };

  // typical line height for paragraph-gap detection
  const hs = rows.map((r) => r.h).sort((a, b) => a - b);
  const medianH = hs[Math.floor(hs.length / 2)] || 12;

  const paras = [];
  let cur = [];
  let prevY = null;
  for (const r of rows) {
    const t = r.text.replace(/\s+/g, " ").trim();
    if (!t) continue;
    if (prevY !== null) {
      const gap = prevY - r.y;                  // positive = moving down the page
      if (gap < -medianH * 2 || gap > medianH * 1.65) {
        // big downward gap (new para) or a jump back up (new column/section)
        if (cur.length) { paras.push(cur.join(" ")); cur = []; }
      }
    }
    cur.push(t);
    prevY = r.y;
  }
  if (cur.length) paras.push(cur.join(" "));
  return { paras };
}

// ---- rendering: reading mode ----
function renderReader() {
  reader.classList.toggle("plain", !bionicOn);
  const frag = document.createDocumentFragment();
  extracted.forEach((pg, idx) => {
    if (idx > 0) {
      const sep = document.createElement("div");
      sep.className = "pg-sep";
      sep.textContent = "Page " + (idx + 1);
      frag.appendChild(sep);
    }
    const section = document.createElement("div");
    section.className = "pg";
    if (!pg.paras.length) {
      const p = document.createElement("p");
      p.style.color = "var(--ink-soft)";
      p.style.fontStyle = "italic";
      p.textContent = "(No selectable text on this page — it may be scanned. Use Original view.)";
      section.appendChild(p);
    } else {
      for (const para of pg.paras) {
        const p = document.createElement("p");
        p.innerHTML = bionicOn ? applyBionic(para, strength) : esc(para);
        section.appendChild(p);
      }
    }
    frag.appendChild(section);
  });
  reader.replaceChildren(frag);
}

// ---- rendering: original page canvases ----
async function renderPages() {
  pagesEl.replaceChildren();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.min(pagesEl.clientWidth - 32, 900);
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = (targetW / base.width) * dpr;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    canvas.style.width = vp.width / dpr + "px";
    const ctx = canvas.getContext("2d");
    const wrap = document.createElement("div");
    wrap.className = "page-wrap";
    wrap.appendChild(canvas);
    pagesEl.appendChild(wrap);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
  }
  pagesRendered = true;
}

// ---- view switching ----
function showView() {
  if (mode === "read") {
    reader.hidden = false;
    pagesEl.hidden = true;
    if (!reader.childNodes.length) renderReader();
  } else {
    reader.hidden = true;
    pagesEl.hidden = false;
    if (!pagesRendered) {
      setStatus("Rendering original pages…");
      renderPages().then(() => setStatus("")).catch((e) => setStatus("Render error: " + e.message, true));
    }
  }
}

function setStatus(msg, isErr) {
  status.hidden = !msg;
  status.innerHTML = msg ? (isErr ? '<span class="err">' + esc(msg) + "</span>" : esc(msg)) : "";
}

// ---- load a file ----
async function loadPDF(arrayBuffer, name) {
  try {
    drop.hidden = true;
    controls.hidden = false;
    reader.hidden = true;
    pagesEl.hidden = true;
    pagesRendered = false;
    extracted = [];
    docName.textContent = name || "document.pdf";
    setStatus("Reading PDF…");

    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    reader.hidden = false;
    reader.replaceChildren();

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      setStatus("Extracting text… page " + i + " of " + pdfDoc.numPages);
      const page = await pdfDoc.getPage(i);
      extracted.push(await extractPage(page));
      // progressive: re-render as pages come in
      renderReader();
    }
    setStatus("");
    showView();
  } catch (e) {
    setStatus("Could not open this PDF: " + e.message, true);
    console.error(e);
  }
}

function handleFile(file) {
  if (!file) return;
  const reader2 = new FileReader();
  reader2.onload = () => loadPDF(new Uint8Array(reader2.result), file.name);
  reader2.onerror = () => setStatus("Failed to read file.", true);
  reader2.readAsArrayBuffer(file);
}

// ---- events ----
fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));

["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); })
);
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && /pdf$/i.test(f.type || f.name)) handleFile(f);
});
// allow dropping anywhere once loaded too
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  if (drop.hidden) {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /pdf$/i.test(f.type || f.name)) handleFile(f);
  }
});

modeSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
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
  if (mode === "read") renderReader();
});

bionicToggle.addEventListener("change", () => {
  bionicOn = bionicToggle.checked;
  if (mode === "read") renderReader();
});

newFile.addEventListener("click", () => {
  pdfDoc = null; extracted = []; pagesRendered = false;
  reader.replaceChildren(); pagesEl.replaceChildren();
  controls.hidden = true; reader.hidden = true; pagesEl.hidden = true;
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
      b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.s - strength) < 0.001))
    );
  } catch (_) {}
})();
