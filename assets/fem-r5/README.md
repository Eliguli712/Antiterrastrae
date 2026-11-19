# Independent 50 mm / 100 mm tooth FEM

Both size variants were constructed with the exact native-surface longitudinal dimension as the nominal 50 mm / 100 mm length. The separate closed-solid FEM proxy spans slightly less in the same direction; both actual dimensions are recorded. Each refinement and size assembled its stiffness matrix and pressure vector and solved again. Saved or rescaled stress/displacement answers were never used.

The homogeneous isotropic linear elastic constants are lambda = 29 GPa and mu = 28.5 GPa (E = 71.373913 GPa, nu = 0.252173913). They are assumptions retained from the existing pressure experiment. Crown-face pressure is 1 MPa. Bilateral root-cap volumes constrain all three displacement components. Body forces are omitted.

The macroscopic apex ROI is the fixed union of 730 calibrated L0 tetrahedra. Every adaptive child inherits its L0 parent by a checked containment lookup, preserving physical ROI volume. Convergence requires the inverse volume-weighted Q95, Q99 and integrated strain energy each to change by less than 2% on two consecutive refinements.

| Native nominal size | Proxy axial extent | Volume tetrahedra | Tip Q95 | Tip Q99 | Final Q95 change | Final Q99 change |
|---|---:|---:|---:|---:|---:|---:|
| 50 mm | 49.954139869 mm | 948,322 | 0.531309436 MPa | 0.706580418 MPa | 0.09511% | 0.08026% |
| 100 mm | 99.908279738 mm | 1,073,103 | 0.529341647 MPa | 0.702684834 MPa | 0.02196% | 0.24607% |

The 74,293,846-triangle native CT surface is a separate visualization and manufacturing geometry with internal void boundaries. These FEM fields were solved on the archived closed-solid proxy. Projection of the field onto the complete CT surface does not turn its triangle count into a volume-element count or resolve omitted pores and individual serration anatomy. The reported convergence applies to the frozen macroscopic apex ROI on that unchanged proxy; it is not a claim of globally converged pointwise peak stress, contact convergence or fracture prediction.

The NPZ files preserve SI coordinates and displacement (m), element von Mises stress (Pa), element volumes (m^3), tetrahedron and boundary connectivity, fixed nodes, loaded-face indices, exact L0 parent IDs and tip-cell IDs. JSON and CSV summaries use explicit mm / N / MPa units. The mass example uses a stated nominal PLA density of 1.24 g/cm^3 on the mechanical proxy; native CT print mass and slicer infill must be evaluated separately.

To reproduce after downloading and hash-checking the pinned input files listed in input-manifest.json:

```sh
python -m pip install -r requirements.txt
python solve_sizes.py --inputs PATH_TO_INPUTS --output RESULTS --size 50 --max-level 6
python solve_sizes.py --inputs PATH_TO_INPUTS --output RESULTS --size 100 --max-level 6
```

The default native height of 51.63315333301228 mm was measured over all native CT vertices in the frozen principal-axis frame. Each solution uses corrected scanner coordinates multiplied by size / native_height. The source-to-solution SI transform is saved in each size summary.
