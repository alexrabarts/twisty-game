// Discoveries in free roam: the things a rider can find off the timed line, counted on the HUD (`Discoveries 3/24`)
// and kept between rides in this browser (localStorage, per world). Each is found once, the first time the bike comes
// within reach of it:
//   - every open stopping place (WorldPlaces): where a rider stands in it, within placeM
//   - every side road (WorldGraph.sideStubs): the point sideAlongM down it from its junction (its end when shorter),
//     within sideM. A side road's rows stream with its chunk, so its point is found once they are in
//   - the summit: the stage's end, within summitM
class WorldDiscoveries {
    static get RULE() {
        return Object.freeze({ placeM: 25, sideAlongM: 150, sideM: 30, summitM: 40, everyS: 0.25 });
    }

    static get KEY() { return 'twistyDiscoveries'; }

    // `store` is localStorage or a stand-in; a store that throws (a private window) keeps the finds for this ride only
    constructor(environment, store = null) {
        const R = WorldDiscoveries.RULE, route = environment.route;
        this.env = environment;
        this.store = store;
        this.key = `${WorldDiscoveries.KEY}:${(environment.config && environment.config.id) || 'world'}`;
        this.items = [];
        const words = { layby: 'Lay-by', viewpoint: 'Viewpoint', carpark: 'Car park' };
        for (const place of (environment.places && environment.places.list) || []) {
            const at = environment.places.stopAt(place, 0, null, {});
            this.items.push({ id: `place:${place.id}`, name: `${words[place.kind] || 'Stopping place'}, km ${(at.s / 1000).toFixed(1)}`, x: at.x, z: at.z, reach: R.placeM });
        }
        const graph = environment.graph;
        if (graph && graph.sideStubs) {
            for (const [edgeId, node] of graph.sideStubs()) {
                const junction = graph.junctions.find(j => j.node === node);
                const s = junction && junction.passes && junction.passes.length ? junction.passes[0].sIn : null;
                this.items.push({ id: `side:${edgeId}`, name: Number.isFinite(s) ? `Side road, km ${(s / 1000).toFixed(1)}` : 'Side road', edgeId, node, x: null, z: null, reach: R.sideM });
            }
        }
        const top = route.sample(environment.endS, {});
        this.items.push({ id: 'summit', name: 'The summit', x: top.x, z: top.z, reach: R.summitM });
        this.found = new Set();
        try {
            const saved = this.store ? JSON.parse(this.store.getItem(this.key) || '[]') : [];
            for (const id of saved) if (this.items.some(item => item.id === id)) this.found.add(id);
        } catch (error) {
            console.warn('Discoveries: the saved finds could not be read', error);
        }
        this.clock = 0;
    }

    get total() { return this.items.length; }
    get count() { return this.found.size; }

    // Where a side road's point is: sideAlongM down its chain, or its end; null until its rows are in
    resolve(item) {
        const chain = this.env.graph.chainFrom(item.edgeId, item.node, WorldDiscoveries.RULE.sideAlongM);
        if (!chain || !chain.rows || !chain.rows.length) return false;
        const last = chain.rows[chain.rows.length - 1];
        item.x = last.x;
        item.z = last.z;
        return true;
    }

    // The bike at (x, z) after dt: the item found this step, or null (one at a time, every everyS)
    step(x, z, dt) {
        this.clock -= dt;
        if (this.clock > 0) return null;
        this.clock = WorldDiscoveries.RULE.everyS;
        for (const item of this.items) {
            if (this.found.has(item.id)) continue;
            if (item.x === null && !this.resolve(item)) continue;
            if (Math.hypot(item.x - x, item.z - z) > item.reach) continue;
            this.found.add(item.id);
            this.save();
            return item;
        }
        return null;
    }

    save() {
        if (!this.store) return;
        try {
            this.store.setItem(this.key, JSON.stringify([...this.found]));
        } catch (error) {
            console.warn('Discoveries: the finds could not be saved', error);
        }
    }

    // The HUD's line (British English)
    text() {
        return `Discoveries ${this.count}/${this.total}`;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { WorldDiscoveries };
