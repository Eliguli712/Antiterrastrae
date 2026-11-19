Native details regression R9

Run with Node.js and the matching Three.js dependency available to design/megalodon. Pass local directories containing the complete native geometry chunks and geometry.json, the R7 scalar chunks for both sizes, the R7 field metadata, and an output JSON path.

node validation/native-details-regression.mjs GEOMETRY_DIRECTORY FIELD_DIRECTORY METADATA_DIRECTORY AUDIT_OUTPUT.json

The test uses the real Three.js upload callbacks and post-upload bounds calculations with a renderer adapter. It replays both complete 74,293,846-face fields, repeats bounds passes, tests interruption and camera cancellation, and compares 1025 linear Turbo colour values against the original studio implementation. It does not claim a physical GPU image test.
