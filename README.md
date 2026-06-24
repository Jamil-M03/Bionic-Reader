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

Firefox's built-in PDF viewer (pdf.js) draws the visible text onto a `<canvas>`. The selectable text sitting on top is fully transparent — it exists only for selection and accessibility. So there is **no DOM text to bold**, and a normal content script can't apply bionic to a PDF the way it does to a web page.

The bundled reader works around this with pdf.js. It has two views:

- **Layout** (default) — keeps the page's original structure (margins, columns, line breaks, positions) and shows the page's images, figures, and diagrams. Bionic emphasis is applied to the text *in place*: the original page is rendered to a canvas, and each bionicized word is laid over it on a small background chip that masks only the original word underneath, so images show through untouched. The bionic text uses a substitute font stretched to match the original spacing. Turn the **Bionic** switch off to see the exact original page.
- **Reflow** — re-flows the extracted text into a clean single reading column. Best for linear reading; ignores the original layout.

Notes:

- Text sitting directly on top of a photo or a dark background may show a faint mask rectangle in bionic mode; switch Bionic off for the exact page.
- Scanned/image-only PDFs have no extractable text, so bionic can't be applied — the page image still shows correctly.
- Pages render lazily as you scroll, so large PDFs open quickly.
- Files never leave your device; everything happens locally.

## Files

- `content.js` / `content.css` — splits words on web pages; toggle is a CSS class so on/off is instant.
- `background.js` — handles the keyboard shortcut.
- `popup.*` — toolbar UI.
- `viewer.*` + `pdfjs/` — the bundled PDF reader (pdf.js 4.10.38).

Built with Manifest V2 (Firefox-compatible). The word splitter is Unicode-aware, keeps internal apostrophes (don't, it's), and leaves numbers unbolded.