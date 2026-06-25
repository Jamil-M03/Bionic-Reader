# Bionic Reader — source & build instructions

This package contains the complete source for the **Bionic Reader** browser
extension (Firefox and Chrome), plus a script that reproduces an exact copy of
each store package.

Everything is shared between the two browsers except the manifest. The two
manifests live in `manifests/` (`manifest.firefox.json` is Manifest V2,
`manifest.chrome.json` is Manifest V3); `build.sh` selects the right one.

## What is and isn't generated

- **Hand-written source (not processed in any way):**
  `manifests/manifest.firefox.json`, `manifests/manifest.chrome.json`,
  `content.js`, `content.css`, `background.js`,
  `popup.html`, `popup.js`, `popup.css`,
  `viewer.html`, `viewer.js`, `viewer.css`, `icons/icon.svg`.
  These are exactly what runs in the extension. There is no transpilation,
  concatenation, minification, bundling, or template engine applied to them.

- **Third-party library (open source):**
  `pdfjs/pdf.mjs` and `pdfjs/pdf.worker.mjs` are the official, **unmodified,
  non-minified** build of [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist)
  version **4.10.38**, published to npm by Mozilla. They are not built from
  this repository; they are copied verbatim from the npm package. They power
  the bundled PDF reader (`viewer.*`).
  The `eval`/`Function`/dynamic-`import` linter warnings originate entirely
  from these two files.

- **Icons:** `icons/icon.svg` is the hand-authored master. The PNGs
  (`icon-32/48/96/128.png`) are exported from it with any SVG rasterizer
  (e.g. `cairosvg icons/icon.svg -o icons/icon-128.png --output-width 128`)
  and are static image assets, not code.

## Build environment requirements

- **Operating system:** any Linux or macOS environment (or Windows with WSL or
  Git Bash). The build script is a POSIX `bash` script.
- **Node.js:** version 18 or newer. (Built and verified with Node 22.x.)
- **npm:** the version bundled with the Node.js install above.
- **zip:** the standard `zip` command-line utility.
- **Network access** to the public npm registry (to download `pdfjs-dist`).

Install Node.js (which includes npm) from https://nodejs.org/ or via a version
manager such as nvm (`nvm install 22`).

## Build steps

From the root of this source package, choose a target:

```bash
./build.sh firefox    # -> dist/firefox/ + bionic-reader-firefox.zip  (Manifest V2)
./build.sh chrome     # -> dist/chrome/  + bionic-reader-chrome.zip   (Manifest V3)
```

Each run will:

1. Download `pdfjs-dist@4.10.38` from npm (`npm pack`).
2. Copy `manifests/manifest.<target>.json` (as `manifest.json`) plus the shared
   source files and the two pdf.js library files into a clean `dist/<target>/`.
3. Zip that directory into `bionic-reader-<target>.zip`, with `manifest.json` at
   the archive root — an exact copy of the store package.

No other tooling is involved. To verify the pdf.js files are unmodified, the
files written to `dist/pdfjs/` are byte-identical to the ones already present
under `pdfjs/` in this package, and both equal `package/build/*.mjs` from the
npm tarball.
