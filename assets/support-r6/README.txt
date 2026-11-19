Otodus megalodon — R6 support design and calculation
Units: millimetres, newtons, megapascals.

The unchanged lower frame is 84.939102 mm across both horizontal axes.
The 50 mm and 100 mm teeth receive separately generated split sockets.
Nominal root gaps: 0.35 mm / 0.45 mm. Cap/frame axis allowance: 0.12 mm.
Two upper equilateral bevel bands; every graph endpoint has a sphere.
The four STL parts are connected, consistently oriented and watertight.
Use the main frame and matching front cap at 100% scale in millimetres.
Fastener holes: 2.9 mm nominal; screw contact and retention remain untested.

The digital fit test uses the explicitly recorded sampled tooling envelope,
not an exact collision certification against all 74,293,846 native faces.
The root tool envelope is derived at 72 um; the original 18 um CT and all
native tooth downloads remain unchanged. Actual print shrinkage, fit,
clamping force, friction, creep and impact capacity have not been tested.

Support mechanics: Euler–Bernoulli frame, assumed effective resin E=1375 MPa,
nu=0.38, density=1.18 g/cm3. Distributed beam/node weights are scaled to match exact CAD mass, with a
connector couple correcting total gravitational moment. Local self-weight
distribution remains idealized. A 3g tooth gravity load is applied. Tooth masses assume solid PLA 1.24g/cm3.
This gravity load differs from the earlier crown-pressure tooth study.
Spherical nodes: balanced finite-area load patches in one-way 3D elasticity
submodels. Solid nodes match the design reference; a 1.2mm hollow-wall case
is a distinct research comparison. Its t/R is too large to assert thin-shell
accuracy without comparison. Chien shell equations are not implemented.
Short connector beams violate the slender-beam premise; per-member shear
parameters are included. No local joint peak convergence is claimed.
The top bevel plates, split socket and screw contact are not resolved by
the global beam idealization. It is a screening calculation, not strength
certification of the complete manufactured support.

Full native porous tooth FEM is NOT completed. The earlier independent
closed-solid tooth solutions retain their original labels. Native pore,
boundary-layer and filled-material requests require distinct audited meshes
and native-resolution distributed solves. See native-feasibility.json.

Primary sources:
Euler, 1744, De curvis elasticis (Appendix I):
https://scholarlycommons.pacific.edu/euler-works/65/
Complete English translation (1933):
https://boulderschool.yale.edu/sites/default/files/files/euler_1744.pdf
Chien, 1944, intrinsic shell theory I: https://doi.org/10.1090/qam/9744
Chien, 1944, intrinsic shell theory III: https://doi.org/10.1090/qam/10867
von Karman & Tsien, 1939, spheres: https://doi.org/10.2514/8.1019
von Karman & Tsien, 1941, cylinders: https://doi.org/10.2514/8.10722
Cylinder paper reprint: https://phoogenboom.nl/b17_paper_Von_Karman.pdf
Wittrick, 1964, shell edge stresses:
https://doi.org/10.1016/0020-7225(64)90002-3

Reproduction scripts are included. They require numpy, scipy, trimesh,
manifold3d and scikit-image. Build support with --mask pointing to the
recorded 72 um sampled tooling array. This array is a tooling intermediate;
it must never be used as the source of a native porous tooth FEM claim.
