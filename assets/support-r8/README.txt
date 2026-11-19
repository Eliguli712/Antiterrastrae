Otodus megalodon — R8 restored support and mechanics
Units: mm, N, MPa. Resin assumptions: E 1375 MPa, nu 0.38, density 1.18 g/cm3.

100 mm restores the actual original R2.1 manufacturing STL masters, without
redrawing the support from a screenshot. The restored original single terminal
corner transition has no added repeated R6 upper bevel rings. Its graph has
18 nodes and 28 Euler–Bernoulli beams. Packed display geometry preserves every
restored STL triangle. Original split root socket and nominal 0.45 mm clearance
are retained. Root capture height: 40 mm.

50 mm preserves the independently fitted R6 main and front-cap geometry,
including its two existing equilateral bevel bands. Its graph has 27 nodes
and 50 beams. Nominal root clearance: 0.35 mm; capture height: 20 mm.
The lower frame remains 84.939102 mm across both horizontal axes for both sizes.
Every graph endpoint is covered by a spherical node. The four separate STL
parts are connected, consistently oriented and watertight. Print at 100% in mm.

Both sizes have independently recomputed 3D Euler–Bernoulli frame assemblies,
including distributed beam/node self-weight scaled to exact CAD mass and a
connector couple matching the CAD gravitational moment. Tooth gravity is
3 × g; masses assume solid PLA at 1.24 g/cm3. This load case differs from the
tooth's independent 1 MPa crown-pressure study. Translational foot DOFs are
fixed; foot rotations are free. Material properties remain assumptions.

Solid and 1.2 mm hollow-wall spherical-node studies were recomputed for the
actual per-size beam resultants using balanced finite connection patches.
They are one-way 3D elasticity submodels, not a coupled contact model or an
implementation of Chien thin-shell equations. Their t/R is too large to claim
thin-shell accuracy without comparison. No local peak convergence is claimed.
Short connector members require a shear-sensitive comparison; per-member phi
values are included. Socket, bevel-plate, screw, friction, creep and failure
details are excluded from the global beam idealization. Hardware mass is not
added to this baseline comparison.

CAD fit records identify their real reference geometry. The 100 mm fit retest
uses the archived 41,180-face display/tooling tooth; the 50 mm original tooling
test is retained because its geometry is unchanged. These are not complete
74M-face collision certifications. Physical clamp retention remains untested.
Original native tooth geometry, tooth stress values and independent tooth FEM
solutions are unchanged. Native porous-volume tooth FEM is not completed.

The included 100 mm R8 STL files themselves are byte-for-byte copies of the
original manufacturing masters, so no duplicate master is necessary. Source
scripts and exact source checksums are included. For a self-contained mechanics
reproduction, install scripts/requirements.txt and run:
python scripts/recompute_mechanics.py
This re-measures the four supplied STL parts, reassembles both beam systems,
and solves all 90 spherical-node submodels. The tiny per-size tooth property
records needed for gravity are included under dist/assets/fem-r5/.
The separate historical build_restoration.py records how the previous source
archives were restored; it expects those original archive paths. For normal
use, the included four STL parts are already the restored manufacturing masters.

Original theory:
Euler 1744: https://scholarlycommons.pacific.edu/euler-works/65/
Chien 1944 I: https://doi.org/10.1090/qam/9744
Chien 1944 III: https://doi.org/10.1090/qam/10867
Wittrick 1964: https://doi.org/10.1016/0020-7225(64)90002-3
