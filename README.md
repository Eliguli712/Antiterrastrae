# Antiterrastrae

Interactive volumetric biosonar and scientific visualization prototype by Eliguli Han.

**Public demo:** https://eliguli712.github.io/Antiterrastrae/

The simulation is a self-contained static HTML application. It runs in the browser without a ChatGPT account, an API key, a backend, or a build step.

## Run

Open `index.html` in a browser and select **Start simulation**. Tap or click the scene to emit sonar; drag to rotate the view. The parameter sliders adjust the acoustic and environmental settings. **quiescent** pauses and resumes the simulation.

Serve the directory with any static web server for mobile browser access. GitHub Pages can publish the `main` branch from the repository root.

## Files

- `index.html`: full simulation, including the meshes, numerical code and browser controls.
- `cv.html`: English research CV, project figures and personal art portfolio.
- `cv.pdf`: printable research CV.
- `.nojekyll`: serves these files directly on GitHub Pages.
- `assets/portfolio/`: original supplied project figures, personal emblem and artworks.

The prototype combines three-dimensional surface and volumetric geometry, acoustic propagation and echo rendering, and a tetrahedral finite-element module for scalar acoustic eigenmodes. It is an exploratory research and visualization project.

## Research CV and visual portfolio

Open [the research CV and portfolio](https://eliguli712.github.io/Antiterrastrae/cv.html) for the personal geometric emblem, Cynthiacetus cranial visualization in English, Greek and German, the **Yi qi (奇翼龙) reconstruction**, and Zygophyseter / Coronodon card concepts. Images retain their original proportions and bytes. Select an image to view it at full size. Word, Markdown and PDF downloads contain the research CV.

The **Research Publications** panel lists current research projects and their work-in-progress status above Education. The [English works directory](https://eliguli712.github.io/Antiterrastrae/publications/research-index.html) imports every entry in the supplied 1 November 2026 index: 29 main manuscripts, 223 PDF entries and 3 source archives in 51 groups. Reference literature and creative work have their own labels. Search, category filters and expandable version lists operate locally. The 12 hosted complete papers have same-site readers and original PDF downloads; other versions retain their account-dependent ChatGPT Library links. Importing the index does not publish the bodies of private library files.

Both card viewers use the unchanged pages of the supplied `assets/portfolio/card-backs/CardBack.pdf`, rendered to 1000 × 1400 PNGs. **Open full-size flip view** opens the original front and supplied back with click-to-flip, keyboard controls, actual size and downloads. Complete original card notes remain available below the back. `provenance.json` records source and page-image hashes.

To rebuild the English directory, run `python scripts/build-work-directory.py`, then `python scripts/build-publications.py`. To refresh the CV's PDF, Word and Markdown download controls, use `python scripts/build-cv-downloads.py` with Pandoc and Chromium installed. `node scripts/build-mirror.mjs` copies the resulting assets and identical CV HTML to the Vercel output. Serve `cv.html` with its sibling `assets`, `publications`, `downloads` and research directories; it is the final CV entry document.

## Visual and interactive portfolio

The [portfolio wall](https://eliguli712.github.io/Antiterrastrae/cv.html#artworks) groups paleontological reconstruction, cetacean card design and interactive cartography. Category filters use native HTML radio controls and CSS. The image viewer stays within the selected group. The [Moling Atlas](https://eliguli712.github.io/moling-atlas-mobile/) preview is downsampled from the project's published Jiankang–Moling map export; the interactive application opens separately.

## Full-resolution megalodon research archive

The [research CV](https://eliguli712.github.io/Antiterrastrae/cv.html#high-res-meg-teeth) links to the [archived COMSOL solver view](https://eliguli712.github.io/Antiterrastrae/fea_research/high_res_meg_teeth/). Detailed displays every one of the 32,687,264 original colored-source triangles with the archived COMSOL field in Pa or embedded appearance colors. Light displays about 420K faces. Browser transfer quantization is recorded in the source manifest; original 3MF downloads are unchanged.

The separate [Von Mises & regional Q_F comparison](https://eliguli712.github.io/Antiterrastrae/fea_research/high_res_meg_teeth/comparison.html) and [selectable version](https://eliguli712.github.io/Antiterrastrae/fea_research/high_res_meg_teeth/selectable.html) use the current nine-page paper's saved, calibrated 18 µm L2 pressure experiment. All 18 primary volume-weighted inverse-CDF values were checked against the 963,710 raw element stresses, physical volumes and frozen masks. The full display projects those saved results onto all 31,999,434 CT triangles; it does not run a new FE solve. CT vertices inherit the nearest saved element's stress and region label.

The primary [nine-page paper](https://eliguli712.github.io/Antiterrastrae/publications/megalodon-9page-report.pdf) includes direct downloads for the 32M 18 µm reconstruction and unreduced native 74M 3MF. Earlier 20-page and 26-page editions appear beneath it on the website. Original source files, including the natural-colored 3MF and lossless MHA, are preserved with verified SHA-256 digests in the [CT release](https://github.com/Eliguli712/Antiterrastrae/releases/tag/megalodon-ct-18um).

Expandable model viewers offer 420K-face Light displays and complete named 32M Detailed sources. The native panel explicitly distinguishes its 32M detailed display from the unchanged 74,293,846-face native download. The naturally colored original and calibrated 18 µm reconstructions use distinct source frames, which are documented in `provenance.json`.

Shared controls support mouse, one- and two-finger orbit, pinch zoom, trackpad gestures, Safari gesture fallback and keyboard camera control. Viewport projection updates on resize and device rotation. Workers decode gzip, validate source chunk hashes, retry interrupted requests and compute projection colors without blocking the UI. Light uses portable 16-bit index batches; offscreen GPU buffers are released and interrupted WebGL contexts rebuild their buffers.

Historical COMSOL and earlier equal-element pressure-case views remain at `legacy-von-mises.html`, `previous-edition.html` and `previous-pressure-case.html`; these are distinct from the current Q_F experiment.
