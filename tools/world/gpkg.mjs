// Minimal read-only GeoPackage reader on node:sqlite: GPKG binary header, WKB geometry, R-tree bbox queries.
import { DatabaseSync } from 'node:sqlite';

const ENVELOPE_DOUBLES = [0, 4, 6, 6, 8];

// Returns { srsId, empty, envelope, wkb } for a GeoPackage geometry blob.
export function parseGpkgHeader(buf) {
  if (buf[0] !== 0x47 || buf[1] !== 0x50) throw new Error('not a GeoPackage geometry (bad magic)');
  const flags = buf[3];
  const little = (flags & 1) === 1;
  const envCode = (flags >> 1) & 7;
  if (envCode > 4) throw new Error(`invalid envelope indicator ${envCode}`);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const srsId = dv.getInt32(4, little);
  const envBytes = ENVELOPE_DOUBLES[envCode] * 8;
  let envelope = null;
  if (envCode > 0) {
    envelope = [];
    for (let i = 0; i < ENVELOPE_DOUBLES[envCode]; i++) envelope.push(dv.getFloat64(8 + i * 8, little));
  }
  return { srsId, empty: (flags & 0x10) !== 0, envelope, wkb: buf.subarray(8 + envBytes) };
}

const TYPE_NAMES = { 1: 'Point', 2: 'LineString', 3: 'Polygon', 4: 'MultiPoint', 5: 'MultiLineString', 6: 'MultiPolygon', 7: 'GeometryCollection' };

// Parses WKB (ISO and EWKB Z/M flags, either byte order). Coordinates are arrays [x, y, z?, m?].
export function parseWkb(buf, offset = 0) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let pos = offset;

  function geometry() {
    const little = dv.getUint8(pos) === 1;
    pos += 1;
    let code = dv.getUint32(pos, little);
    pos += 4;
    let hasZ = false, hasM = false;
    if (code & 0x80000000) hasZ = true;
    if (code & 0x40000000) hasM = true;
    code &= 0x0fffffff;
    const iso = Math.floor(code / 1000);
    if (iso === 1) hasZ = true; else if (iso === 2) hasM = true; else if (iso === 3) { hasZ = true; hasM = true; }
    const base = code % 1000;
    const type = TYPE_NAMES[base];
    if (!type) throw new Error(`unsupported WKB type ${code}`);
    const dim = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

    const point = () => {
      const p = new Array(dim);
      for (let i = 0; i < dim; i++) { p[i] = dv.getFloat64(pos, little); pos += 8; }
      return p;
    };
    const count = () => { const n = dv.getUint32(pos, little); pos += 4; return n; };
    const points = () => { const n = count(); const out = new Array(n); for (let i = 0; i < n; i++) out[i] = point(); return out; };
    const rings = () => { const n = count(); const out = new Array(n); for (let i = 0; i < n; i++) out[i] = points(); return out; };
    const parts = () => { const n = count(); const out = new Array(n); for (let i = 0; i < n; i++) out[i] = geometry().coordinates; return out; };

    let coordinates;
    if (base === 1) coordinates = point();
    else if (base === 2) coordinates = points();
    else if (base === 3) coordinates = rings();
    else if (base === 4 || base === 5 || base === 6) coordinates = parts();
    else { const n = count(); coordinates = []; for (let i = 0; i < n; i++) coordinates.push(geometry()); }
    return { type, hasZ, hasM, coordinates };
  }
  return geometry();
}

export function parseGpkgGeometry(buf) {
  const h = parseGpkgHeader(buf);
  if (h.empty) return null;
  return { srsId: h.srsId, ...parseWkb(h.wkb) };
}

export class GeoPackage {
  constructor(file) {
    this.db = new DatabaseSync(file, { readOnly: true });
  }

  close() { this.db.close(); }

  all(sql, ...params) { return this.db.prepare(sql).all(...params); }

  tables() {
    return this.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(r => r.name);
  }

  columns(table) {
    return this.all(`PRAGMA table_info("${table}")`).map(r => r.name);
  }

  // Feature tables declared in gpkg_geometry_columns, with the geometry column and Z/M flags.
  geometryColumns() {
    return this.all('SELECT table_name, column_name, geometry_type_name, z, m, srs_id FROM gpkg_geometry_columns ORDER BY table_name');
  }

  geometryColumn(table) {
    return this.geometryColumns().find(g => g.table_name.toLowerCase() === table.toLowerCase()) ?? null;
  }

  rtreeName(table) {
    const g = this.geometryColumn(table);
    if (!g) return null;
    const name = `rtree_${g.table_name}_${g.column_name}`;
    return this.tables().includes(name) ? name : null;
  }

  // Rows of `table` whose bbox intersects [minx, miny, maxx, maxy], geometry decoded into `geom`.
  query(table, bbox, { where = '', params = [], columns = '*' } = {}) {
    const g = this.geometryColumn(table);
    if (!g) throw new Error(`${table} is not a feature table`);
    const rtree = this.rtreeName(table);
    const [minx, miny, maxx, maxy] = bbox;
    if (!rtree) throw new Error(`${table} has no R-tree index; a bbox query would scan the whole table`);
    const pk = this.all(`PRAGMA table_info("${table}")`).find(c => c.pk === 1)?.name ?? 'fid';
    const extra = where ? ` AND (${where})` : '';
    const sql = `SELECT ${columns === '*' ? 't.*' : columns} FROM "${table}" t JOIN "${rtree}" r ON t."${pk}" = r.id WHERE r.maxx >= ? AND r.minx <= ? AND r.maxy >= ? AND r.miny <= ?${extra}`;
    const args = [minx, maxx, miny, maxy, ...params];
    const out = [];
    for (const row of this.db.prepare(sql).iterate(...args)) {
      const blob = row[g.column_name];
      const geom = blob ? parseGpkgGeometry(blob) : null;
      if (!geom) continue;
      out.push({ ...row, [g.column_name]: undefined, geom });
    }
    return out;
  }
}
