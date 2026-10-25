# Eliguli deployment

Deploy this repository on Vercel with the project name `eliguli` if available. Use another short name only when the provider reports that it is unavailable.

The configuration builds the personal CV as the home page, keeps the prototype at `/antiterrastrae`, and includes every PDF, image and CV download. The website title is `Eliguli`. The existing GitHub Pages routes remain available.

Build locally with `node scripts/build-mirror.mjs`. The output is `dist/`; do not commit generated output.

The host assigns and confirms the final URL during deployment. No new mirror URL is considered live until deployment succeeds. Retire duplicate hosting only after its replacement is accessible and its content has been checked.
