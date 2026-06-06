const api = typeof browser !== "undefined" ? browser : chrome;

const toggle = document.getElementById("toggle");
const seg = document.getElementById("seg");
const preview = document.getElementById("preview");
const pdfBtn = document.getElementById("pdfBtn");

const SAMPLE = "Reading is the gateway skill that makes everything possible.";

function fixationLength(n, s) {
  if (n <= 3) return 1;
  return Math.min(Math.max(Math.round(n * s), 1), n - 1);
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function renderPreview(strength) {
  preview.innerHTML = SAMPLE.replace(/\p{L}[\p{L}\u2019']*/gu, (w) => {
    const k = fixationLength(w.length, strength);
    return "<b>" + esc(w.slice(0, k)) + "</b>" + esc(w.slice(k));
  });
}
function markStrength(strength) {
  [...seg.children].forEach((b) => {
    b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.s - strength) < 0.001));
  });
}

async function init() {
  const { enabled = false, strength = 0.45 } =
    await api.storage.local.get({ enabled: false, strength: 0.45 });
  toggle.checked = enabled;
  markStrength(strength);
  renderPreview(strength);
}

toggle.addEventListener("change", () => {
  api.storage.local.set({ enabled: toggle.checked });
});

seg.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const strength = +btn.dataset.s;
  api.storage.local.set({ strength });
  markStrength(strength);
  renderPreview(strength);
});

pdfBtn.addEventListener("click", () => {
  api.tabs.create({ url: api.runtime.getURL("viewer.html") });
  window.close();
});

init();
