// The stages of the ride, from route.json. Apart from import.mjs so that inspect.mjs can scope itself to stages
// without a cycle (import.mjs reads inspect.mjs).

const slug = name => name.toLowerCase().replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/é/g, 'e').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Stages of the ride: the slices named in route.json, or the stages between its boundary waypoints.
// The route with only the waypoints of the chosen stages, a shared boundary once; 'all' keeps the whole route
export function scopedRoute(route, ids) {
  if (ids.length === 1 && ids[0] === 'all') return route;
  const waypoints = stageDefs(route, ids).flatMap(s => s.waypoints).filter((w, i, all) => i === 0 || w.id !== all[i - 1].id);
  return { ...route, waypoints };
}

export function stageDefs(route, ids) {
  const wp = route.waypoints;
  const all = [];
  const boundaries = wp.filter(w => w.boundary);
  for (let k = 0; k + 1 < boundaries.length; k++) {
    const a = wp.indexOf(boundaries[k]), b = wp.indexOf(boundaries[k + 1]);
    all.push({ id: `${slug(boundaries[k].name)}-${slug(boundaries[k + 1].name)}`, name: `${boundaries[k].name} to ${boundaries[k + 1].name}`, waypoints: wp.slice(a, b + 1) });
  }
  const slices = Object.entries(route.slices ?? {}).map(([id, s]) => ({ id, name: s.name, waypoints: s.waypoints.map(i => wp.find(w => w.id === i)) }));
  if (ids.length === 1 && ids[0] === 'all') return all;
  return ids.map(id => {
    const found = slices.find(s => s.id === id) ?? all.find(s => s.id === id);
    if (!found) throw new Error(`unknown stage "${id}". Known: ${[...slices, ...all].map(s => s.id).join(', ')}`);
    return found;
  });
}
