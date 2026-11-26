// A `fetch` over a folder on disk, for loading a world's data in node: the same
// relative URLs WorldData asks the page for ('world/manifest.json') resolve
// against the repo root, so the shipped folder and the fixtures read alike.
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

export function diskFetch() {
    const calls = [];
    const fetchFn = async (url) => {
        calls.push(url);
        try {
            const bytes = await readFile(new URL(url, root));
            const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
            return { ok: true, status: 200, arrayBuffer: async () => buffer };
        } catch (error) {
            return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        }
    };
    return { fetchFn, calls };
}
