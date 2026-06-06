# Bionic Reader (Firefox)

Toggle bionic reading — bolding the first part of each word to guide your eyes — on any website, plus a built-in reader for PDFs.

## Install (temporary, for testing)

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file inside this folder.

The extension stays loaded until you restart Firefox. To install permanently you'd sign it through [addons.mozilla.org](https://addons.mozilla.org) (or use Firefox Developer/Nightly with `xpinstall.signatures.required` disabled).

## Use

- Click the toolbar icon to open the popup: flip **Bionic mode** on/off and pick a fixation **strength** (Low / Medium / High). It applies to every open tab instantly.
- Keyboard shortcut: **Ctrl+Alt+B** toggles bionic on the current page. (Change it any time at `about:addons` → gear ⚙ → Manage Extension Shortcuts.)
- **Open a PDF in the reader** (button in the popup) opens the bundled reader — drop a PDF in and it re-flows the text with bionic emphasis.

## Why PDFs use a separate reader

Firefox's built-in PDF viewer (pdf.js) draws the visible text onto a `<canvas>`. The selectable text sitting on top is fully transparent — it exists only for selection and accessibility. That means there is **no DOM text to bold**, so a normal content script can't apply bionic styling to a PDF the way it does to a web page.

The bundled reader works around this by using pdf.js to *extract* the text and re-render it as real, styleable HTML, then applying bionic to it. Tradeoffs:

- Great for normal running text (articles, papers, books).
- Multi-column layouts, tables, and heavy formatting may re-flow imperfectly — use the **Original** toggle to see the exact page image (no bionic).
- Scanned/image-only PDFs have no extractable text; they'll show only in Original view.
- Files never leave your device — extraction happens locally.

## Files

- `content.js` / `content.css` — splits words on web pages; toggle is a CSS class so on/off is instant.
- `background.js` — handles the keyboard shortcut.
- `popup.*` — toolbar UI.
- `viewer.*` + `pdfjs/` — the bundled PDF reader (pdf.js 4.10.38).

Built with Manifest V2 (Firefox-compatible). The word splitter is Unicode-aware, keeps internal apostrophes (don't, it's), and leaves numbers unbolded.
