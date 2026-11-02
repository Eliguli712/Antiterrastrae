const hex = bytes => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
const digest = async bytes => hex(await crypto.subtle.digest('SHA-256', bytes));

export async function loadChunkedModel(source, {signal, onProgress = () => {}} = {}) {
  const url = new URL(source, document.baseURI);
  if (url.origin !== location.origin) throw new Error('The model must be hosted on this site.');
  const response = await fetch(url, {signal});
  if (!response.ok) throw new Error(`Model manifest request failed (${response.status}).`);
  const manifest = await response.json();
  if (manifest.format !== 'chunked-file-v1' || !Array.isArray(manifest.parts) || !manifest.parts.length || manifest.parts.length > 1000) {
    throw new Error('Invalid model manifest.');
  }
  const names = manifest.parts.map(part => part.path);
  if (new Set(names).size !== names.length) throw new Error('Duplicate model part.');
  const chunks = [];
  let received = 0;
  for (const part of manifest.parts) {
    if (typeof part.path !== 'string' || !part.path || /[\\/]/.test(part.path) || ['.', '..'].includes(part.path)) throw new Error('Invalid model part path.');
    const result = await fetch(new URL(part.path, url), {signal});
    if (!result.ok) throw new Error(`Model part request failed (${result.status}).`);
    const bytes = await result.arrayBuffer();
    if (bytes.byteLength !== part.bytes || await digest(bytes) !== part.sha256) throw new Error('Model part integrity check failed.');
    chunks.push(new Uint8Array(bytes)); received += bytes.byteLength;
    onProgress(received, manifest.bytes);
  }
  const complete = new Uint8Array(received);
  let offset = 0;
  for (const bytes of chunks) { complete.set(bytes, offset); offset += bytes.length; }
  if (received !== manifest.bytes || await digest(complete) !== manifest.sha256) throw new Error('Complete model integrity check failed.');
  return URL.createObjectURL(new Blob([complete], {type: 'model/gltf-binary'}));
}
