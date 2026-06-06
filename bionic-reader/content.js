/* Bionic Reader — content script
 * Splits each word into a bold "fixation" prefix + normal remainder.
 * Toggling on/off is purely a CSS class on <html>, so it's instant after the
 * first pass. Changing strength fully un-processes and re-processes the page.
 */
(() => {
  "use strict";

  const api = typeof browser !== "undefined" ? browser : chrome;

  // ---- state ----
  let enabled = false;
  let strength = 0.45; // 0.30 low, 0.45 medium, 0.60 high
  let processed = false; // has the DOM already been split into fixation spans?
  let observer = null;

  // ---- bionic core ----
  const WORD_RE = /\p{L}[\p{L}\p{M}\u2019']*/gu;

  function fixationLength(n, s) {
    if (n <= 3) return 1;
    const b = Math.round(n * s);
    return Math.min(Math.max(b, 1), n - 1); // always leave >=1 trailing char
  }

  // Skip these containers entirely.
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "KBD", "SAMP", "VAR",
    "TEXTAREA", "INPUT", "SELECT", "OPTION", "BUTTON", "SVG", "MATH",
    "CANVAS", "VIDEO", "AUDIO", "IFRAME", "OBJECT", "EMBED"
  ]);

  function shouldSkip(node) {
    let el = node.parentElement;
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      if (el.classList && el.classList.contains("brx-b")) return true;
      el = el.parentElement;
    }
    return false;
  }

  // Replace one text node with [text, <b>pre</b>, text, ...] when it has words.
  function processTextNode(node) {
    const text = node.nodeValue;
    if (!text || !/\p{L}/u.test(text)) return;

    const frag = document.createDocumentFragment();
    let last = 0, m, found = false;
    WORD_RE.lastIndex = 0;
    while ((m = WORD_RE.exec(text)) !== null) {
      const w = m[0], start = m.index;
      const k = fixationLength(w.length, strength);
      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
      const b = document.createElement("b");
      b.className = "brx-b";
      b.textContent = w.slice(0, k);
      frag.appendChild(b);
      const rest = w.slice(k);
      if (rest) frag.appendChild(document.createTextNode(rest));
      last = start + w.length;
      found = true;
    }
    if (!found) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  }

  function collectTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (shouldSkip(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }

  // Process in idle chunks so big pages don't jank.
  function processRoot(root) {
    const nodes = collectTextNodes(root);
    let i = 0;
    const CHUNK = 400;
    function run() {
      const end = Math.min(i + CHUNK, nodes.length);
      for (; i < end; i++) {
        // node may have been detached by an earlier replace; guard it
        if (nodes[i].parentNode) processTextNode(nodes[i]);
      }
      if (i < nodes.length) {
        (window.requestIdleCallback || window.setTimeout)(run, 1);
      }
    }
    run();
  }

  // Undo: replace every <b.brx-b> with its text, then merge text nodes back.
  function unprocess() {
    const spans = document.querySelectorAll("b.brx-b");
    const parents = new Set();
    spans.forEach((s) => {
      const p = s.parentNode;
      if (!p) return;
      p.replaceChild(document.createTextNode(s.textContent), s);
      parents.add(p);
    });
    parents.forEach((p) => p.normalize());
    processed = false;
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (!enabled) return;
      for (const mut of mutations) {
        mut.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (!shouldSkip(node)) processRoot(node);
          } else if (node.nodeType === Node.TEXT_NODE && !shouldSkip(node)) {
            if (node.parentNode) processTextNode(node);
          }
        });
      }
    });
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
  }

  // ---- apply current state ----
  function apply() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", apply, { once: true });
      return;
    }
    if (enabled) {
      if (!processed) { processRoot(document.body); processed = true; }
      document.documentElement.classList.add("brx-on");
      startObserver();
    } else {
      document.documentElement.classList.remove("brx-on");
      stopObserver();
    }
  }

  // ---- wire up storage ----
  api.storage.local.get({ enabled: false, strength: 0.45 }).then((s) => {
    enabled = !!s.enabled;
    strength = s.strength;
    apply();
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    let strengthChanged = false;
    if ("strength" in changes && changes.strength.newValue !== strength) {
      strength = changes.strength.newValue;
      strengthChanged = true;
    }
    if ("enabled" in changes) {
      enabled = !!changes.enabled.newValue;
    }
    // If strength changed, discard any existing split markup so the next
    // apply() rebuilds it at the new strength (handles the off->on case too).
    if (strengthChanged && processed) {
      stopObserver();
      unprocess();
    }
    apply();
  });
})();
