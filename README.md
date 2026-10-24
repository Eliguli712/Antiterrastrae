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
