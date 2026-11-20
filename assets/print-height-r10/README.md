# Minimum manufacturing height of the complete R8 supports

This calculation uses every triangle of the supplied R8 manufacturing STL
files. It does not replace the support by ball centres, feet, a centreline
frame or a reduced display mesh. Exact duplicate vertex tuples are
deduplicated only for support-function calculations. The downloaded oriented
STLs retain every original triangle.

## Scope

For each 50 mm and 100 mm design, results are supplied for the main support,
front cap, and the two parts in their original assembled positions. The
assembly file preserves both meshes; no union or fusion is performed. Tooth,
metal hardware, generated printing supports and raft layers are excluded.
The objective is geometric vertical extent. Print-bed dimensions, lateral
packing, overhangs, adhesion and mechanical stability are not optimized.
The results describe the actual faceted STL geometry, not an unexported
analytic CAD sphere.

## Complete finite candidate enumeration

For unit print axis n, the height is

    w(n) = max_p p·n - min_p p·n.

Projection is linear on every triangle; therefore its extrema occur at
triangle vertices. Its value is also identical on the convex hull. Houle and
Toussaint's Theorem 3.1 identifies the three-dimensional minimum-width
support pairs: vertex–face or nonparallel edge–edge. We enumerate every
triangulated convex-hull face normal and every nonparallel pair of hull
triangle edges. Coplanar internal diagonals are retained as redundant
candidates. No antipodal test removes a direction. A separate tolerance-based
contact test merely counts antipodal edge pairs.

All face normals are constructed from exact dyadic STL coordinates with
unbounded integer cross products. Near-parallel edge pairs likewise receive
exact integer cross products before normalization. Normalization and extent
evaluation use floating-point arithmetic; this is not an exact-rational
optimization claim.

## Independent whole-sphere certificate

The following lower-bound verification is independent of whether Qhull's
combinatorial hull is exact. Let H be the subset of actual STL vertices
selected for the hull. Then w_K(n) >= w_H(n) for the full vertex set K.
If D is an upper bound on the diameter of H, its width satisfies

    |w_H(n) - w_H(c)| <= D ||n-c||.

This follows by writing width as the support function of H-H; each difference
vector has norm at most D. A spherical triangle with unit vertices a,b,d and
centre c = normalize(a+b+d) is contained in the spherical cap whose radius
in chord distance is sqrt(2-2 min(c·a,c·b,c·d)). All cap dot products are
positive for these cells, so the containment also holds for every normalized
positive linear combination of the vertices.

Consequently each cell has valid lower bound

    LB = w_H(c) - D * chord_radius - arithmetic_allowance.

Eight initial octant triangles cover the entire unit sphere. Each retained
triangle is split into four by normalized great-circle edge midpoints.
Cells are discarded only when their lower bound is at least UB-tolerance.
UB is a complete-original-STL height, evaluated at the best enumerated axis.
The recorded minimum of all retained/pruned lower bounds and UB encloses
the global optimum. Every case is closed to at most 0.00001 mm.

The implementation uses long double for the bounds. It inflates the diameter
by 1e-9 mm, each chord radius by 1e-12, lowers every projection bound by
1e-9 mm and raises UB by 1e-9 mm. These margins dominate the ordinary forward
error of 3-term dot products at this model scale. The certificate is a
floating-point computational bound with a stated conservative arithmetic
allowance, not a formally verified exact-rational interval computation.

## Orientation and export

For each case the JSON supplies a proper rotation R and placement t, using
column vectors:

    p_print = R @ p_source + t.

The third row of R is `print_axis_in_source_coordinates`. The exported STL's
minimum x, y and z are placed at zero. Among equal-height opposite axes, the
tie-break prefers a higher-dimensional bottom contact, then more contact
vertices; this does not constitute a stability analysis. Rotation about the
chosen height axis is fixed deterministically rather than optimized for XY
packing. Normal vectors are rotated, triangle order/count are retained, and
the original zero STL attribute words remain zero. Standard STL float32
re-encoding produces the separately recorded nanometre-scale coordinate and
height rounding changes. The full-precision transform is preserved in JSON.

## Reproduction

Dependencies: Python, NumPy, SciPy and a C++17 compiler; Matplotlib is also
needed for the optional comparison figures. No geometric mesh library is
required. Compile and run:

    g++ -O3 -std=c++17 min_width.cpp -o min_width
    python solve_print_height.py --input-dir /path/to/R8/STLs --output-dir results --tolerance-mm 0.00001

Round-trip verification and full-triangle scientific figures can then be
reproduced with:

    python verify_results.py --input-dir /path/to/R8/STLs --output-dir results
    python render_figures.py --input-dir /path/to/R8/STLs --output-dir results

The figures show the actual open lattice and root socket using every
original triangle, with simple mathematical face-normal shading. They are
not renders of a convex-hull solid or a physical resin material.

Keep these exact filenames in the input directory:

    Support_R8_50mm_main.stl
    Support_R8_50mm_cap.stl
    Support_R8_100mm_main.stl
    Support_R8_100mm_cap.stl

The original source SHA-256 values are recorded with every result. Analytic
validation uses a 2×3×4 box (minimum width 2) and a regular tetrahedron whose
minimum width 2 occurs at an edge–edge pair; its face-normal width is larger.
This specifically checks that face-only orientation searches are insufficient
in general.

## Original sources

Michael E. Houle and Godfried Toussaint, *Computing the Width of a Set*,
IEEE Transactions on Pattern Analysis and Machine Intelligence 10(5),
761–765 (1988), DOI 10.1109/34.6790.

- Author-hosted paper, Theorem 3.1 / Corollary 3.1:
  https://cgm.cs.mcgill.ca/~godfried/publications/width.pdf
- Author's publication record:
  https://cgm.cs.mcgill.ca/~godfried/cv/journal.cv.html
- Publisher DOI:
  https://doi.org/10.1109/34.6790
- Earlier conference version, SCG 1985, pages 1–7:
  https://doi.org/10.1145/323233.323234
