# Source-correct R12 support: minimum printing height

Each supplied STL is complete. The two `assembly` files contain the main frame and removable front cap in their assembled positions. They are independent printable parts in one file, not a Boolean-fused permanent cap. Tooth, screws, generated print supports and raft are excluded.

The new frame follows the uploaded half-edge-trimmed dual-cube source: 52 mm cube edge, four equilateral triangular loops meeting at one common apex, eight fused rod crossings, and stress/manufacturing-derived spherical-node radii. The final manufacturing inputs are recorded by exact SHA-256 in every JSON result.

## Archive contents

The compact ZIP contains **both requested combined frame + front-cap minimum-height STL files**, one for the 5 cm tooth and one for the 10 cm tooth. It also includes all six numerical records, CSV, source-input hashes, comparison figures, strict export audits and reproducible source code. Individual main-frame and front-cap oriented STLs remain separate downloads on the website. This avoids packaging duplicate copies of the same complete parts twice.

## Result and scope

The minimum vertical extent is optimized over all print-axis directions on the unit sphere. Independent parts receive independent rotations. The `assembly` orientations preserve the assembled part positions. XY rotation and packing have not been optimized. Minimum geometric height does not certify adhesion, stable printing, support-free fabrication, resin drainage, material strength, or a particular slicer setup.

The full original valid STL surface defines every numerical height certificate. A proper rigid rotation and translation are applied. Binary STL remains float32; coordinate re-encoding error and actual exported height are reported. XY centring improves precision. If rotation causes microscopic coincident-vertex/zero-area collapses, only coincident positions at six decimal places are welded and exact zero-area facets are removed. The surviving faces keep their original relative order and attribute words. Each JSON lists any removed face indices, weld count and actual maximum coordinate change. No visual mesh decimation or hole filling is performed. All downloadable exports are checked for watertightness, consistent winding, valid edge incidence, zero degenerate faces and the expected one or two components.

## Numerical method

A convex-hull direction set, spherical seeds and local minimization propose upper bounds. They are followed by an independent branch-and-bound covering all eight octants of the unit sphere. Bounds use actual source vertex differences and enclosing spherical caps; upper bounds are rechecked over every source STL vertex. These bounds concern the unmodified original manufacturing surface; the separately audited binary export may differ by the recorded microscopic float32 cleanup and quantization errors. The largest final lower/upper height gap is below 0.00001 mm. Arithmetic uses long double and an explicit 1e-9 mm dot-product allowance. These are numerical certificates, not exact rational or formally verified interval proofs.

Analytic regression checks cover a rotated cube, a rotated thin rectangular box, a regular tetrahedron and a regular octahedron. The test results accompany this package.

Related original reference: M. E. Houle and G. T. Toussaint (1988), *Computing the width of a set*. Original paper: https://cgm.cs.mcgill.ca/~godfried/publications/width.pdf . The included implementation uses the independently described spherical numerical bounds rather than claiming an exhaustive edge-pair implementation of that paper.

## Recompute

Install Python 3, NumPy, SciPy and Pillow, plus a C++17 compiler. Trimesh and NetworkX are used for the strict binary-export topology checks. Obtain the four original `Support_R12_{50,100}mm_{main,cap}.stl` manufacturing files from the support design download on the website. Check them against `source-inputs.json`.

```sh
python SOURCE/recompute.py --support-dir /absolute/path/to/manufacturing_STLs --output-dir /absolute/path/to/recomputed --figures
```

The script compiles the solver, solves all six cases, exports complete oriented STLs and optionally generates the full-STL comparison figures. No external solver, browser or downloaded mesh approximation is used.

Figures render every supplied manufacturing STL triangle using flat per-face shading. The floor and XY centring are display aids. They are not a physical resin rendering or a rendered convex-hull replacement.
