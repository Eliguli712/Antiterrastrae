"""Create full-triangle textured display assets from the unchanged 3MF downloads."""
from pathlib import Path
import hashlib
import io
import json
import struct
import xml.etree.ElementTree as ET
import zipfile

import numpy as np
import vtk
from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/cynthiacetus"
CORE = "{http://schemas.microsoft.com/3dmanufacturing/core/2015/02}"
MAT = "{http://schemas.microsoft.com/3dmanufacturing/material/2015/02}"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_source(path):
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        model = ET.fromstring(archive.read("3D/3dmodel.model"))
        assert model.get("unit") == "millimeter"
        objects = model.findall(f"{CORE}resources/{CORE}object")
        assert len(objects) == 1
        mesh = objects[0].find(f"{CORE}mesh")
        vertices = np.array([[float(v.get(k)) for k in ("x", "y", "z")]
                             for v in mesh.find(f"{CORE}vertices")])
        triangles = list(mesh.find(f"{CORE}triangles"))
        faces = np.array([[int(t.get(k)) for k in ("v1", "v2", "v3")]
                          for t in triangles], dtype=np.int32)
        group = model.find(f"{CORE}resources/{MAT}texture2dgroup")
        uv = np.array([[float(v.get(k)) for k in ("u", "v")] for v in group])
        assert all(t.get("pid") == group.get("id") for t in triangles)
        texture_faces = np.array([[int(t.get(k)) for k in ("p1", "p2", "p3")]
                                  for t in triangles])
        texture = model.find(f"{CORE}resources/{MAT}texture2d")
        assert texture.get("id") == group.get("texid")
        image = archive.read(texture.get("path").lstrip("/"))
        metadata = {v.get("name"): v.text for v in model.findall(f"{CORE}metadata")}
        transform = model.find(f"{CORE}build/{CORE}item").get("transform")
    assert np.isfinite(vertices).all() and np.isfinite(uv).all()
    assert faces.min() >= 0 and faces.max() < len(vertices)
    assert texture_faces.min() >= 0 and texture_faces.max() < len(uv)
    # Rotate Z-up to Y-up for display, keeping the original coordinate distances.
    display = vertices[:, [0, 2, 1]] * [1, 1, -1]
    display -= (display.min(axis=0) + display.max(axis=0)) / 2
    face_normals = np.cross(display[faces[:, 1]] - display[faces[:, 0]],
                            display[faces[:, 2]] - display[faces[:, 0]])
    assert np.linalg.norm(face_normals, axis=1).min() > 0
    normals = np.zeros_like(display)
    for corner in range(3):
        np.add.at(normals, faces[:, corner], face_normals)
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-20)
    edges = np.sort(np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1)
    _, counts = np.unique(edges, axis=0, return_counts=True)
    summary = {
        "vertices": len(vertices), "triangles": len(faces),
        "boundary_edges": int((counts == 1).sum()),
        "nonmanifold_edges": int((counts > 2).sum()),
        "anatomical_bounds_mm": [vertices.min(0).tolist(), vertices.max(0).tolist()],
        "build_transform_3mf": transform, "source_metadata": metadata,
        "texture_sha256": sha(image),
    }
    return display, faces, normals, uv[texture_faces].reshape(-1, 2), image, summary


def write_glb(path, vertices, faces, normals, uv, image):
    positions = np.ascontiguousarray(vertices[faces].reshape(-1, 3) / 1000, dtype="<f4")
    normals = np.ascontiguousarray(normals[faces].reshape(-1, 3), dtype="<f4")
    texcoords = np.ascontiguousarray(uv, dtype="<f4")
    # 3MF textures use a bottom-left UV origin; glTF images use a top-left origin.
    texcoords[:, 1] = 1 - texcoords[:, 1]
    chunks, views, offset = [], [], 0
    for data in (positions.tobytes(), normals.tobytes(), texcoords.tobytes(), image):
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(data)})
        padded = data + b"\0" * (-len(data) % 4)
        chunks.append(padded)
        offset += len(padded)
    model = {
        "asset": {"version": "2.0", "generator": "Cynthiacetus source-preserving display exporter"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
        "buffers": [{"byteLength": offset}], "bufferViews": views,
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions), "type": "VEC3",
             "min": positions.min(0).tolist(), "max": positions.max(0).tolist()},
            {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": len(texcoords), "type": "VEC2"}],
        "images": [{"bufferView": 3, "mimeType": "image/png"}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
        "textures": [{"source": 0, "sampler": 0}],
        "materials": [{"name": "Original Opal diffusion texture",
                       "pbrMetallicRoughness": {"baseColorTexture": {"index": 0},
                                                "metallicFactor": 0.05, "roughnessFactor": 0.42},
                       "doubleSided": True}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                                     "material": 0, "mode": 4}]}],
        "extras": {"sourceTriangles": len(faces), "simplified": False,
                   "displayUnits": "meters", "originalUnits": "millimeters"},
    }
    data = json.dumps(model, separators=(",", ":")).encode()
    data += b" " * (-len(data) % 4)
    binary = b"".join(chunks)
    glb = struct.pack("<III", 0x46546C67, 2, 28 + len(data) + len(binary))
    glb += struct.pack("<II", len(data), 0x4E4F534A) + data
    glb += struct.pack("<II", len(binary), 0x004E4942) + binary
    path.write_bytes(glb)
    # Round-trip checks cover every triangle corner and the embedded source PNG.
    assert sha(binary[views[3]["byteOffset"]:views[3]["byteOffset"] + len(image)]) == sha(image)
    assert np.max(np.abs(positions.astype(float) * 1000 - vertices[faces].reshape(-1, 3))) < 0.00001


def render(path, vertices, faces, normals, uv, image):
    points = vtk.vtkPoints()
    points.SetData(numpy_to_vtk(vertices[faces].reshape(-1, 3), deep=True))
    cells = vtk.vtkCellArray()
    ids = np.column_stack([np.full(len(faces), 3), np.arange(len(faces) * 3).reshape(-1, 3)]).astype(np.int64)
    cells.SetCells(len(faces), numpy_to_vtkIdTypeArray(ids.ravel(), deep=True))
    poly = vtk.vtkPolyData()
    poly.SetPoints(points)
    poly.SetPolys(cells)
    poly.GetPointData().SetTCoords(numpy_to_vtk(uv, deep=True))
    poly.GetPointData().SetNormals(numpy_to_vtk(normals[faces].reshape(-1, 3), deep=True))
    reader = vtk.vtkPNGReader()
    reader.SetMemoryBuffer(image)
    reader.SetMemoryBufferLength(len(image))
    reader.Update()
    texture = vtk.vtkTexture()
    texture.SetInputConnection(reader.GetOutputPort())
    texture.InterpolateOn()
    mapper = vtk.vtkPolyDataMapper()
    mapper.SetInputData(poly)
    actor = vtk.vtkActor()
    actor.SetMapper(mapper)
    actor.SetTexture(texture)
    prop = actor.GetProperty()
    prop.SetInterpolationToPhong()
    prop.SetAmbient(0.28)
    prop.SetDiffuse(0.76)
    prop.SetSpecular(0.18)
    prop.SetSpecularPower(38)
    renderer = vtk.vtkRenderer()
    renderer.SetBackground(0.965, 0.957, 0.976)
    renderer.AddActor(actor)
    renderer.AutomaticLightCreationOff()
    span = np.ptp(vertices, axis=0)
    distance = float(np.linalg.norm(span) * 3)
    for position, intensity in [((-0.5, 1.0, 1.8), 0.85), ((1.0, 0.3, 0.6), 0.45), ((0, 0.8, -1.0), 0.4)]:
        light = vtk.vtkLight()
        light.SetLightTypeToSceneLight()
        light.SetPosition(*(np.array(position) * distance))
        light.SetFocalPoint(0, 0, 0)
        light.SetIntensity(intensity)
        renderer.AddLight(light)
    camera = renderer.GetActiveCamera()
    camera.SetFocalPoint(0, 0, 0)
    camera.SetPosition(-0.18 * distance, 0.28 * distance, distance)
    camera.SetViewUp(0, 1, 0)
    camera.ParallelProjectionOn()
    camera.SetParallelScale(max(span[1] * 0.61, span[0] / (3200 / 2200) * 0.59))
    renderer.ResetCameraClippingRange()
    window = vtk.vtkRenderWindow()
    window.SetOffScreenRendering(1)
    window.SetSize(3200, 2200)
    window.SetMultiSamples(8)
    window.AddRenderer(renderer)
    window.Render()
    capture = vtk.vtkWindowToImageFilter()
    capture.SetInput(window)
    capture.Update()
    writer = vtk.vtkPNGWriter()
    writer.SetFileName(str(path))
    writer.SetInputConnection(capture.GetOutputPort())
    writer.Write()
    window.Finalize()


def main():
    OUT.mkdir(exist_ok=True, parents=True)
    manifest = {"edition": "1:10 Opal / Original anatomy / No supports",
                "source_files_unchanged": True,
                "reinforcement_status": "Source anatomy preserved; these downloads are not the reinforced edition.",
                "display": "Full triangle count, original embedded PNG textures; display orientation and units converted only.",
                "models": {}}
    for part in ("Skull", "Mandible"):
        source = ROOT / "downloads/cynthiacetus" / f"Opal_1-10_{part}_OriginalAnatomy_NoSupports.3mf"
        vertices, faces, normals, uv, image, summary = read_source(source)
        stem = part.lower()
        write_glb(OUT / f"{stem}.glb", vertices, faces, normals, uv.copy(), image)
        render(OUT / f"{stem}-full.png", vertices, faces, normals, uv, image)
        from PIL import Image
        with Image.open(OUT / f"{stem}-full.png") as im:
            im.thumbnail((1200, 825))
            im.save(OUT / f"{stem}-poster.webp", quality=90)
        summary.update({"file": str(source.relative_to(ROOT)), "bytes": source.stat().st_size,
                        "sha256": sha(source.read_bytes()), "glb": f"assets/cynthiacetus/{stem}.glb",
                        "glb_sha256": sha((OUT / f"{stem}.glb").read_bytes()),
                        "image": f"assets/cynthiacetus/{stem}-full.png", "image_pixels": [3200, 2200]})
        manifest["models"][stem] = summary
        print(part, summary["vertices"], "vertices /", summary["triangles"], "triangles / boundary edges", summary["boundary_edges"])
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
