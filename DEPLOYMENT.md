# Eliguli deployment

Deploy this repository on Vercel with the project name `eliguli` if available. Use another short name only when the provider reports that it is unavailable.

The configuration builds the personal CV as the home page, keeps the prototype at `/antiterrastrae`, and includes every PDF, image and CV download. The CV title, markup and links are copied without modification: GitHub Pages `/Antiterrastrae/cv.html`, Vercel `/cv.html`, and Vercel `/` serve identical HTML. The existing GitHub Pages routes remain available.

Build locally with `node scripts/build-mirror.mjs`. The output is `dist/`; do not commit generated output.

The research directory redirects to `/fea_research/high_res_meg_teeth/archive` on Vercel. The build creates `archive.html` from the unchanged research `index.html`, so clean URLs retain a filename segment and relative scripts, images, worker files and data resolve inside the research directory. Verify these resource requests in the browser as well as the HTML hash.

The host assigns and confirms the final URL during deployment. No new mirror URL is considered live until deployment succeeds. Retire duplicate hosting only after its replacement is accessible and its content has been checked.

Deploy the same Git commit to both hosts. After deployment, compare SHA-256 hashes of the public CV pages and anatomy plate images against the source files. Publish model download links only after the corresponding model files are available and checked.

## Papers, readers and card backs

`publications/catalog.json` records each complete PDF's original filename, byte count, page count and SHA-256. Run `python3 scripts/build-publications.py` after adding a document. The requested `K_class_9_copy_m_slot_markov_symmetry_report.pdf`, once supplied, is always appended last. Do not fabricate this report or publish a broken download link when the source is missing.

All paper reading links use `publications/reader.html?paper=<catalog-id>`. Its persistent `../cv.html#paper-<catalog-id>` return link stays on the current host, for both GitHub Pages' repository prefix and Vercel's root. PDF.js, fonts and workers are vendored locally, and complete PDFs are available for download. The inline readers are loaded only while an entry is expanded. Original report editions remain distinct.

Card back text is in `assets/portfolio/cards.json`; the supplied front JPEGs remain unchanged. Open a card in the full-image viewer and click the image or Flip card; Enter/Space on the front and the explicit flip button are supported. Closing or selecting a new work resets the card to its front.

Before publishing, build the mirror and run `python3 -m unittest discover -s tests -v` with Python Playwright and `/usr/bin/chromium` installed. The checks render the first and last pages of every PDF in both layouts, verify same-layout CV return links and unchanged downloads, and exercise inline disclosures plus card fronts/backs at desktop and phone widths.

The 3D viewer accepts `data-support-src` (a complete, original-texture model plus separate support geometry) and `data-support-download` (the actual PrusaSlicer project). Its Display support control preserves the camera when switching. These attributes must only be added after the real support project and aligned full-geometry preview are available and checked. Do not represent a support-enforcer painting or an anatomy-only mesh as generated print support.
