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

## Visual and interactive portfolio

The [portfolio wall](https://eliguli712.github.io/Antiterrastrae/cv.html#artworks) groups paleontological reconstruction, cetacean card design and interactive cartography. Category filters use native HTML radio controls and CSS. The image viewer stays within the selected group. The [Moling Atlas](https://eliguli712.github.io/moling-atlas-mobile/) preview is downsampled from the project's published Jiankang–Moling map export; the interactive application opens separately.

## Full-resolution megalodon tooth archive

Open [the tooth viewer and figure gallery](https://eliguli712.github.io/Antiterrastrae/fea_research/high_res_meg_teeth/), also linked beneath the megalodon research report on the CV. Top controls switch continuous/scattered rendering and numerical, paper-reference or natural appearance. The page includes source plates and the original supplied GIF.

The full CT source models have 32,687,264 triangles; browser meshes and point clouds are reduced displays. Quantitative Pa values belong only to the saved COMSOL field. The colored 3MF paper appearance does not contain numerical stress values. See the archive’s `provenance.json` for geometry counts and source hashes. Full-resolution 3MF packages are preserved in the research source archive and are not copied into the web preview.

## Table 9 comparison and original 18 µm downloads

The CV embeds the [side-by-side von Mises / Q viewer](https://eliguli712.github.io/Antiterrastrae/fea_research/high_res_meg_teeth/). A second [selectable version](https://eliguli712.github.io/Antiterrastrae/fea_research/high_res_meg_teeth/selectable.html) switches visualization type. Independent select boxes choose display, appearance, calculation resolution and Q percentile. Full calculation display uses the complete saved solver boundary or all element centroids; it is distinct from the browser previews of the much larger CT reconstructions.

The revised Table 9 was independently checked against the raw full element stresses, region masks, CSV and revised paper. It is a new pressure experiment, not a reproduction of the withdrawn original table. The earlier report and archived COMSOL viewer remain available.

Original 32M / native 74M 18 µm 3MF files and the lossless MHA are preserved under their exact names in the [CT release](https://github.com/Eliguli712/Antiterrastrae/releases/tag/megalodon-ct-18um). Uploaded digests match local SHA-256 records. The reconstruction sources have no embedded colors; their original neutral appearance and optional registered fossil-reference colors are shown separately. The CT browser meshes are always labeled reduced previews.
