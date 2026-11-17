// The Ground interface: what the physics and the scenery ask of the land
// round the road. LegGround answers from the terrain model of a leg
// (js/terrain.js) with the argument lists the game always used; the world
// answers from its height tiles. No THREE and no DOM.
//
// A `hint` is the window the answer is searched in: {start, end}, the
// vehicle's segment search range on a leg. A `loc` is a located point
// (index, lateral, roadY, along), filled by locate() and groundY() so that a
// caller needing the side or the road height does not search twice.
class Ground {
    // Height of the ground at (x, z). `exact` asks for the drawn mesh height
    // rather than the coarse model; `loc` receives the located point.
    groundY() { throw new Error('Ground.groundY is not implemented'); }

    // Ground height at an already located point
    heightAt() { throw new Error('Ground.heightAt is not implemented'); }

    // What the ground is at loc.lateral: {kind, side, sign, start}
    zoneAt() { throw new Error('Ground.zoneAt is not implemented'); }

    // Height at which something dropped beside the road comes to rest
    restY() { throw new Error('Ground.restY is not implemented'); }

    // The side of the road at loc, `sign` -1 left or 1 right
    sideAt() { throw new Error('Ground.sideAt is not implemented'); }

    // Water surface height at loc, null on a dry road
    waterLevel() { throw new Error('Ground.waterLevel is not implemented'); }

    // Where (x, z) lies against the road
    locate() { throw new Error('Ground.locate is not implemented'); }

    // Half the road width at loc
    halfRoad() { throw new Error('Ground.halfRoad is not implemented'); }
}

class LegGround extends Ground {
    constructor(environment) {
        super();
        this.environment = environment;
    }

    groundY(x, z, hint, exact = false, loc = {}) {
        const { terrain, terrainGeometry } = this.environment;
        return Terrain.groundY(terrain, terrainGeometry, x, z, hint.start, hint.end, exact, loc);
    }

    heightAt(loc, exact = false) {
        const { terrain, terrainGeometry } = this.environment;
        return Terrain.heightAt(terrain, terrainGeometry, loc, exact);
    }

    zoneAt(loc, halfRoad) {
        return Terrain.zoneAt(this.environment.terrain, loc.index, loc.lateral, halfRoad);
    }

    restY(loc) {
        const terrain = this.environment.terrain;
        const side = Terrain.sideAt(terrain, loc.lateral < 0 ? -1 : 1, loc.index);
        return Terrain.restY(terrain, side, loc.roadY);
    }

    sideAt(loc, sign) {
        return Terrain.sideAt(this.environment.terrain, sign, loc.index);
    }

    waterLevel(loc) {
        return Terrain.waterLevel(this.environment.terrain, loc.roadY);
    }

    locate(x, z, hint, out = {}) {
        Terrain.locate(this.environment.roadPath, x, z, hint.start, hint.end, out);
        return out;
    }

    halfRoad() {
        return this.environment.roadWidth / 2;
    }
}
