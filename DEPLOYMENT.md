# Eliguli deployment

Deploy this repository on Vercel with the project name `eliguli` if available. Use another short name only when the provider reports that it is unavailable.

The configuration builds the personal CV as the home page, keeps the prototype at `/antiterrastrae`, and includes every PDF, image and CV download. The CV title, markup and links are copied without modification: GitHub Pages `/Antiterrastrae/cv.html`, Vercel `/cv.html`, and Vercel `/` serve identical HTML. The existing GitHub Pages routes remain available.

Build locally with `node scripts/build-mirror.mjs`. The output is `dist/`; do not commit generated output.

The research directory redirects to `/fea_research/high_res_meg_teeth/archive` on Vercel. The build creates `archive.html` from the unchanged research `index.html`, so clean URLs retain a filename segment and relative scripts, images, worker files and data resolve inside the research directory. Verify these resource requests in the browser as well as the HTML hash.

The host assigns and confirms the final URL during deployment. No new mirror URL is considered live until deployment succeeds. Retire duplicate hosting only after its replacement is accessible and its content has been checked.

Deploy the same Git commit to both hosts. After deployment, compare SHA-256 hashes of the public CV pages and anatomy plate images against the source files. Publish model download links only after the corresponding model files are available and checked.

## Papers, readers and card backs

`publications/catalog.json` records each complete PDF's original filename, byte count, page count and SHA-256. Run `python3 scripts/build-publications.py` after adding a document. The uploaded `K_class_q_copy_m_slot_markov_symmetry_report.pdf` is always appended last. Preserve its actual filename and original bytes.

All paper reading links use `publications/reader.html?paper=<catalog-id>`. Its persistent `../cv.html#paper-<catalog-id>` return link stays on the current host, for both GitHub Pages' repository prefix and Vercel's root. PDF.js, fonts and workers are vendored locally, and complete PDFs are available for download. The inline readers are loaded only while an entry is expanded. Original report editions remain distinct.

Card back text is in `assets/portfolio/cards.json`; the supplied front JPEGs remain unchanged. Open a card in the full-image viewer and click the image or Flip card; Enter/Space on the front and the explicit flip button are supported. Closing or selecting a new work resets the card to its front.

Before publishing, build the mirror and run `python3 -m unittest discover -s tests -v` with Python Playwright and `/usr/bin/chromium` installed. The checks render the first and last pages of every PDF in both layouts, verify same-layout CV return links and unchanged downloads, and exercise inline disclosures plus card fronts/backs at desktop and phone widths.

The 3D viewer accepts `data-support-src` (a complete source model with its available textures plus separate support geometry) and `data-support-download` (the actual PrusaSlicer project). Its Display support control preserves the camera when switching. These attributes must only be added after the real support project and aligned full-geometry preview are available and checked. Do not represent a support-enforcer painting or an anatomy-only mesh as generated print support.

The author-supplied `Cynthiacetus_Skull_Supports_1-20.3mf` is now connected in a
separate **1:20** view, with its original bytes preserved. Its embedded printer
technology is FFF. Actual organic-support and raft extrusion paths were generated
with PrusaSlicer 2.7.4 and exported alongside every source anatomy triangle. The
untextured project uses a neutral display finish, identified through
`data-appearance`; the existing 1:10 Opal models keep their original textures.
See `downloads/cynthiacetus/README.md` for provenance and reproduction commands.

## Publishing and checking the actual sites

`.github/workflows/verify-sites.yml` runs on `main` pushes and manual dispatches.
It uses a GitHub-hosted runner's standard HTTPS networking, builds the mirror,
and runs the local browser/geometry checks. It then checks the actual URLs:

- `https://eliguli712.github.io/Antiterrastrae/`
- `https://eliguli.vercel.app/`

For each site, the live checker compares the public CV, complete paper catalog,
all paper PDFs, uploaded print project, scripts and support parts against the
selected source commit. It also opens the actual deployed application in a
phone-width Chromium browser, renders the first and last pages of the uploaded
18-page report, follows its same-site CV return link, flips both cards, and
shows/hides the complete support model. HTTP 200 with stale content fails.

GitHub Pages continues using its existing branch publishing configuration.
If the repository's Actions secret `VERCEL_TOKEN` is available, the workflow
looks up and links the existing `eliguli` project and runs the official pinned
Vercel CLI production build/deploy flow. It never creates a replacement project.
For a scoped team project, supply `VERCEL_ORG_ID` as an Actions secret or variable.
Enter credentials only in secure repository settings. If no token is present,
the Vercel deployment step is skipped and the checker still verifies whether an
existing Git integration has published the correct content.

The current cloud worker's saved configuration draft and its live proxy policy
are separate from this workflow. Saving a domain or secret requirement does not
apply it to the cloud machine or populate repository Actions secrets.

The result is retained as a workflow artifact and as `verification.json` on the
separate `deployment-verification` branch. It includes the source commit, actual
file hashes, browser outcomes, run URL and token-presence status; no token values
are recorded. A failed check stays failed. Do not call either site verified
until the matching commit's report records success for both sites.

To inspect the evidence using the existing Git connection:

```bash
git fetch origin deployment-verification
git show FETCH_HEAD:verification.json
```

Install test tools with `python3 -m pip install -r requirements-dev.txt` and
`python3 -m playwright install chromium`. The tests use system Chromium when
available, Playwright's installed browser otherwise, or the explicit
`CV_CHROMIUM_EXECUTABLE` selector.
