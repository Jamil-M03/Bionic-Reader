# Bionic Reader

Bionic reading for any website or PDF, bolds the first part of each word to
guide your eyes and help you read faster. Available for Firefox and Chrome.

<!-- add a screenshot here later
![Bionic Reader](docs/screenshot.png -->


## Install

- **Firefox**: [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/bionic-reader-web-pdf/)
- **Chrome**: Chrome Web Store (publishing in progress) <!-- [Chrome Web Store](https://chromewebstore.google.com/detail/YOUR_EXTENSION_ID) --> <!-- fill the real ID once the listing is approved -->

## Features

- Toggle bionic reading on any website from the toolbar button or a keyboard
  shortcut (`Ctrl+Alt+B` on Firefox, `Alt+Shift+B` on Chrome, both customizable).
- Three fixation strengths: Low, Medium, High.
- A built-in **PDF reader**: read PDFs with bionic emphasis while keeping the
  page's original layout, images, and figures, or turn bionic off for the exact
  original page. A reflow mode is also available for a clean single-column read.
- Unicode-aware: keeps contractions intact (don't, it's) and leaves numbers
  unbolded.
- **100% local.** Your pages and files never leave your device.

## How it works

Bionic reading highlights the leading letters of each word so your eyes can move
faster while your brain fills in the rest. On web pages, the extension restyles
text in place. For PDFs, it uses a bundled copy of
[pdf.js](https://mozilla.github.io/pdf.js/) to render the page and lay bionic
text over it, so images and layout are preserved.

## Privacy

Bionic Reader collects, stores, and transmits **no data**. Everything happens
locally in your browser. See [PRIVACY.md](PRIVACY.md).

## Building from source

Everything is shared between the Firefox and Chrome builds except the manifest.
The two manifests live in `manifests/` (`manifest.firefox.json` is Manifest V2,
`manifest.chrome.json` is Manifest V3); `build.sh` selects the right one.

### Requirements

- A Linux or macOS shell (or Windows with WSL / Git Bash), `build.sh` is bash.
- **Node.js 18+** and **npm** (verified with Node 22.x).
- The `zip` command-line utility.
- Network access to npm (to download `pdfjs-dist`).

### Build

```bash
./build.sh firefox    # -> dist/firefox/ + bionic-reader-firefox.zip  (Manifest V2)
./build.sh chrome     # -> dist/chrome/  + bionic-reader-chrome.zip   (Manifest V3)
```

Each run downloads `pdfjs-dist@4.10.38` from npm, copies the matching manifest
plus the shared source and the pdf.js library into `dist/<target>/`, and zips it
with `manifest.json` at the archive root.

### What is and isn't generated

- **Hand-written source (no build step, copied verbatim):** the two manifests,
  `content.*`, `background.js`, `popup.*`, `viewer.*`, and `icons/icon.svg`.
- **Third-party library:** `pdfjs/pdf.mjs` and `pdfjs/pdf.worker.mjs` are the
  official, unmodified, non-minified build of `pdfjs-dist@4.10.38` from npm
  (reproduce with `npm pack pdfjs-dist@4.10.38`).
- **Icons:** the PNGs are exported from `icons/icon.svg` with any SVG rasterizer.

## Loading unpacked (for development)

- **Firefox:** `about:debugging#/runtime/this-firefox` -> Load Temporary Add-on ->
  pick `dist/firefox/manifest.json`.
- **Chrome:** `chrome://extensions` -> enable Developer mode -> Load unpacked ->
  pick the `dist/chrome` folder.

# License
**MIT** — see [`LICENSE`](./LICENSE).
You're free to view, fork, modify, and use this code for any purpose,
including commercial — just keep the copyright notice and license text
from the [`LICENSE`](./LICENSE) file in any copies or derivatives. If you
build something interesting on top of it, I'd love to hear about it via
my [GitHub profile](https://github.com/Jamil-M03).
 
## Acknowledgements
PDF rendering is powered by [pdf.js](https://mozilla.github.io/pdf.js/),
Mozilla's open-source PDF library, bundled unmodified. Inspired by the
"bionic reading" idea of emphasizing the start of each word to guide the eye.
 
---
© 2026 Jamil M. Licensed under MIT.
