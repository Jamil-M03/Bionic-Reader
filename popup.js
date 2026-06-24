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
function renderPreview(strength) {
  const frag = document.createDocumentFragment();
  const re = /\p{L}[\p{L}\u2019']*|[^\p{L}]+/gu;
  let m;
  while ((m = re.exec(SAMPLE)) !== null) {
    const tok = m[0];
    if (/^\p{L}/u.test(tok)) {
      const k = fixationLength(tok.length, strength);
      const b = document.createElement("b");
      b.textContent = tok.slice(0, k);
      frag.appendChild(b);
      const rest = tok.slice(k);
      if (rest) frag.appendChild(document.createTextNode(rest));
    } else {
      frag.appendChild(document.createTextNode(tok));
    }
  }
  preview.replaceChildren(frag);
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
