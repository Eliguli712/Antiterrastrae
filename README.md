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

The archived colored CT source has 32,687,264 triangles. The archived COMSOL viewer uses Pa; the revised Table 9 comparison uses MPa and its separate verified solution. Colored 3MF paper appearance contains no numerical stress values. Source hashes and geometry counts are recorded in the archive’s `provenance.json`.

## Table 9 comparison and original CT downloads

The research CV links to the [side-by-side von Mises / Q archive](https://eliguli712.github.io/Antiterrastrae/fea_research/high_res_meg_teeth/). A [selectable version](https://eliguli712.github.io/Antiterrastrae/fea_research/high_res_meg_teeth/selectable.html) switches visualization type. Display, appearance, resolution and percentile have separate selectors. Simplified uses the exact previous-edition data, preserved in `previous-edition.html`. Full projects the saved field and frozen region labels onto **all 31,999,434 source CT triangles** (307 MB compressed, no face decimation). An interaction preview appears during loading and dragging. This is a display projection, not a new FE solve or recalculation of Q.

The revised Table 9 was independently checked against the raw element stresses, region masks, CSV and revised paper. It is a new pressure experiment, not a reproduction of the withdrawn original table. The earlier report and archived COMSOL viewer remain available.

Expandable 3D viewers show the original natural-colored 3MF and the named 32M / native 74M reconstructions. The default is natural fossil color. The original colored source has embedded colors; 18 µm reconstructions use registered color projections and retain their unchanged geometry-only source downloads. Browser reconstruction previews are connected reduced 3D meshes, with source/display face counts stated explicitly.

All four unchanged sources, including the lossless MHA, are available in the [CT release](https://github.com/Eliguli712/Antiterrastrae/releases/tag/megalodon-ct-18um). Uploaded digests match local SHA-256 records.
