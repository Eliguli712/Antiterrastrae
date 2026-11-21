# R12 source geometry and support mechanics

The source is the uploaded `DoubleCube_CommonPoint_Height100mm(1).stl`, SHA-256
`0520a5e7b449174a31883b816588c8b6383bbe81da1fe240adff2a878c09d922`.
The included clean filename contains the identical 3,684 source bytes.

The source original cube edge is 50 sqrt(2) mm. Uniform factor
52/(50 sqrt(2)) retains the previous 52 mm cube edge and four foot centres.
The source is lifted 7.2 mm so the previously established floor reference
remains at z=0 after foot-sphere clipping. The four corner cuts each occur at
0.50 of the three adjacent original cube edges. Every resulting 3D triangle
side is exactly 36.76955262170048 mm in Float64, and exactly one vertex P is
shared by the four triangles. P is (0,0,80.73910524340096) mm. This replaces
the earlier apex 6 mm higher; tooth and socket translations must match.

Structural rods follow clipped original cube edges and the four cut perimeter
triangles. Polyhedron union seams are not introduced as extra bars. All eight
physical crossing pairs of existing rods are fused into shared frame nodes.
The model therefore has 30 nodes and 52 beam elements. No CT tooth mesh,
internal void surface, or existing tooth stress value is edited here.

Run:

```sh
python build_graph.py
python verify_source.py
OPENBLAS_NUM_THREADS=1 python size_joints.py --cad-model /path/to/measured-support.json
OPENBLAS_NUM_THREADS=1 python mechanics_review.py --support support.json
python diagram_source.py
```

The measured CAD model must contain `cases.50` and `cases.100` with exact
combined main/cap `resin_volume_ml` and `resin_center_mm`. Without this input,
`size_joints.py` reports `CAD_masses_are_measured: false`: these preliminary
weights must be replaced before claiming a final manufactured design solve.
The script independently assembles each tooth-size global frame and the
solid/hollow node submodels; it never linearly scales a smaller stress result.

Sphere radii start at an explicit assumed print constraint: 3.2 mm rod radius
plus 1.2 mm radial solid ligament, i.e. 4.4 mm. The foot floor is derived from
a minimum 3.5 mm contact disk at the retained 7.2 mm foot-centre height:
ceil to 0.1 mm of sqrt(7.2^2 + 3.5^2) = 8.1 mm. The actual clipped disk radius
is consequently greater than 3.5 mm. Each node radius is then increased in
0.1 mm increments only when its trial solid-node FE peak exceeds the assumed
5 MPa design limit. The latter is an assumed nominal 30 MPa strength divided
by material safety factor 3 and local modelling reserve factor 2; none of
these values is a measured resin strength. If all loads are below this
threshold, the manufacturing floor correctly remains the governing radius
for both scales. Overlapping finite-area load patches represent fused nearby
rod branches and are allowed to superpose, especially at the eight-branch P.
Requiring eight separate patches would force a huge sphere that obscures the
specified four triangles.

The global primary study uses the requested Euler–Bernoulli beams with four
foot translations pinned and rotations free, CAD mass/centroid calibrated
self-weight and 3x gravity applied to each independently integrated native
printed PLA tooth mass. Each actual native material centroid introduces its
own eccentric gravity moment at P. Material examples assume E=1375 MPa,
nu=0.38 and support density 1.18 g/cm3; the native tooth properties assume PLA
density 1.24 g/cm3. These assumptions are explicit and do not represent
measurement of a fossil's actual mass or a resin batch.

Every member has L/d<10 (minimum 1.6827), and maximum transverse-shear
parameter phi is 0.8123. The supplementary Timoshenko solve quantifies this
model sensitivity. Neither beam study resolves detailed socket contact,
fasteners, adhesion, creep, fracture, or fully coupled solid joint geometry.
The local node study is balanced-traction 3D linear P1 tetrahedral elasticity
with a solid printed node and a separate 1.2 mm hollow research variant. It is
not an implementation of Chien's thin-shell equations. Its discretized peak
stresses have not passed a mesh-convergence certification. No physical fit,
pull-out, strength or print test is claimed.

`diagram-common-apex.svg` and `.png` project the actual source-derived node
coordinates. Top-view side labels explicitly refer to 3D edge lengths:
planar projection does not preserve their equilateral angles. Joint circles
in this explanatory diagram mark exact centres and are schematic in radius.

## Final exact-CAD calibration

The final run used the manufactured main/cap source hashes recorded in
`radius-design.json` under `CAD_provenance`. All nominal radii remain at their
manufacturing/contact floors after both independent solid-node stress
checks. This is an expected low-load result, not evidence that the radii were
chosen by a hidden scale multiplier.

| Tooth | Combined support volume | Support mass at assumed density | Euler beam peak | Solid-node trial peak | Euler maximum translation |
| --- | --- | --- | --- | --- | --- |
| 50 mm | 54.419584204 ml | 64.215109360 g | 0.027106426 MPa | 0.016448473 MPa | 0.001232543 mm |
| 100 mm | 80.213287072 ml | 94.651678745 g | 0.114104622 MPa | 0.163384824 MPa | 0.005456036 mm |

The shear-sensitive Timoshenko comparison changes maximum translation to
0.001434196 mm and 0.006369758 mm, respectively (16.36% and 16.75% above
Euler). The two separate 1.2 mm hollow research node cases have trial peaks
0.027535778 MPa and 0.249710971 MPa. Hollow nodes are not the printed master.

The final 50 mm manufactured frame includes a conservative cap-withdrawal
relief close to the root. Actual volume/centroid calibration includes that
relief, while the requested idealized frame uses the preserved centreline
network. Likewise, local foot node submodels use full spheres and do not
resolve the manufactured flat foot clipping. These geometry reductions must
remain disclosed beside the mechanics results.

`mechanics-validation.json` records all final algebraic checks, geometry
registration, source/result hashes and limitations. Both global frames pass
force, moment, stiffness symmetry and strain-energy checks. All 120 one-way
node submodels pass their free-DOF residual and gauge-reaction checks.
