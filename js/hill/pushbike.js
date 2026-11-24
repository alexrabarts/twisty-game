// The hill ride's bicycle as the game's own bike (js/vehicle.js): the same steering input, countersteer, lean, heading,
// lateral grip, lowside, foot down, wheelie and fall as every motorbike, through the world's physics path, with the
// numbers of a heavy delivery bicycle and a boy on it (HillVehicle.DATA, HillVehicle.WORLD). Only the drive is its own:
// no engine, the boy's push at the pedals, which falls away as the cadence rises (one gear, a freewheel), rod brakes
// that pull weakly, and the cobbles' drag. Nothing of a motorbike changes: every difference is an override here or a
// hook whose motorbike value is the one it always had (Vehicle.wheeliePop, wheelieLift, wheelieEndSpeed).
class HillVehicle extends Vehicle {
    static get DATA() {
        return Object.freeze({
            // A 20 kg delivery bicycle and a 40 kg boy; 26 inch wheels; a delivery bicycle's long wheelbase
            bikeKg: 20, riderKg: 40, wheelbaseM: 1.15, wheelM: 0.33,
            // One gear: metres for each turn of the cranks, the most turns a minute; the push at the road when the
            // cranks barely turn (it falls to nothing at the most)
            developmentM: 4.2, cadenceMostRpm: 92, pushN: 150,
            // Rolling drag on the cobbles, as a share of the weight
            rollCobbles: 0.04,
            // Rod brakes: the most they slow the bicycle (m/s2)
            brakeMs2: 2.4,
            // The wheelie: the pop is the hard push's (the push share at this speed) times popGain, the push's lift
            // after it times liftGain (a light bicycle and the boy's weight thrown back: at a crawl it can go over); the
            // loaded basket takes basketLoad of both; tug is the share of the pop that is the boy's pull on the bars
            popGain: 1.15, liftGain: 1.5, basketLoad: 0.15, tug: 0.12,
            // The top speed the drive is held to (none is reached on the hill)
            maxSpeed: 30
        });
    }

    // The world's numbers for the bicycle: WorldPhysics with a bicycle's lean (slower, a lower cap), its grip on cobbles,
    // its tighter turns at walking pace, no engine braking, its air drag (half rho Cd A over its mass), its foot down
    static get WORLD() {
        if (HillVehicle.world) return HillVehicle.world;
        const D = HillVehicle.DATA;
        HillVehicle.world = Object.freeze({
            ...WorldPhysics,
            leanCapDeg: 42,
            leanRate: WorldPhysics.leanRate * 0.6,
            steerSpeed: 8,
            cobbleGrip: 0.72,
            radiusFloor: 3,
            lockRadius: 1.3,
            turnBlendSpeed: 4,
            lowLeanSpeed: 3, lowLeanFullSpeed: 2, lowLeanDeg: 25,
            idleSpeed: 0, engineBrake: 0, engineBrakeMax: 0, rollDecel: 0,
            aeroDrag: 0.5 * 1.2 * 0.7 / (D.bikeKg + D.riderKg),
            fallSpeed: 1.2, tipLeanDeg: 14, footDownDecel: 2, footDownSpeed: 0.6,
            throttleRiseS: 0.25, throttleFallS: 0.1
        });
        return HillVehicle.world;
    }

    // The boy as the vehicle's rider: the catalogue's first character's frame (the vehicle builds a rider from it,
    // never drawn) with his own weight and no multipliers or traits of his own
    static rider() {
        const base = CHARACTERS[0];
        return { ...base, id: 'hill-boy', kg: HillVehicle.DATA.riderKg, physics: {}, traits: { country: 3, mountain: 3, hairpins: 3, daring: 3 } };
    }

    constructor() {
        // Built into a scene of its own, never drawn: the hill ride draws its own bicycle (js/hill/rider.js)
        super(new THREE.Scene(), null, HillVehicle.rider(), 'naked', { model: false });
        const D = HillVehicle.DATA;
        this.surface = { grade: 0, heading: 0, flags: { cobbles: true } };
        // A route with no strand of its own: every road-following path finds nothing and leaves the bicycle alone; the
        // grade under the bicycle comes from the lane (HillBicycle writes `surface` before each step)
        const route = { unitCount: 1, fromUnits: () => 0, project: (x, z, hint, out = {}) => { out.index = -1; return out; }, sample: () => this.surface };
        // and no ground of the world's: a place is never located, so the height stays the one HillBicycle sets
        this.environment = { physics: HillVehicle.WORLD, route, ground: { locate: () => null } };
        this.mass = D.bikeKg + D.riderKg;
        this.wheelbase = D.wheelbaseM;
        this.maxSpeed = D.maxSpeed;
        this.leanDare = 1;
        this.leanMass = 1;
        this.footSlope = Infinity;
        this.wheelieEndSpeed = 0;
        this.speed = 0;
    }

    get pedalMostMs() {
        return HillVehicle.DATA.developmentM * HillVehicle.DATA.cadenceMostRpm / 60;
    }

    // The share of the boy's full push he has at this speed: all of it as the cranks barely turn, none at the most he
    // can turn them (the freewheel takes over past it)
    pushShare(speed) {
        return Math.max(0, 1 - Math.max(0, speed) / this.pedalMostMs);
    }

    // The drive at full pedal (m/s2): his push over the mass, falling with the cadence
    worldDrive(v) {
        const D = HillVehicle.DATA;
        return D.pushN * this.pushShare(v) / this.mass;
    }

    worldBrakeDecel() {
        return HillVehicle.DATA.brakeMs2;
    }

    // The world's speed rule, then the cobbles' rolling drag (the world's engine braking is none for a bicycle)
    updateWorldSpeed(deltaTime, throttleInput, brakeInput) {
        super.updateWorldSpeed(deltaTime, throttleInput, brakeInput);
        if (this.speed > 0 && !this.footDown) {
            const g = 9.81, slope = Math.atan(this.worldGrade || 0);
            this.speed = Math.max(0, this.speed - HillVehicle.DATA.rollCobbles * g * Math.cos(slope) * deltaTime);
        }
    }

    // A wheelie by a hard push: the pop and the lift are the push he has at this speed, less the loaded basket's share
    wheeliePop(speed) {
        const D = HillVehicle.DATA;
        return D.popGain * (1 - D.basketLoad) * (D.tug + (1 - D.tug) * this.pushShare(speed));
    }

    wheelieLift(speed) {
        const D = HillVehicle.DATA;
        return D.liftGain * (1 - D.basketLoad) * this.pushShare(speed);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = { HillVehicle };
