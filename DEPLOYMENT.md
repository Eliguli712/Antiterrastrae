# Eliguli deployment

Deploy this repository on Vercel with the project name `eliguli` if available. Use another short name only when the provider reports that it is unavailable.

The configuration builds the personal CV as the home page, keeps the prototype at `/antiterrastrae`, and includes every PDF, image and CV download. The CV title, markup and links are copied without modification: GitHub Pages `/Antiterrastrae/cv.html`, Vercel `/cv.html`, and Vercel `/` serve identical HTML. The existing GitHub Pages routes remain available.

Build locally with `node scripts/build-mirror.mjs`. The output is `dist/`; do not commit generated output.

The research directory redirects to `/fea_research/high_res_meg_teeth/archive` on Vercel. The build creates `archive.html` from the unchanged research `index.html`, so clean URLs retain a filename segment and relative scripts, images, worker files and data resolve inside the research directory. Verify these resource requests in the browser as well as the HTML hash.

The host assigns and confirms the final URL during deployment. No new mirror URL is considered live until deployment succeeds. Retire duplicate hosting only after its replacement is accessible and its content has been checked.

Deploy the same Git commit to both hosts. After deployment, compare SHA-256 hashes of the public CV pages and anatomy plate images against the source files. Publish model download links only after the corresponding model files are available and checked.
