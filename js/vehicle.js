// What each rider wears: one outfit for each kind of kit they have worn, the
// first the one they wear unless the player picks another (TourSystem's
// selectOutfit). An outfit's `kit` is the rider's own gear over the bike's
// default rider colours (Vehicle.buildVariantRider's options). Its colours
// go to the modelled rider's materials by name, and its styles pick the cut
// of each part (`<part>_<style>` in tools/blender/rider.py): helmetStyle,
// torsoStyle, upperArmStyle, forearmStyle, thighStyle, shinStyle, gloveStyle
// and bootStyle. neckColor adds a neck tube, backpackColor a backpack and
// backStyle a mark on the back of the jacket (`back_<style>`). Every rider has
// two or more, and the first of each carries a mark that reads from behind
// and sets it apart from the other riders' (tests/unit/characters.test.js
// measures both from these colours and the model file).
// Names say what the gear looks like and never who made it.
const OUTFITS = {
    steve: [{
        id: 'black-textile-red',
        name: 'Black textile, red helmet, grey jeans',
        kit: {
            suitColor: 0x121316, suitAccent: 0x1f2126,     // All black, the armour overlays a shade lighter
            suitTrim: 0xc9a63a, suitPatch: 0x7d8188,       // A small yellow patch on the chest, grey reflective patches on the arms
            torsoStyle: 'plain', upperArmStyle: 'plain', forearmStyle: 'band',
            pantsColor: 0x5b5e65, pantsAccent: 0x5b5e65,   // Grey jeans
            shinStyle: 'jeans',
            helmetColor: 0xc41f1c, helmetAccent: 0xeeeeec, // Red, white low on the sides and the back, black lines and eye port
            helmetTrim: 0x111214, helmetStyle: 'graphic', visorColor: 0x0b0d11,
            gloveColor: 0x101114, gloveStyle: 'armour',
            bootColor: 0x121316, bootAccent: 0xe8e8e6, bootStyle: 'road' // Black road boots, white marks
        }
    }, {
        id: 'black-textile',
        name: 'Black textile, silver helmet',
        kit: {
            suitColor: 0x121316, suitAccent: 0x1f2126,     // All black, the armour overlays a shade lighter
            suitTrim: 0xc9a63a, suitPatch: 0x7d8188,       // A small yellow patch on the chest, grey reflective patches on the arms
            torsoStyle: 'plain', upperArmStyle: 'plain', forearmStyle: 'band',
            pantsColor: 0x141518, pantsAccent: 0xdcdcdc, pantsTrim: 0x9a9da2,
            thighStyle: 'pocket', shinStyle: 'mark',
            helmetColor: 0xe6ebe9, helmetAccent: 0x252224, // Silver-white, dark bands round the crown and the back
            helmetStyle: 'band', visorColor: 0xb8923a, visorAccent: 0x2f5fb8,
            gloveColor: 0x101114, gloveStyle: 'armour',
            bootColor: 0x202229, bootAccent: 0xe8e8e6, bootStyle: 'trainer' // Riding trainers, a white midsole
        }
    }],
    alex: [{
        id: 'black-plain',
        name: 'Plain black textile, black helmet',
        kit: {
            suitColor: 0x131317, suitAccent: 0x1d1d22, suitTrim: 0xb9bcc0, suitPatch: 0x1d1d22,
            torsoStyle: 'plain', upperArmStyle: 'plain', forearmStyle: 'plain',
            pantsColor: 0x3a3538, pantsAccent: 0x2c282b, pantsTrim: 0x2c282b, // Washed black
            thighStyle: 'pocket', shinStyle: 'knee',
            helmetColor: 0x0d0e11, helmetAccent: 0x1c1d21, helmetStyle: 'plain',
            gloveColor: 0x121214, gloveAccent: 0xc2505a, gloveStyle: 'armour', // Red over the knuckles and the back of the hand
            bootColor: 0x3c3a3a, bootAccent: 0x6a6a6c, bootStyle: 'buckle',
            backStyle: 'bar'                               // A pale bar across the shoulder blades, the colour of the chest patch
        }
    }, {
        id: 'black-bars',
        name: 'Black textile with grey bars, white helmet',
        kit: {
            suitColor: 0x111318, suitAccent: 0x111318, suitTrim: 0x8e1026, suitPatch: 0x8f9399, // Grey reflective bars, a red collar lining
            torsoStyle: 'bars', upperArmStyle: 'bar', forearmStyle: 'plain',
            pantsColor: 0x101216, pantsAccent: 0x8e1026, pantsTrim: 0xb4b8bc, // A pale U round the knee
            thighStyle: 'pocket', shinStyle: 'knee',
            helmetColor: 0xe4e7e9, helmetAccent: 0x16171a, helmetStyle: 'modular',
            gloveColor: 0x101114, gloveStyle: 'armour',
            bootColor: 0x0c0d10, bootAccent: 0x4a4c50, bootStyle: 'buckle'
        }
    }],
    tim: [{
        id: 'grey-touring',
        name: 'Light grey touring textile',
        kit: {
            suitColor: 0xb9b9c0, suitAccent: 0x16171b,     // Light grey, a black yoke, cuffs and hem
            suitTrim: 0xb0323a, suitPatch: 0x55585e,       // Red chevrons above the elbows
            torsoStyle: 'touring', upperArmStyle: 'chevron', forearmStyle: 'cuff',
            pantsColor: 0x15161a, pantsAccent: 0x15161a, pantsTrim: 0xe0e0e0, // A white mark on the shin
            thighStyle: 'pocket', shinStyle: 'mark',
            helmetColor: 0xf0f4f8, helmetAccent: 0x15171c, helmetTrim: 0x3a3d44, // White crown, black front and chin
            helmetStyle: 'chin',
            gloveColor: 0x111215, gloveStyle: 'armour',
            bootColor: 0x141518, bootAccent: 0x0e0e10, bootStyle: 'road',
            neckColor: 0x1d1e2c
        }
    }, {
        id: 'grey-touring-black',
        name: 'Light grey touring textile, black and white helmet',
        kit: {
            suitColor: 0xb9b9c0, suitAccent: 0x16171b, suitTrim: 0xb0323a, suitPatch: 0x55585e,
            torsoStyle: 'touring', upperArmStyle: 'chevron', forearmStyle: 'cuff',
            pantsColor: 0x15161a, pantsAccent: 0x15161a, pantsTrim: 0xe0e0e0,
            thighStyle: 'pocket', shinStyle: 'mark',
            helmetColor: 0x111317, helmetAccent: 0xeceeef, helmetTrim: 0xb5282c, // An older one: black, white panels, a red centre stripe
            helmetStyle: 'panel',
            gloveColor: 0x111215, gloveStyle: 'armour',
            bootColor: 0x141518, bootAccent: 0x0e0e10, bootStyle: 'road',
            neckColor: 0x1d1e2c
        }
    }, {
        id: 'black-jacket',
        name: 'Plain black jacket, black and white helmet',
        kit: {
            suitColor: 0x121316, suitAccent: 0x1c1d22, suitTrim: 0x1c1d22, suitPatch: 0x1c1d22, // No patch that shows
            torsoStyle: 'plain', upperArmStyle: 'plain', forearmStyle: 'plain',
            pantsColor: 0x15161a, pantsAccent: 0x15161a, pantsTrim: 0xe0e0e0,
            thighStyle: 'pocket', shinStyle: 'mark',
            helmetColor: 0x111317, helmetAccent: 0xeceeef, helmetTrim: 0xb5282c,
            helmetStyle: 'panel',
            gloveColor: 0x111215, gloveStyle: 'armour',
            bootColor: 0x141518, bootAccent: 0x0e0e10, bootStyle: 'road',
            neckColor: 0x1d1e2c
        }
    }],
    shane: [{
        id: 'blue-orange',
        name: 'Black textile with blue and orange, black helmet',
        kit: {
            suitColor: 0x15161a, suitAccent: 0x2f9fd6,     // Cyan-blue shoulders
            suitTrim: 0xd94a26, suitPatch: 0xe8e8e8,       // Orange sides and forearms
            torsoStyle: 'yoke', upperArmStyle: 'yoke', forearmStyle: 'yoke',
            pantsColor: 0x111114, pantsAccent: 0xd94a26, pantsTrim: 0xe0e0e0, // An orange slash on the thigh
            thighStyle: 'slash', shinStyle: 'knee',
            helmetColor: 0x0e1014, helmetAccent: 0x9aa0a8, helmetStyle: 'lines', // Gloss black, silver-grey lines
            gloveColor: 0x2a2c30, gloveAccent: 0xd94a26, gloveStyle: 'armour',
            bootColor: 0x121214, bootAccent: 0x0e0e10, bootStyle: 'road'
        }
    }, {
        id: 'blue-orange-white',
        name: 'Black textile with blue and orange, white helmet',
        kit: {
            suitColor: 0x15161a, suitAccent: 0x2f9fd6, suitTrim: 0xd94a26, suitPatch: 0xe8e8e8,
            torsoStyle: 'yoke', upperArmStyle: 'yoke', forearmStyle: 'yoke',
            pantsColor: 0x111114, pantsAccent: 0xd94a26, pantsTrim: 0xe0e0e0,
            thighStyle: 'slash', shinStyle: 'knee',
            helmetColor: 0xe9ebec, helmetAccent: 0x121316, helmetTrim: 0xb5342c, // White, black panels, a red centre stripe
            helmetStyle: 'panel',
            gloveColor: 0x2a2c30, gloveAccent: 0xd94a26, gloveStyle: 'armour',
            bootColor: 0x121214, bootAccent: 0x0e0e10, bootStyle: 'road'
        }
    }, {
        id: 'black-piping',
        name: 'Black textile with orange piping, white helmet',
        kit: {
            suitColor: 0x1a181c, suitAccent: 0xc04a32, suitTrim: 0x1a181c, suitPatch: 0x8e9196, // A large grey star-shaped patch
            torsoStyle: 'piping', upperArmStyle: 'bar', forearmStyle: 'line',
            pantsColor: 0x131316, pantsAccent: 0xb03a30, pantsTrim: 0x8a8d92,
            thighStyle: 'pocket', shinStyle: 'stripe',
            helmetColor: 0xe6e8e8, helmetAccent: 0x15161a, helmetStyle: 'modular',
            gloveColor: 0x111114, gloveAccent: 0xc8552e, gloveStyle: 'armour',
            bootColor: 0x121214, bootAccent: 0x0e0e10, bootStyle: 'road'
        }
    }],
    lucy: [{
        id: 'black-leather',
        name: 'Black leather jacket, blue jeans',
        kit: {
            suitColor: 0x121215, suitAccent: 0x26262b,     // Black leather, its panel seams a shade lighter
            suitTrim: 0xa9b1c2, suitPatch: 0xeaeaea,       // A pale grey hood and hem under the jacket, white patches and piping
            suitRoughness: 0.5,
            torsoStyle: 'leather', upperArmStyle: 'star', forearmStyle: 'plain',
            helmetColor: 0xf2f2f0, helmetAccent: 0x121214, // Pearl white helmet, broad black and copper blades
            helmetTrim: 0xb8693a, helmetStyle: 'streak',
            pantsColor: 0x3a4f72, pantsAccent: 0x3a4f72,   // Blue jeans
            shinStyle: 'jeans',
            gloveColor: 0x111113, gloveAccent: 0x2a2c30, gloveStyle: 'armour', // Dark carbon knuckle guards
            bootColor: 0x18181b, bootAccent: 0xf0f0f0, bootStyle: 'trainer' // Black high-top riding trainers, a white sole
        }
    }, {
        id: 'black-open',
        name: 'Black textile jacket worn open, blue top',
        kit: {
            suitColor: 0x141417, suitAccent: 0x2f5fa8,     // A plain black jacket, open over a blue top
            suitTrim: 0xb4bac6, suitPatch: 0x2a2b30,       // A pale grey hoodie tied round the waist
            torsoStyle: 'open', upperArmStyle: 'bar', forearmStyle: 'plain',
            helmetColor: 0xf2f2f0, helmetAccent: 0x121214, helmetTrim: 0xb8693a, helmetStyle: 'streak',
            pantsColor: 0x3a4f72, pantsAccent: 0x3a4f72, shinStyle: 'jeans',
            gloveColor: 0x111113, gloveAccent: 0x2a2c30, gloveStyle: 'armour',
            bootColor: 0x18181b, bootAccent: 0xf0f0f0, bootStyle: 'trainer'
        }
    }],
    guy: [{
        id: 'black-mesh',
        name: 'Black mesh jacket, dark jeans',
        kit: {
            suitColor: 0x0e0e12, suitAccent: 0x18181c, suitTrim: 0xd8d8d6, suitPatch: 0x8a8d90, // A white label on the chest, a grey band on the forearm
            torsoStyle: 'plain', upperArmStyle: 'plain', forearmStyle: 'band',
            helmetColor: 0x101318, helmetAccent: 0xd6d8d4, // Gloss black, white crown stripes and chin panel
            helmetStyle: 'stripes', visorColor: 0x3a2226,
            gloveColor: 0x161617, gloveStyle: 'armour',
            pantsColor: 0x1a1b26, pantsAccent: 0x1a1b26, shinStyle: 'jeans',
            bootColor: 0x7a5a3c, bootAccent: 0x2a2018, bootStyle: 'trainer', // Tan ankle boots
            // His scarf, which he wears only on the scrambler
            scarfColor: 0x8a2b2b, scarfBikes: ['bike04_scrambler']
        }
    }, {
        id: 'charcoal-bands',
        name: 'Charcoal jacket with grey bands',
        kit: {
            suitColor: 0x3a3b3d, suitAccent: 0x6e7072,     // Charcoal, grey leather-look bands
            suitTrim: 0x121214, suitPatch: 0xdadada,       // A shield patch on the arm
            torsoStyle: 'bands', upperArmStyle: 'band', forearmStyle: 'plain',
            helmetColor: 0x0e0f12, helmetAccent: 0x1c1d21, helmetStyle: 'plain',
            gloveColor: 0x121214, gloveStyle: 'armour',
            pantsColor: 0x141416, pantsAccent: 0x141416, shinStyle: 'jeans',
            bootColor: 0x14151c, bootAccent: 0xe6e6e4, bootStyle: 'trainer',
            neckColor: 0x4a4c4e
        }
    }, {
        id: 'tan-waxed',
        name: 'Tan waxed jacket, silver helmet',
        kit: {
            suitColor: 0x8a7458, suitAccent: 0x75614a, suitTrim: 0x75614a, suitPatch: 0x30302c,
            suitRoughness: 0.6,
            torsoStyle: 'waxed', upperArmStyle: 'plain', forearmStyle: 'plain',
            helmetColor: 0xa9adb2, helmetAccent: 0x2a2c30, helmetStyle: 'plain', helmetRoughness: 0.5, // Matt silver
            gloveColor: 0x141416, gloveStyle: 'armour',
            pantsColor: 0x9c9896, pantsAccent: 0x9c9896, shinStyle: 'jeans', // Light grey
            bootColor: 0x18181a, bootAccent: 0x18181a, bootStyle: 'trainer',
            neckColor: 0x37428a
        }
    }, {
        id: 'yellow-rain',
        name: 'Yellow rain oversuit, black helmet',
        kit: {
            suitColor: 0xe6c41c, suitAccent: 0xe6c41c,     // A thin bright yellow oversuit, jacket and trousers
            suitTrim: 0x131314, suitPatch: 0xdfe6d2,       // Black hood cords, a small pale mark on the chest
            suitRoughness: 0.45,
            torsoStyle: 'rain', upperArmStyle: 'rain', forearmStyle: 'rain',
            pantsColor: 0xe6c41c, pantsAccent: 0xe6c41c, thighStyle: 'rain', shinStyle: 'rain',
            helmetColor: 0x0c0d10, helmetAccent: 0x1c1d21, helmetStyle: 'plain', // Plain gloss black
            gloveColor: 0x111113, gloveStyle: 'armour',
            bootColor: 0xa6abb1, bootAccent: 0xa6abb1, bootStyle: 'cover' // Pale grey rain covers over the boots
        }
    }]
};

// Playable characters. Each entry defines the rider, the bikes they own
// (BIKE_MODELS: the first is the one they ride unless the player picks
// another on the rider select) and stat multipliers applied to the baseline
// Vehicle physics. physics are the multipliers actually applied to the
// handling model, and they are the character on their first bike: another
// bike scales them by its class against that one (Vehicle.physicsOf). The
// 1-5 stars of the rider select are worked out from them, the bike and the
// rider's traits (Vehicle.statsOf); nobody writes them by hand. `traits` (1
// to 5) are how the rider really rides: the pace on open country roads, on
// mountain roads and round hairpins, and how daring over a jump. `place` is
// the rider's home place in the group, 1 at the front. The traits set the
// stars and the pace of a rider of the crew (Traffic.PACES); of the player's
// physics they touch one number, the lean limit, by `daring` (RIDER_LEAN,
// Vehicle.leanOf). bikeLabel and bikeColor
// describe the first bike. `outfits` is what the rider can wear (OUTFITS) and
// `kit` the first outfit's gear; `build` is the rider's size against the
// modelled rider's (height stretches the torso and the limbs, width the
// shoulders, the hips and the girth), which the game applies to the one mesh.
// `bodyLean` (0 to 1) is how far the rider's body goes into a turn past the bike's
// own lean: drawn only, for the player and for a rider of the group alike.
// `kg` is the rider's weight: with the bike's own it is the mass the handling
// reads (RIDER_MASS, Vehicle.pairOf); a character without it weighs the 80 kg
// the bikes' numbers were set for. `footSlopeDeg` is the steepest ground on
// which the rider reaches it with a foot at a stop: on steeper ground the bike
// tips over (FOOT_REACH, Vehicle.footReach); without it the rider reaches the
// ground anywhere. `group` is how the rider rides in a world's group (the rules
// are Traffic.GROUP's, .agent/system/group.md): `gapS` the time gap it keeps to
// whoever is ahead and `gapSpread` how far that wanders; `least` and `most` the
// shares of its own pace it eases to and rises to (its limit); `wander` the
// noise on its pace; `spurt` the chance a kilometre of a spell `gain` faster for
// `seconds`, weighted by the kind of road; `passPerS` the chance a second of
// safe road that it passes one whose place is behind its own; `stop` the chance it pulls in at a stopping place it comes
// to, and how long it waits there. A character without it rides the middle row
// (Traffic.GROUP.rider).
const CHARACTERS = [
    {
        id: 'steve',
        kg: 100,
        name: 'Steve',
        bikeLabel: 'Retro sports triple',
        bikeColor: '0x021b74', // Deep blue tank, gold wheels
        bikes: ['bike08_xsr900', 'bike13_panigale'],
        outfits: OUTFITS.steve,
        kit: OUTFITS.steve[0].kit,
        // The tallest of them
        build: { height: 1.06, width: 0.98 },
        // Hangs off: the body well into the turn (Vehicle.riderLean)
        bodyLean: 1,
        // The rider's dot on the mini map (WorldGuide.markers): told apart from the others, the player's red arrow and the yellow ride
        mapColor: 0x4aa8ff,
        // Fast everywhere, a little less so on tight twisty roads; daring in the middle
        traits: { country: 5, mountain: 5, hairpins: 4, daring: 3 },
        // Often in front, and navigates
        place: 1,
        group: { gapS: 1.6, gapSpread: 0.4, least: 0.85, most: 1.2, wander: 0.04, spurt: null, passPerS: 0.5, stop: null },
        physics: {
            comfortShake: 1.25,     // Race-firm - you feel everything
            maxSpeed: 1.10,        // 74.8 m/s top end
            acceleration: 1.10,    // 16.5 m/s²
            brakeForce: 1.05,      // 14.7 m/s²
            steeringForce: 1.0,    // 14.25 baseline
            jumpPower: 0.85,       // Stiff suspension, low clearance
            wheeliePop: 1.3,       // Power wheelies come easily
            wheelieThrottle: 1.15
        }
    },
    {
        id: 'alex',
        kg: 90,
        name: 'Alex',
        bikeLabel: 'Naked triple',
        bikeColor: '0x020202', // Matt black, red pinstripes
        bikes: ['bike02_speed_triple', 'bike10_tiger900'],
        outfits: OUTFITS.alex,
        kit: OUTFITS.alex[0].kit,
        build: { height: 1.0, width: 1.05 },
        // A modest lean into the turn (Vehicle.riderLean)
        bodyLean: 0.5,
        // The rider's dot on the mini map (WorldGuide.markers): told apart from the others, the player's red arrow and the yellow ride
        mapColor: 0xb884ff,
        // Quite slow on country roads, faster on mountain roads, not the fastest round hairpins
        traits: { country: 2, mountain: 4, hairpins: 3, daring: 2 },
        // Leads and navigates most of the time
        place: 2,
        group: { gapS: 2, gapSpread: 0.4, least: 0.85, most: 1.2, wander: 0.05, spurt: { perKm: 0.5, seconds: 15, gain: 1.12, country: 0, mountain: 1, hairpin: 0.3 }, passPerS: 0.35, stop: null },
        physics: {
            comfortShake: 0.55,     // Long-travel suspension soaks it up
            maxSpeed: 1.0,         // 68 m/s
            acceleration: 1.0,     // 15 m/s²
            brakeForce: 1.05,      // 14.7 m/s²
            steeringForce: 1.1,    // 15.68 - wide bars
            jumpPower: 1.25,       // Long-travel suspension
            wheeliePop: 1.0,
            wheelieThrottle: 1.0
        }
    },
    {
        id: 'tim',
        kg: 90,
        name: 'Tim',
        bikeLabel: 'Sports scooter',
        bikeColor: '0x030925', // Deep blue over silver and black
        // The scooter first, then his gloss black naked four (the one he rides on every trip)
        bikes: ['bike14_forza', 'bike06_z750'],
        outfits: OUTFITS.tim,
        kit: OUTFITS.tim[0].kit,
        // Tall and slim
        build: { height: 1.03, width: 0.95 },
        // A modest lean into the turn (Vehicle.riderLean)
        bodyLean: 0.5,
        // The rider's dot on the mini map (WorldGuide.markers): told apart from the others, the player's red arrow and the yellow ride
        mapColor: 0xffffff,
        // Usually quite slow, though he can ride fast at times; the least daring with Guy
        traits: { country: 2, mountain: 2, hairpins: 2, daring: 1 },
        // Toward the back, sometimes last, at a distance from the others
        place: 5,
        group: { gapS: 4.5, gapSpread: 0.6, least: 0.8, most: 1.2, wander: 0.06, spurt: { perKm: 0.25, seconds: 25, gain: 1.15, country: 1, mountain: 1, hairpin: 1 }, passPerS: 0.1, stop: { chance: 0.04, waitS: [15, 40] } },
        physics: {
            comfortShake: 0.3,      // Plush armchair ride
            maxSpeed: 0.75,        // 51 m/s
            acceleration: 0.8,     // 12 m/s² - smooth CVT
            brakeForce: 1.0,       // 14 m/s²
            steeringForce: 1.1,    // 15.68 - nimble at low speed
            jumpPower: 0.6,        // Terrible jumper
            wheeliePop: 0.75,
            wheelieThrottle: 0.9
        }
    },
    {
        id: 'shane',
        kg: 100,
        name: 'Shane',
        bikeLabel: 'Light naked single',
        bikeColor: '0x010101', // Black, white shrouds, orange frame
        // Least powerful first: the light single, the naked twin, the big naked twin, the big adventure tourer
        bikes: ['bike03_duke390', 'bike09_duke890', 'bike11_duke990', 'bike16_superadv'],
        outfits: OUTFITS.shane,
        kit: OUTFITS.shane[0].kit,
        // Broad
        build: { height: 1.0, width: 1.1 },
        // Sits in line with the bike at any lean (Vehicle.riderLean)
        bodyLean: 0,
        // The rider's dot on the mini map (WorldGuide.markers): told apart from the others, the player's red arrow and the yellow ride
        mapColor: 0x9aff3a,
        // Slower on country roads, bursts on mountain roads; the fastest round hairpins when he wants to, and the most daring for jumps
        traits: { country: 2, mountain: 4, hairpins: 5, daring: 5 },
        // In the middle, with bursts
        place: 4,
        group: { gapS: 1.4, gapSpread: 0.5, least: 0.85, most: 1.25, wander: 0.06, spurt: { perKm: 0.6, seconds: 20, gain: 1.18, country: 0.1, mountain: 1, hairpin: 1 }, passPerS: 0.45, stop: null },
        physics: {
            comfortShake: 0.85,     // Stiff MX setup but a standing-friendly ride
            maxSpeed: 0.85,        // 57.8 m/s
            acceleration: 1.1,     // 16.5 m/s²
            brakeForce: 1.0,       // 14 m/s²
            steeringForce: 1.15,   // 16.39 - flickable
            jumpPower: 1.5,        // Built for air
            wheeliePop: 1.2,
            wheelieThrottle: 1.1
        }
    },
    {
        id: 'lucy',
        kg: 55,
        footSlopeDeg: 5,
        name: 'Lucy',
        bikeLabel: 'Trail single',
        bikeColor: '0xa00102', // Red, white and black blocks
        // Least powerful first: the trail bike, her naked twin, her naked triple, the black track superbike
        bikes: ['bike15_crf250', 'bike01_z650', 'bike07_mt09', 'bike13_panigale_black'],
        outfits: OUTFITS.lucy,
        kit: OUTFITS.lucy[0].kit,
        // Slighter than the others
        build: { height: 0.93, width: 0.86 },
        // A modest lean into the turn (Vehicle.riderLean)
        bodyLean: 0.5,
        // The rider's dot on the mini map (WorldGuide.markers): told apart from the others, the player's red arrow and the yellow ride
        mapColor: 0xff6ad5,
        // A light trail single: modest pace, the easiest of all to turn, soft
        // long-travel suspension. Each number is what her naked twin had as
        // her first bike (0.8, 0.9, 1.08, 1.0, 1.12), times the light
        // adventure class the trail bike rides in, over the naked class, so
        // Vehicle.physicsOf gives the twin exactly what it had: a balanced
        // middleweight, a little under the adventure bike's top speed,
        // quick off the corners, easy to turn on a wide flat bar.
        // Careful, and a bit daring sometimes
        traits: { country: 3, mountain: 3, hairpins: 3, daring: 3 },
        // Near the front, never leading
        place: 3,
        group: { gapS: 1.8, gapSpread: 0.4, least: 0.85, most: 1.15, wander: 0.05, spurt: { perKm: 0.15, seconds: 8, gain: 1.08, country: 1, mountain: 1, hairpin: 1 }, passPerS: 0.25, stop: null },
        physics: {
            comfortShake: 0.8 * (0.55 * 1.1) / 0.8,     // 0.605 - long travel
            maxSpeed: 0.9 * (1.0 * 0.85) / 0.95,        // 0.805: 54.8 m/s
            acceleration: 1.08 * (1.0 * 0.9) / 1.08,    // 0.9: 13.5 m/s²
            brakeForce: 1.0 * (1.05 * 0.95) / 1.0,      // 0.9975: 13.97 m/s²
            steeringForce: 1.12 * (1.1 * 1.06) / 1.12,  // 1.166: 16.62 - wide bar, very light bike
            jumpPower: 1.0,
            wheeliePop: 1.15,      // Lifts the front easily on the torque
            wheelieThrottle: 1.05
        }
    },
    {
        id: 'guy',
        kg: 80,
        name: 'Guy',
        bikeLabel: 'Retro scrambler',
        bikeColor: '0x750102', // Red tank, black side panels
        bikes: ['bike04_scrambler', 'bike05_g310gs', 'bike07_mt09_black', 'bike12_tracer9gt'],
        outfits: OUTFITS.guy,
        kit: OUTFITS.guy[0].kit,
        // Slim
        build: { height: 0.99, width: 0.94 },
        // Hardly leans off the bike (Vehicle.riderLean)
        bodyLean: 0.2,
        // The rider's dot on the mini map (WorldGuide.markers): told apart from the others, the player's red arrow and the yellow ride
        mapColor: 0x46d39a,
        // A mid-size all-rounder: middling pace, easy to place, comfortable
        // over a long day
        // The slowest, on mountain roads too
        traits: { country: 1, mountain: 1, hairpins: 1, daring: 1 },
        // Last, and stops often
        place: 6,
        group: { gapS: 3, gapSpread: 0.5, least: 0.85, most: 1.15, wander: 0.04, spurt: null, passPerS: 0.05, stop: { chance: 0.3, waitS: [25, 70] } },
        physics: {
            comfortShake: 0.7,
            maxSpeed: 0.92,        // 62.6 m/s
            acceleration: 1.02,    // 15.3 m/s²
            brakeForce: 1.0,       // 14 m/s²
            steeringForce: 1.08,   // 15.39
            jumpPower: 1.05,
            wheeliePop: 1.0,
            wheelieThrottle: 1.0
        }
    }
];

// Physics multipliers of each class of bike. A character's own physics are
// them on their first bike; another bike scales them by its class against
// that bike's (Vehicle.physicsOf), so a character on their first bike rides
// exactly as before. `light` marks a small-capacity bike of its class.
const BIKE_CLASSES = {
    supersport: { maxSpeed: 1.1, acceleration: 1.1, steeringForce: 1.0, brakeForce: 1.05, comfortShake: 1.25 },
    naked: { maxSpeed: 0.95, acceleration: 1.08, steeringForce: 1.12, brakeForce: 1.0, comfortShake: 0.8 },
    retro: { maxSpeed: 0.9, acceleration: 1.0, steeringForce: 1.06, brakeForce: 0.95, comfortShake: 0.75 },
    adventure: { maxSpeed: 1.0, acceleration: 1.0, steeringForce: 1.1, brakeForce: 1.05, comfortShake: 0.55 },
    tourer: { maxSpeed: 1.02, acceleration: 1.02, steeringForce: 1.04, brakeForce: 1.05, comfortShake: 0.6 },
    scooter: { maxSpeed: 0.75, acceleration: 0.8, steeringForce: 1.1, brakeForce: 1.0, comfortShake: 0.3 }
};
const LIGHT_BIKE = { maxSpeed: 0.85, acceleration: 0.9, steeringForce: 1.06, brakeForce: 0.95, comfortShake: 1.1 };
// The range a scaled multiplier is held to, so a rider on a bike far from
// their first (Steve's superbike against his retro triple) stays within
// what the handling model was tuned over
const BIKE_LIMITS = { maxSpeed: [0.7, 1.2], acceleration: [0.75, 1.25], steeringForce: [0.9, 1.25], brakeForce: [0.9, 1.15], comfortShake: [0.25, 1.4] };

// An off-road bike (BIKE_MODELS `offroad`) on a leg's run-off ground: the
// run-off's drag, grip and floor speed (Terrain's RUNOFF) move toward these
// by the bike's trait (Vehicle.legRunoff). The legs have no grip lowside (a
// leg crashes on lean alone), so there is no power slide there
const LEG_OFFROAD = { drag: 0.15, grip: 0.7, floorSpeed: 10 };

// The detailed bikes (tools/blender/bikes, assets/bikes/detail). `kind` is
// the procedural bike (Vehicle.BIKES) that stands in while the file loads
// or if it fails; `name` and `year` are what the rider select shows; `paint`
// is the file's own paint colour, which the crash and wheelie tints work
// from. `mirror`: the file was written with +x on the rider's right, which
// three.js draws on the rider's left, so the loader mirrors it (the scripts
// of tools/blender/bikes/_kit_D.py and _kit_E.py mirror on export instead).
// `rearBrake` is the side the real bike carries its rear disc, `drive` its
// final drive; a chain is on the left on all of them. `seat` stands in for
// a file without a seat mark, `pose` sets the rider's lean and riding style,
// `luggage` shows the file's luggage node. Every one keeps its file's colours.
// `offroad` (0 to 1) is how much of an off-road bike it is on a world's land
// (WorldPhysics.offroad, the power slide), by its tyres, wheels, weight and
// suspension travel: 1 the trail single (knobbly tyres, 21 inch front, 150 kg),
// 0.75 the small adventure single (light, dual-sport tyres, a 19 inch front),
// 0.6 the adventure triple (a 21 inch front and long travel, but 220 kg),
// 0.5 the big adventure tourer (long travel, but a 19 inch cast front, road
// tyres, 245 kg and its luggage),
// 0.2 the scrambler (road tyres and short travel: wide bars and little else).
// A bike without it rides the land as a road bike.
// `kg` and `spare` are the two facts a wheelie reads (Vehicle.wheelieOf, Vehicle.popShare, Vehicle.liftShare): `kg`
// is the bike's weight ready to ride, and `spare` (0 to 1) the power it has to spare at speed, about 1.75 x its peak
// kW for each kg of bike and an 80 kg rider, at most 1; 0 for a bike with no clutch to slip and a belt that varies
// its own gearing, which can snap no drive to the wheel. .agent/system/handling.md has the rule.
// `leanMaxDeg` is the most the bike itself leans, in a world's degrees, before something under it grounds (a
// scooter's floorboards and centre stand): no rider, mode or tuning leans it further (Vehicle.leanMostOf). A bike
// without it is held by the grip and the rider's daring alone.
// `engine` is the engine's kind (single, parallel-twin, v-twin, triple, four, v4): the voice the sound gives it
// (js/sound.js Sound.ENGINES, .agent/system/sound.md).
const BIKE_MODELS = {
    bike01_z650: { kind: 'naked', cls: 'naked', engine: 'parallel-twin', kg: 187, spare: 0.33, name: 'Middleweight naked twin', year: 2020, paint: 0x010101, mirror: true, rearBrake: 'right', drive: 'chain', pose: { torsoLean: 0.24 } },
    bike02_speed_triple: { kind: 'naked', cls: 'naked', engine: 'triple', kg: 214, spare: 0.66, name: 'Naked triple, matt black', year: 2018, paint: 0x020202, mirror: true, rearBrake: 'left', drive: 'chain', luggage: true, pose: { torsoLean: 0.3 } },
    bike03_duke390: { kind: 'naked', cls: 'naked', engine: 'single', light: true, kg: 154, spare: 0.24, name: 'Light naked single', year: 2016, paint: 0x010101, mirror: true, rearBrake: 'right', drive: 'chain', luggage: true, pose: { torsoLean: 0.2 } },
    bike04_scrambler: { kind: 'naked', cls: 'retro', engine: 'v-twin', offroad: 0.2, kg: 186, spare: 0.35, name: 'Retro scrambler twin', year: 2017, paint: 0x750102, mirror: true, rearBrake: 'right', drive: 'chain', luggage: true, seat: [0.817, -0.15], pose: { torsoLean: 0.12 } },
    bike05_g310gs: { kind: 'adventure', cls: 'adventure', engine: 'single', light: true, offroad: 0.75, kg: 170, spare: 0.14, name: 'Small adventure single', year: 2018, paint: 0x8c0105, mirror: true, rearBrake: 'right', drive: 'chain', seat: [0.842, -0.17], pose: { torsoLean: 0.12, style: 'adv' } },
    bike06_z750: { kind: 'naked', cls: 'naked', engine: 'four', kg: 226, spare: 0.45, name: 'Naked four, gloss black', year: 2010, paint: 0x010101, mirror: true, rearBrake: 'right', drive: 'chain', luggage: true, seat: [0.818, -0.2], pose: { torsoLean: 0.24 } },
    bike07_mt09: { kind: 'naked', cls: 'naked', engine: 'triple', kg: 189, spare: 0.57, name: 'Naked triple, dark grey', year: 2021, paint: 0x08090b, mirror: true, rearBrake: 'right', drive: 'chain', luggage: true, pose: { torsoLean: 0.24 } },
    bike07_mt09_black: { kind: 'naked', cls: 'naked', engine: 'triple', kg: 189, spare: 0.57, name: 'Naked triple, blacked out', year: 2021, paint: 0x020202, mirror: true, rearBrake: 'right', drive: 'chain', luggage: true, pose: { torsoLean: 0.24 } },
    bike08_xsr900: { kind: 'sport', cls: 'retro', engine: 'triple', kg: 193, spare: 0.57, name: 'Retro sports triple', year: 2023, paint: 0x021b74, mirror: true, rearBrake: 'right', drive: 'chain', luggage: true, pose: { torsoLean: 0.26 } },
    bike09_duke890: { kind: 'naked', cls: 'naked', engine: 'parallel-twin', kg: 183, spare: 0.57, name: 'Naked twin, white and orange', year: 2020, paint: 0xcfcfc9, mirror: true, rearBrake: 'right', drive: 'chain', luggage: true, pose: { torsoLean: 0.26 } },
    bike10_tiger900: { kind: 'adventure', cls: 'adventure', engine: 'triple', offroad: 0.6, kg: 220, spare: 0.42, name: 'Adventure triple, khaki', year: 2022, paint: 0x655c46, rearBrake: 'right', drive: 'chain', pose: { torsoLean: 0.12, style: 'adv' } },
    bike11_duke990: { kind: 'naked', cls: 'naked', engine: 'parallel-twin', kg: 190, spare: 0.59, name: 'Big naked twin, orange', year: 2024, paint: 0xde2401, rearBrake: 'right', drive: 'chain', pose: { torsoLean: 0.28 } },
    bike12_tracer9gt: { kind: 'adventure', cls: 'tourer', engine: 'triple', kg: 220, spare: 0.51, name: 'Sports tourer triple, silver', year: 2022, paint: 0x636770, rearBrake: 'right', drive: 'chain', pose: { torsoLean: 0.16 } },
    bike13_panigale: { kind: 'sport', cls: 'supersport', engine: 'v4', kg: 198, spare: 1, name: 'V4 superbike, red', year: 2020, paint: 0x930106, rearBrake: 'left', drive: 'chain', pose: { torsoLean: 0.78, style: 'race' } },
    bike13_panigale_black: { kind: 'sport', cls: 'supersport', engine: 'v4', kg: 198, spare: 1, name: 'V4 superbike, black', year: 2020, paint: 0x010101, rearBrake: 'left', drive: 'chain', pose: { torsoLean: 0.78, style: 'race' } },
    bike14_forza: { kind: 'scooter', cls: 'scooter', engine: 'single', kg: 182, spare: 0, leanMaxDeg: 45, name: 'Sports scooter, blue and silver', year: 2019, paint: 0x030925, rearBrake: 'right', drive: 'belt', pose: { torsoLean: 0.06, style: 'commuter' } },
    bike15_crf250: { kind: 'dirt', cls: 'adventure', engine: 'single', light: true, offroad: 1, kg: 146, spare: 0.1, name: 'Trail single, red', year: 2019, paint: 0xa00102, rearBrake: 'right', drive: 'chain', pose: { torsoLean: 0.14, style: 'adv' } },
    bike16_superadv: { kind: 'adventure', cls: 'adventure', engine: 'v-twin', offroad: 0.5, kg: 245, spare: 0.64, name: 'Big adventure tourer, orange', year: 2021, paint: 0xde1d01, rearBrake: 'right', drive: 'chain', luggage: true, pose: { torsoLean: 0.12, style: 'adv' } }
};
// `far` is the bike as the touring crew ride it, a light file of its own made from the detail file (tools/blender/far.py)
Object.entries(BIKE_MODELS).forEach(([id, bike]) => Object.assign(bike, { id, file: `assets/bikes/detail/${id}.glb`, far: `assets/bikes/far/${id}.glb`, keepFileColours: true }));

class Vehicle {
    // The layer a mesh the camera is inside is moved to: the camera draws layer 0 only
    static get HIDDEN_LAYER() { return 31; }

    // Every mesh under `root` (the bike and rider) that holds `point` inside its surface, or has its surface within
    // `margin` of it, is drawn on no layer the camera sees; every other one goes back to what it was. A camera inside
    // a mesh draws its inside as a dark shell across the view (the rider's own helmet in Helmet Cam). `point` null
    // puts every mesh back. Layers, not `visible`, so a level of detail switching its levels cannot show a hidden part
    // again. Returns how many meshes are hidden
    static hideAround(root, point, margin = 0.1) {
        let hidden = 0;
        const local = Vehicle.hideScratch || (Vehicle.hideScratch = { p: new THREE.Vector3(), m: new THREE.Matrix4(), box: new THREE.Box3() });
        root.updateMatrixWorld(true);
        root.traverse(o => {
            if (!o.isMesh || !o.geometry) return;
            let inside = false;
            if (point) {
                if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
                local.m.copy(o.matrixWorld).invert();
                local.p.copy(point).applyMatrix4(local.m);
                const scale = o.matrixWorld.getMaxScaleOnAxis() || 1;
                inside = local.box.copy(o.geometry.boundingBox).expandByScalar(margin / scale).containsPoint(local.p) && Vehicle.encloses(o, local.p, margin / scale);
            }
            if (inside) {
                if (o.userData.layersBeforeHide === undefined) o.userData.layersBeforeHide = o.layers.mask;
                o.layers.set(Vehicle.HIDDEN_LAYER);
                hidden++;
            } else if (o.userData.layersBeforeHide !== undefined) {
                o.layers.mask = o.userData.layersBeforeHide;
                delete o.userData.layersBeforeHide;
            }
        });
        return hidden;
    }

    // Whether the mesh's own surface holds the local point `p` (a ray up from it crosses the surface an odd number of
    // times) or comes within `margin` of it. Kept per mesh for a point on a 2 cm grid: a camera pinned to the rider
    // hardly moves against it
    static encloses(mesh, p, margin) {
        const key = `${Math.round(p.x * 50)},${Math.round(p.y * 50)},${Math.round(p.z * 50)},${mesh.geometry.uuid}`;
        if (mesh.userData.enclosesKey === key) return mesh.userData.encloses;
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const count = index ? index.count : pos.count;
        const tri = new THREE.Triangle(), hit = new THREE.Vector3();
        const ray = new THREE.Ray(p.clone(), new THREE.Vector3(0, 1, 0));
        let up = 0, near = false;
        for (let t = 0; t < count && !near; t += 3) {
            tri.a.fromBufferAttribute(pos, index ? index.getX(t) : t);
            tri.b.fromBufferAttribute(pos, index ? index.getX(t + 1) : t + 1);
            tri.c.fromBufferAttribute(pos, index ? index.getX(t + 2) : t + 2);
            if (ray.intersectTriangle(tri.a, tri.b, tri.c, false, hit)) up++;
            if (margin > 0 && tri.closestPointToPoint(p, hit).distanceTo(p) < margin) near = true;
        }
        mesh.userData.enclosesKey = key;
        mesh.userData.encloses = near || up % 2 === 1;
        return mesh.userData.encloses;
    }

    constructor(scene, onWheelieScore = null, character = null, bikeId = null, options = {}) {
        this.scene = scene;
        // { model: false } builds the procedural bike only. { model: 'far' } is
        // the rider select's bike, which the caller dresses when it is looked
        // at (only the bike in view is fetched): until then it is drawn from
        // its own far level if its file is in memory, else procedural
        this.options = options;
        this.onWheelieScore = onWheelieScore;

        // Character selection drives the bike model variant and stat
        // multipliers. Default to Steve so existing callers keep the
        // original sport bike behaviour.
        this.character = character || CHARACTERS[0];
        // The bike this vehicle is (a BIKE_MODELS id, or a kind of
        // Vehicle.BIKES), and the kind that is built while its file loads
        this.model = Vehicle.modelOf(this.character, bikeId);
        // What the rider wears: the outfit named in options.outfit when the
        // character has it, else their first
        this.outfit = Vehicle.outfitOf(this.character, options.outfit);
        this.bike = Vehicle.kindOf(this.model);
        this.offroad = Vehicle.offroadOf(this.model);
        // The rider's weight, which with the bike's is the mass the handling reads (RIDER_MASS, Vehicle.pairOf)
        this.riderKg = Vehicle.riderKgOf(this.character);
        // How light the bike and its rider are and the power they have to spare, which shape the wheelie
        // (Vehicle.popShare, liftShare)
        this.wheelieBike = Vehicle.wheelieOf(this.model, this.riderKg);
        // Where the wheels turn and how big they are, [y, z, radius] in the
        // bike's axes: the procedural bike's, until a modelled bike brings
        // its own (BikeModels). Only the drawing reads them; the handling
        // keeps its one wheelbase.
        this.axles = { rear: [0.3, -0.7, 0.3], front: [0.3, 0.7, 0.3] };
        
        // Physical properties
        this.position = new THREE.Vector3(0, 0, 0); // Will be adjusted to road height after environment loads
        this.velocity = new THREE.Vector3(0, 0, 0);
        
        // Vehicle parameters
        this.speed = 20; // m/s (starts at ~72 km/h)
        this.minSpeed = 4; // m/s (~14 km/h) - below this, bike falls
        this.maxSpeed = 68; // m/s (~245 km/h) - increased for more thrill
        this.acceleration = 15; // m/s² - snappier acceleration
        this.brakeForce = 14; // m/s²: 20 x the owner's brake of 0.70 (.agent/system/handling.md, "The defaults")
        this.wheelbase = 1.4; // metres
        this.cgHeight = 0.6; // centre of gravity height
        this.mass = 200; // kg
        
        // State variables
        this.leanAngle = 0; // radians (positive = right lean)
        this.leanVelocity = 0;
        this.steeringAngle = 0;
        this.handlebarAngle = 0; // radians, the world bike's handlebar angle (the low-speed turn), positive with positive input
        this.yawAngle = 0;
        this.crashed = false;
        this.crashAngle = 0;
        this.previousSpeed = 0;
        this.fallingOffCliff = false;
        this.fallSide = 0; // -1 left, +1 right: the side the bike went over
        this.offRoadTime = 0; // Seconds in run-off without touching the road
        this.maxOffRoadTime = 6.0; // A rider this long off the road crashes
        this.runoff = null; // Run-off settings of the zone the bike is in, if any
        this.hitGround = false;
        this.tumbleSpeed = 0;
        this.tumbleAngle = 0;
        this.tumbleRoll = 0;
        this.fallStartY = 0;
        this.groundHitLogged = false;
        this.crashRecoveryTime = 0;
        this.crashPenaltyApplied = false;
        this.finished = false; // Set by game when leg is finished
        
        // Jump state
        this.isJumping = false;
        this.jumpVelocityY = 0;
        this.jumpStartHeight = 0;
        this.jumpRotation = 0;

        // Wheelie state
        this.isWheelie = false;
        this.wheelieAngle = 0;
        this.wheelieVelocity = 0;
        this.wheelieDamping = 0.15; // High damping for challenging wheelies
        this.wheelieStartTime = 0;
        this.wheelieScoreAccumulated = 0;
        
        // Advanced wheelie balance system
        this.wheelieBalance = 0; // -1 to 1, 0 is perfectly balanced

        // Weather system reference
        this.weatherSystem = null;
        this.wheelieOptimalAngle = Math.PI / 6; // 30 degrees - sweet spot
        this.wheelieDangerAngle = Math.PI / 3; // 60 degrees - danger zone
        this.wheelieCrashAngle = Math.PI * 0.45; // 81 degrees - too far!
        this.wheelieLastInputTime = 0;
        this.wheelieCombo = 0; // Combo multiplier for perfect balance
        this.wheeliePerfectFrames = 0; // Count frames in perfect zone
        
        // Distance tracking
        this.distanceTraveled = 0;
        this.lastPosition = new THREE.Vector3(0, 0, 0);

        // Road following tracking
        // `currentRoadSegment` is the projection's hint, read only here: the
        // route is searched near it. `routeS` is the one progress quantity the
        // rest of the game reads, metres along the route.
        this.currentRoadSegment = 0;
        this.routeS = 0;
        this.segmentProgress = 0; // Progress along current segment (0-1)
        this.projection = {}; // Scratch for route.project
        this.located = {}; // Scratch for a located point handed to the ground

        // World riding state (only used when the environment carries physics)
        this.worldGrade = 0; // Route grade under the bike (rise over run)
        this.worldThrottle = 0; // The world's throttle opening, 0 to 1 (it follows the input over throttleRiseS)
        this.lastDemand = 0; // Grip demand of the last world tick (v^2 * kappa / g)
        this.lowsideTimerMs = 0; // Time the demand has been over the lowside limit
        this.brushS = 0; // Seconds against a wall in this contact (wallTouch, brushStep)
        this.brushLeftS = 0; // Seconds the contact still lasts after the last touch
        this.brushInto = 0; // m/s the bike has lost into the wall in this contact, over all its touches
        this.brushNew = false; // A contact with a wall began: the game says so and clears it
        this.worldBrake = 0; // The brake input of the last world tick, 0 to 1
        this.slideAngle = 0; // Power slide: how far the drawn bike heads into the turn past its path (rad, signed as the yaw)
        this.wheelSlip = 0; // The drawn rear wheel's turn over the front's, from the slide
        this.footDown = false; // At a crawl near upright: a foot down, no fall
        this.tipTimerS = 0; // Time under fallSpeed leaned past tipLeanDeg
        // The rider's reach at a stop (FOOT_REACH, Vehicle.footReach): the steepest ground a foot reaches, as rise over
        // run (Infinity for a rider who reaches it anywhere); whether the bike has moved off since the last reset; how
        // long it has stood on steeper ground; whether the hint may be given (the bike has been over its band since
        // the last), and the frame it is
        this.footSlope = Vehicle.footSlopeOf(this.character);
        this.footArmed = false;
        this.footStillS = 0;
        this.footHint = false;
        this.footWarnNew = false;
        this.worldHeading = 0; // The route's heading under the bike (syncWorldSurface): the way its grade rises
        this.crashCause = null; // What the crash card says caused a world crash
        this.crashWhy = null; // The class of the cause (Vehicle.CRASH_CAUSES): what the rider's fall is drawn by
        this.landFastS = 0; // Time on the land over landCrashSpeed
        this.landSteepS = 0; // Time on land steeper than landSteepSlope
        this.landAlong = 0; // The land's slope along the heading, and across it (rise over run)
        this.landSteep = 0; // The land's slope whichever way it faces (rise over run), on the land
        this.landCover = 0; // The land cover class under the bike (WorldPhysics.landCover), on the land
        this.landAcross = 0;
        this.worldSurfaceGrip = 1; // Route surface grip (cobbles) under the bike
        this.assistLevel = null; // Hairpin assist level (off, low, normal); null reads WorldAssist.level(), the rider mode's
        this.resetHairpinAssist();

        // Road boundary state tracking for hysteresis
        this.wasNearEdge = false; // Prevents oscillating between edge states

         // Physics tuning
        this.steeringForce = 14.25; // How much force steering creates: 9.5 x the owner's lean rate of 1.50
        this.leanDamping = 0.016; // Natural damping - slightly less for more agility
        this.maxLeanAngle = Math.PI / 2.7; // ~67 degrees before crash - slightly more forgiving
        // How far this rider dares to lean, over the bike's own limit: in the leg's limit here, in a world's by riderWorld
        this.leanDare = Vehicle.leanOf(this.character);
        this.maxLeanAngle *= this.leanDare;
        // The most the bike itself leans (BIKE_MODELS leanMaxDeg, Vehicle.leanMostOf), over every rider, mode and
        // tuning: in a world's radians, and as a leg's lean (BIKE_LEAN legPerWorld). Infinity for a bike with none
        this.leanMostDeg = Vehicle.leanMostOf(this.model);
        this.leanMostRad = this.leanMostDeg * Math.PI / 180;
        this.leanMostLeg = this.leanMostRad * BIKE_LEAN.legPerWorld;
        // The lean rate by the mass of the bike and its rider (RIDER_MASS): a world's lean rate reads it here, a leg's in
        // steeringForce (Vehicle.pairOf)
        this.leanMass = Vehicle.massScale(this.character, this.model, 'steeringForce');

        // Apply per-character stat multipliers to the baseline physics,
        // scaled for a bike other than the character's first, and by the
        // mass of the bike and its rider (Vehicle.pairOf)
        const charPhysics = Vehicle.pairOf(this.character, this.model);
        this.maxSpeed *= charPhysics.maxSpeed || 1;
        this.acceleration *= charPhysics.acceleration || 1;
        this.brakeForce *= charPhysics.brakeForce || 1;
        this.steeringForce *= charPhysics.steeringForce || 1;
        this.jumpPowerMult = charPhysics.jumpPower || 1;
        this.comfortShake = charPhysics.comfortShake !== undefined ? charPhysics.comfortShake : 1;
        this.wheeliePopMult = charPhysics.wheeliePop || 1;
        this.wheelieThrottleMult = charPhysics.wheelieThrottle || 1;

        // Bodywork paint colour comes from the character (string form so the
        // existing parseInt(this.bikeColor) call sites keep working)
        const detail = BIKE_MODELS[this.model];
        this.bikeColor = detail ? `0x${detail.paint.toString(16).padStart(6, '0')}` : (this.character.bikeColor || '0x1a4db3');
        const baseColorHex = parseInt(this.bikeColor);
        this.baseColorRGB = {
            r: ((baseColorHex >> 16) & 255) / 255,
            g: ((baseColorHex >> 8) & 255) / 255,
            b: (baseColorHex & 255) / 255
        };

        this.createMesh();
    }

    createMesh() {
        this.group = new THREE.Group();
        // Yaw first, then pitch, then roll: with the default XYZ order the
        // wheelie/jump pitch (rotation.x) is applied in the WORLD frame, which
        // rolls the bike sideways on any heading not aligned with the Z axis
        this.group.rotation.order = 'YXZ';

        // Build the bike model variant for the selected character. Every
        // variant satisfies the same contract: rearWheel/frontWheel groups at
        // (0, 0.3, ±0.7), rearDisc/frontDisc, frame (crash/wheelie tint
        // material), fuelTank, brakeLight (emissive), rider (rotation.z
        // animated), handlebar, leftFork/rightFork, ground contact at y=0.
        const kind = Vehicle.BIKES[this.bike];
        this[kind.build]();
        Vehicle.mirrorParts(this.group, this.rider);
        this.rigSteering();

        // Base rider transform for the jump stand-up animation
        this.riderBasePos = this.rider.position.clone();
        this.riderBaseRotX = this.rider.rotation.x || 0;
        this.riderStandFactor = 0;
        this.riderStandHeight = kind.stand;

        this.scene.add(this.group);

        // The Blender-made bike and rider take the place of the parts built
        // above once their files are in; until then, and if a file fails,
        // the procedural model is the bike
        // { model: 'far' } is the stand-in of a bike that is shown but not looked at: the bike's own far level
        // when its file is in memory, and the parts built above the first time
        if (typeof BikeModels !== 'undefined' && this.options.model === 'far') BikeModels.standIn(this);
        else if (typeof BikeModels !== 'undefined' && this.options.model !== false) BikeModels.dress(this);
    }

    buildSportBike() {
        // ---- Steve: red supersport. Full race bodywork: lathe-turned tank,
        // extruded fairing panels with bevelled panel lines, 5-twin-spoke
        // alloys, drilled discs, twin upswept cans, race number roundels. ----
        const P = this.makeBikePalette(parseInt(localStorage.getItem('playerStripeColor') || '0xffffff'));
        this.stripeColor = localStorage.getItem('playerStripeColor') || '0xffffff';

        // Wheels: 5 twin-spoke alloys, fat rear slick, drilled discs
        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.16,
            frontTireRadius: 0.28, frontTireWidth: 0.12,
            rimRadius: 0.19, style: 'alloy', spokePairs: 5,
            discRadius: 0.25, caliperColor: 0xc42020, palette: P
        });

        // Upside-down forks with gold sliders + chrome stanchions
        this.buildForkPair({
            length: 0.52, x: 0.1, y: 0.55, z: 0.7, radius: 0.024,
            usd: true, sliderColor: 0xb8923e, palette: P
        });

        // ---- Frame: spine + twin-spar side beams (paint = feedback mat) ----
        this.frame = this.attachPart(new THREE.BoxGeometry(0.1, 0.16, 1.05), P.paint, 0, 0.62, 0.05);
        const sparGeometry = new THREE.BoxGeometry(0.035, 0.12, 0.55);
        this.attachPart(sparGeometry, P.paintDark, -0.14, 0.58, 0.12, { rx: 0.22 });
        this.attachPart(sparGeometry, P.paintDark, 0.14, 0.58, 0.12, { rx: 0.22 });

        // ---- Engine: block, angled cylinder bank, brushed covers ----
        this.engine = this.attachPart(new THREE.BoxGeometry(0.28, 0.26, 0.46), P.darkMetal, 0, 0.4, 0.06);
        this.attachPart(new THREE.BoxGeometry(0.26, 0.18, 0.22), P.steel, 0, 0.55, 0.24, { rx: -0.5 });
        // Clutch + alternator covers (brushed round cases)
        const caseGeometry = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14);
        this.attachPart(caseGeometry, P.steel, 0.15, 0.38, -0.04, { rz: Math.PI / 2 });
        this.attachPart(caseGeometry, P.steel, -0.15, 0.38, -0.04, { rz: Math.PI / 2 });
        const caseBossGeometry = new THREE.CylinderGeometry(0.035, 0.035, 0.014, 10);
        this.attachPart(caseBossGeometry, P.darkMetal, 0.168, 0.38, -0.04, { rz: Math.PI / 2 });
        this.attachPart(caseBossGeometry, P.darkMetal, -0.168, 0.38, -0.04, { rz: Math.PI / 2 });
        // Oil filter + sump
        this.attachPart(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 10), P.steel, 0.06, 0.3, 0.3, { rx: Math.PI / 2 });
        this.attachPart(new THREE.BoxGeometry(0.22, 0.06, 0.3), P.darkMetal, 0, 0.27, 0.02);

        // ---- Radiator with horizontal fin slats + hoses ----
        this.radiator = this.attachPart(new THREE.BoxGeometry(0.26, 0.2, 0.04), P.darkMetal, 0, 0.48, 0.42, { rx: -0.3 });
        const finGeometry = new THREE.BoxGeometry(0.24, 0.01, 0.05);
        for (let i = 0; i < 5; i++) {
            const fin = new THREE.Mesh(finGeometry, P.steelDark);
            fin.position.set(0, -0.075 + i * 0.038, 0.004);
            fin.castShadow = true;
            this.radiator.add(fin);
        }
        this.addCable([[0.1, 0.56, 0.4], [0.13, 0.5, 0.3], [0.12, 0.46, 0.2]], 0.013, P.rubber);
        this.addCable([[-0.1, 0.4, 0.4], [-0.13, 0.36, 0.28], [-0.12, 0.36, 0.12]], 0.013, P.rubber);

        // ---- Swingarm, chain and sprockets ----
        const swingarmGeometry = new THREE.BoxGeometry(0.05, 0.08, 0.6);
        this.attachPart(swingarmGeometry, P.steelDark, -0.11, 0.31, -0.4);
        this.attachPart(swingarmGeometry, P.steelDark, 0.11, 0.31, -0.4);
        // Rear sprocket spins with the wheel
        const rearSprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.016, 18), P.darkMetal);
        rearSprocket.rotation.z = Math.PI / 2;
        rearSprocket.position.set(-0.105, 0, 0);
        rearSprocket.castShadow = true;
        this.rearWheel.add(rearSprocket);
        const sprocketRing = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.02, 14), P.steel);
        rearSprocket.add(sprocketRing);
        this.attachPart(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12), P.darkMetal, -0.135, 0.4, -0.02, { rz: Math.PI / 2 });
        // Chain runs with a guard over the top span
        this.attachPart(new THREE.BoxGeometry(0.016, 0.024, 0.64), P.darkMetal, -0.125, 0.42, -0.36, { rx: -0.06 });
        this.attachPart(new THREE.BoxGeometry(0.016, 0.024, 0.64), P.darkMetal, -0.125, 0.27, -0.36, { rx: -0.23 });
        this.attachPart(new THREE.BoxGeometry(0.03, 0.014, 0.3), P.paintDark, -0.125, 0.45, -0.42, { rx: -0.06 });

        // Monoshock: red spring coil (stacked tori) over a chrome shaft
        this.attachPart(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), P.chrome, 0, 0.42, -0.29, { rx: 0.45 });
        const springGeometry = new THREE.TorusGeometry(0.036, 0.009, 5, 12);
        for (let i = 0; i < 4; i++) {
            this.attachPart(springGeometry, P.caliperRed,
                0, 0.36 + i * 0.045, -0.32 + i * 0.022, { rx: 0.45 + Math.PI / 2 });
        }

        // ---- Fuel tank: lathe-turned teardrop with filler cap + pad ----
        const tankGeometry = this.makeLathe([
            [0.0, 0.0], [0.15, 0.005], [0.205, 0.05], [0.225, 0.13],
            [0.205, 0.2], [0.15, 0.26], [0.06, 0.3], [0.0, 0.31]
        ], 18);
        this.fuelTank = this.attachPart(tankGeometry, P.paint, 0, 0.72, 0.16,
            { rx: 0.06, sx: 0.95, sy: 1.0, sz: 1.55 });
        this.attachPart(new THREE.CylinderGeometry(0.035, 0.04, 0.012, 10), P.chrome, 0, 1.025, 0.1);
        this.attachPart(new THREE.BoxGeometry(0.1, 0.012, 0.16), P.leather, 0, 0.985, -0.04, { rx: 0.22 });

        // Racing stripe hugging the tank curvature (narrow lathe shell)
        const stripeShell = this.makeLathe([
            [0.0, -0.002], [0.152, 0.004], [0.208, 0.05], [0.228, 0.13],
            [0.208, 0.2], [0.152, 0.26], [0.06, 0.302], [0.0, 0.312]
        ], 18);
        this.tankStripe = this.attachPart(stripeShell, P.accent, 0, 0.72, 0.16,
            { rx: 0.06, sx: 0.2, sy: 1.0, sz: 1.55 });

        // Knee recesses: dark sculpted panels flush in the tank flanks
        const kneePanelGeometry = new THREE.SphereGeometry(0.1, 12, 8);
        this.attachPart(kneePanelGeometry, P.paintDark, -0.16, 0.82, 0.08, { sx: 0.45, sy: 0.85, sz: 1.35 });
        this.attachPart(kneePanelGeometry, P.paintDark, 0.16, 0.82, 0.08, { sx: 0.45, sy: 0.85, sz: 1.35 });

        // ---- Front fairing: nose cone + bevelled extruded side panels ----
        const noseGeometry = new THREE.ConeGeometry(0.22, 0.55, 18);
        noseGeometry.rotateX(Math.PI / 2);
        this.frontFairing = this.attachPart(noseGeometry, P.paint, 0, 0.76, 0.64, { rx: 0.1, sx: 0.9, sy: 1.25 });
        this.attachPart(new THREE.SphereGeometry(0.24, 18, 12), P.paint, 0, 0.78, 0.4, { sx: 0.8, sy: 1.1, sz: 1.35 });

        // Main side fairing panels: extruded with bevelled panel edges
        const sideFairingGeometry = this.makePanel([
            [0.66, 0.88], [0.78, 0.72], [0.74, 0.55],
            [0.55, 0.36, 0.34, 0.32], [0.05, 0.3], [-0.06, 0.42],
            [0.1, 0.6, 0.3, 0.72]
        ], 0.05, 0.014);
        this.leftSideFairing = this.attachPart(sideFairingGeometry, P.paint, -0.195, 0, 0, { ry: 0.06 });
        this.rightSideFairing = this.attachPart(sideFairingGeometry, P.paint, 0.195, 0, 0, { ry: -0.06 });

        // Lower fairing panels in the darker two-tone shade
        const lowerFairingGeometry = this.makePanel([
            [0.5, 0.42], [0.58, 0.3], [0.46, 0.2], [-0.08, 0.2], [-0.16, 0.3], [-0.02, 0.4]
        ], 0.045, 0.012);
        this.attachPart(lowerFairingGeometry, P.paintDark, -0.155, 0, 0, { ry: 0.05 });
        this.attachPart(lowerFairingGeometry, P.paintDark, 0.155, 0, 0, { ry: -0.05 });

        // Panel lines: recessed dark seams between the panel groups
        const seamGeometry = new THREE.BoxGeometry(0.012, 0.014, 0.52);
        this.attachPart(seamGeometry, P.darkMetal, -0.21, 0.46, 0.22, { rx: 0.12 });
        this.attachPart(seamGeometry, P.darkMetal, 0.21, 0.46, 0.22, { rx: 0.12 });

        // Belly pan closing off the underside
        const bellyGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.78, 14);
        bellyGeometry.rotateX(Math.PI / 2);
        this.attachPart(bellyGeometry, P.paintDark, 0, 0.31, 0.1, { sy: 0.55 });

        // Decal flashes on the fairing flanks in the stripe colour
        const decalGeometry = new THREE.BoxGeometry(0.012, 0.07, 0.36);
        this.attachPart(decalGeometry, P.accent, -0.235, 0.62, 0.26, { rx: -0.2, ry: 0.08 });
        this.attachPart(decalGeometry, P.accent, 0.235, 0.62, 0.26, { rx: -0.2, ry: -0.08 });

        // Race number roundels on the tail flanks
        const roundelGeometry = new THREE.CircleGeometry(0.07, 16);
        const numberGeometry = new THREE.BoxGeometry(0.006, 0.07, 0.024);
        this.attachPart(roundelGeometry, P.plate, -0.185, 0.9, -0.42, { ry: -Math.PI / 2 });
        this.attachPart(roundelGeometry, P.plate, 0.185, 0.9, -0.42, { ry: Math.PI / 2 });
        this.attachPart(numberGeometry, P.darkMetal, -0.19, 0.9, -0.42);
        this.attachPart(numberGeometry, P.darkMetal, 0.19, 0.9, -0.42);

        // ---- Lights ----
        const headlightGeometry = new THREE.SphereGeometry(0.05, 10, 8);
        this.headlight = this.attachPart(headlightGeometry, P.headlight, -0.07, 0.74, 0.85, { sx: 1.2, sy: 0.65, sz: 0.6 });
        this.attachPart(headlightGeometry, P.headlight, 0.07, 0.74, 0.85, { sx: 1.2, sy: 0.65, sz: 0.6 });
        // Ram-air intakes flanking the nose
        const intakeGeometry = new THREE.BoxGeometry(0.07, 0.1, 0.05);
        this.attachPart(intakeGeometry, P.vent, -0.11, 0.62, 0.8, { ry: 0.3 });
        this.attachPart(intakeGeometry, P.vent, 0.11, 0.62, 0.8, { ry: -0.3 });

        // ---- Tail: upswept cowl + number plate + tail tidy ----
        const tailGeometry = new THREE.ConeGeometry(0.15, 0.55, 14);
        tailGeometry.rotateX(-Math.PI / 2);
        this.tailSection = this.attachPart(tailGeometry, P.paint, 0, 0.92, -0.6, { rx: 0.3, sx: 1.05, sy: 0.8 });
        this.attachPart(new THREE.SphereGeometry(0.17, 14, 10), P.paint, 0, 0.9, -0.38, { sx: 1.05, sy: 0.72, sz: 1.6 });
        this.attachPart(new THREE.BoxGeometry(0.2, 0.12, 0.42), P.paintDark, 0, 0.8, -0.48, { rx: 0.3 });
        // Tail tidy: licence plate + hanger + plate light
        this.attachPart(new THREE.BoxGeometry(0.02, 0.16, 0.04), P.darkMetal, 0, 0.62, -0.76, { rx: 0.5 });
        this.attachPart(new THREE.BoxGeometry(0.15, 0.09, 0.008), P.plate, 0, 0.55, -0.8, { rx: 0.25 });
        this.attachPart(new THREE.BoxGeometry(0.04, 0.012, 0.02), P.headlight, 0, 0.61, -0.79);

        // Seat: stitched leather pad stepped down from the tank
        const seatGeometry = new THREE.CapsuleGeometry(0.1, 0.28, 4, 12);
        seatGeometry.rotateX(Math.PI / 2);
        this.seat = this.attachPart(seatGeometry, P.leather, 0, 0.86, -0.06, { sx: 1.4, sy: 0.5 });
        this.attachPart(new THREE.BoxGeometry(0.16, 0.008, 0.26), P.steelDark, 0, 0.905, -0.06);

        // Brake light recessed in the tail tip (contract part)
        this.buildBrakeLight(0, 0.99, -0.84, 0.3);

        // ---- Windscreen: double-bubble + emissive dash ----
        const windscreenGeometry = new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.4);
        this.windscreen = this.attachPart(windscreenGeometry, P.glass, 0, 0.98, 0.44, { rx: -0.95, sx: 0.75, sy: 1.05, sz: 1.1 });
        this.attachPart(new THREE.BoxGeometry(0.16, 0.05, 0.08), P.darkMetal, 0, 0.93, 0.52, { rx: -0.5 });
        this.attachPart(new THREE.BoxGeometry(0.12, 0.035, 0.008), P.dash, 0, 0.95, 0.55, { rx: -0.5 });

        // ---- Cockpit: clip-ons, triple clamps, mirrors, steering damper ----
        this.buildHandlebar({ y: 1.0, z: 0.6, width: 0.46, mirrors: true, cables: true, palette: P });
        this.attachPart(new THREE.BoxGeometry(0.26, 0.05, 0.09), P.steelDark, 0, 0.8, 0.68);
        this.attachPart(new THREE.BoxGeometry(0.24, 0.04, 0.08), P.steelDark, 0, 0.7, 0.69);
        this.attachPart(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8), P.darkMetal, 0.08, 0.84, 0.62, { rz: Math.PI / 2, ry: 0.4 });

        // Front fender: curved carbon arc + brace
        const fenderGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.14, 14, 1, true, 0.5, 2.0);
        fenderGeometry.rotateZ(Math.PI / 2);
        this.frontFender = this.attachPart(fenderGeometry, P.carbon, 0, 0.3, 0.7);
        this.attachPart(new THREE.BoxGeometry(0.18, 0.012, 0.05), P.carbon, 0, 0.62, 0.71);
        // Rear hugger over the back tire
        const huggerGeometry = new THREE.CylinderGeometry(0.345, 0.345, 0.16, 12, 1, true, 2.7, 1.5);
        huggerGeometry.rotateZ(Math.PI / 2);
        this.attachPart(huggerGeometry, P.carbon, 0, 0.3, -0.7);

        // ---- Exhaust: twin headers into upswept lathe-turned cans ----
        this.addCable([[0.07, 0.46, 0.34], [0.12, 0.3, 0.3], [0.13, 0.24, 0.0], [0.14, 0.3, -0.3], [0.15, 0.42, -0.42]], 0.022, P.steel);
        this.addCable([[-0.07, 0.46, 0.34], [-0.12, 0.3, 0.3], [-0.13, 0.24, 0.0], [-0.14, 0.3, -0.3], [-0.15, 0.42, -0.42]], 0.022, P.steel);
        const canGeometry = this.makeLathe([
            [0.0, 0.0], [0.045, 0.0], [0.06, 0.05], [0.062, 0.32],
            [0.05, 0.44], [0.035, 0.47], [0.0, 0.47]
        ], 14);
        canGeometry.rotateX(-Math.PI / 2); // muzzle to the rear
        this.leftExhaust = this.attachPart(canGeometry, P.chrome, -0.16, 0.43, -0.32, { rx: 0.32 });
        this.rightExhaust = this.attachPart(canGeometry, P.chrome, 0.16, 0.43, -0.32, { rx: 0.32 });
        const tipGeometry = new THREE.CylinderGeometry(0.04, 0.046, 0.04, 12);
        tipGeometry.rotateX(Math.PI / 2);
        const canStrapGeometry = new THREE.TorusGeometry(0.064, 0.008, 5, 12);
        [this.leftExhaust, this.rightExhaust].forEach((can) => {
            const tip = new THREE.Mesh(tipGeometry, P.darkMetal);
            tip.position.set(0, 0, -0.47);
            tip.castShadow = true;
            can.add(tip);
            const strap = new THREE.Mesh(canStrapGeometry, P.darkMetal);
            strap.position.set(0, 0, -0.2);
            strap.castShadow = true;
            can.add(strap);
        });

        // Footpegs with hangers + heel guards, and a side stand
        const footpegGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.04);
        this.attachPart(footpegGeometry, P.steel, -0.21, 0.43, -0.13);
        this.attachPart(footpegGeometry, P.steel, 0.21, 0.43, -0.13);
        const hangerGeometry = new THREE.BoxGeometry(0.015, 0.12, 0.05);
        this.attachPart(hangerGeometry, P.steelDark, -0.17, 0.5, -0.12, { rz: 0.3 });
        this.attachPart(hangerGeometry, P.steelDark, 0.17, 0.5, -0.12, { rz: -0.3 });
        const heelGeometry = new THREE.BoxGeometry(0.01, 0.07, 0.1);
        this.attachPart(heelGeometry, P.carbon, -0.2, 0.49, -0.2);
        this.attachPart(heelGeometry, P.carbon, 0.2, 0.49, -0.2);
        this.attachPart(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 8), P.steelDark, -0.16, 0.18, 0.05, { rz: 0.55, rx: 0.25 });
        this.attachPart(new THREE.BoxGeometry(0.05, 0.014, 0.05), P.steelDark, -0.235, 0.045, 0.09);

        // ---- Rider: full racing tuck with aero hump and knee sliders ----
        this.buildVariantRider({
            ...Vehicle.BIKES.sport.seat,
            suitColor: 0x16161c, suitAccent: P.paintHex, helmetColor: 0xf0f0f2, helmetAccent: P.paintHex
        });
    }

    // ---- Shared construction helpers for the bike model variants ----

    // Per-bike material palette. `paint` is the colour-feedback material owned
    // by this.frame and shared by every painted panel, so crash flashes and
    // the wheelie brightness tint sweep the whole bodywork at once. Materials
    // are created per bike instance and never shared between bikes.
    makeBikePalette(accentHex = 0xffffff) {
        const paintHex = parseInt(this.bikeColor);
        const darkShade = new THREE.Color(paintHex).multiplyScalar(0.3);
        // Kept for the modelled bike (js/bikemodels.js), which wears the same paint
        this.palette = {
            paintHex,
            accentHex,
            paint: new THREE.MeshStandardMaterial({
                color: paintHex, roughness: 0.14, metalness: 0.68, envMapIntensity: 1.6
            }),
            paintDark: new THREE.MeshStandardMaterial({
                color: darkShade, roughness: 0.32, metalness: 0.6, envMapIntensity: 1.1
            }),
            accent: new THREE.MeshStandardMaterial({
                color: accentHex, roughness: 0.18, metalness: 0.75,
                emissive: accentHex, emissiveIntensity: 0.05, envMapIntensity: 1.5
            }),
            chrome: new THREE.MeshStandardMaterial({
                color: 0xe4e6ea, roughness: 0.05, metalness: 1.0, envMapIntensity: 2.2
            }),
            steel: new THREE.MeshStandardMaterial({
                color: 0x9aa0a6, roughness: 0.42, metalness: 0.95, envMapIntensity: 1.0
            }),
            steelDark: new THREE.MeshStandardMaterial({
                color: 0x55585e, roughness: 0.55, metalness: 0.9
            }),
            darkMetal: new THREE.MeshStandardMaterial({
                color: 0x17171c, roughness: 0.45, metalness: 0.75
            }),
            carbon: new THREE.MeshStandardMaterial({
                color: 0x121317, roughness: 0.35, metalness: 0.55, envMapIntensity: 1.2,
                side: THREE.DoubleSide
            }),
            rubber: new THREE.MeshStandardMaterial({
                color: 0x161616, roughness: 0.96, metalness: 0.0
            }),
            leather: new THREE.MeshStandardMaterial({
                color: 0x141418, roughness: 0.92, metalness: 0.0
            }),
            plastic: new THREE.MeshStandardMaterial({
                color: 0xe9e9ea, roughness: 0.5, metalness: 0.08
            }),
            plate: new THREE.MeshStandardMaterial({
                color: 0xf5f5f0, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide
            }),
            glass: new THREE.MeshStandardMaterial({
                color: 0x18242f, roughness: 0.04, metalness: 0.25, envMapIntensity: 2.0,
                transparent: true, opacity: 0.32, side: THREE.DoubleSide
            }),
            headlight: new THREE.MeshStandardMaterial({
                color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 0.85,
                roughness: 0.05, metalness: 0.3
            }),
            dash: new THREE.MeshStandardMaterial({
                color: 0x0c1016, emissive: 0x3fa8d6, emissiveIntensity: 0.65,
                roughness: 0.2, metalness: 0.2
            }),
            vent: new THREE.MeshStandardMaterial({
                color: 0x0a0a0c, roughness: 0.9, metalness: 0.1
            }),
            caliperRed: new THREE.MeshStandardMaterial({
                color: 0xc42020, roughness: 0.4, metalness: 0.5
            })
        };
        return this.palette;
    }

    // Creates a mesh with shadows on, places it, parents it and returns it.
    attachPart(geometry, material, x, y, z,
        { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, parent = this.group } = {}) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.rotation.x = rx;
        mesh.rotation.y = ry;
        mesh.rotation.z = rz;
        if (sx !== 1 || sy !== 1 || sz !== 1) mesh.scale.set(sx, sy, sz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
        return mesh;
    }

    // Surface of revolution (around local Y) from [radius, y] profile pairs.
    makeLathe(profile, segments = 16) {
        return new THREE.LatheGeometry(
            profile.map((p) => new THREE.Vector2(p[0], p[1])), segments);
    }

    // Bevelled extruded panel from a [z, y] outline in bike side view.
    // Entries of length 4 are quadratic curves: [controlZ, controlY, z, y].
    // The slab thickness runs across X centred on x=0 so one geometry serves
    // both flanks of the bike.
    makePanel(outline, thickness, bevel = 0.012) {
        const shape = new THREE.Shape();
        shape.moveTo(-outline[0][0], outline[0][1]);
        for (let i = 1; i < outline.length; i++) {
            const p = outline[i];
            if (p.length === 4) shape.quadraticCurveTo(-p[0], p[1], -p[2], p[3]);
            else shape.lineTo(-p[0], p[1]);
        }
        shape.closePath();
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: thickness, bevelEnabled: true, bevelThickness: bevel,
            bevelSize: bevel, bevelSegments: 2, steps: 1, curveSegments: 5
        });
        geometry.rotateY(Math.PI / 2);
        geometry.translate(-thickness / 2, 0, 0);
        return geometry;
    }

    // Thin cable/hose/pipe swept along a smooth curve through [x, y, z] points.
    addCable(points, radius = 0.008, material, parent = this.group) {
        const curve = new THREE.CatmullRomCurve3(
            points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
        const cable = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, radius, 5, false), material);
        cable.castShadow = true;
        parent.add(cable);
        return cable;
    }

    // Capsule limb segment between two joints, aligned via quaternion so the
    // rider reads as properly articulated rather than posed boxes.
    addLimb(parent, material, radius, ax, ay, az, bx, by, bz) {
        const dx = bx - ax, dy = by - ay, dz = bz - az;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const limb = new THREE.Mesh(
            new THREE.CapsuleGeometry(radius, Math.max(0.02, length - radius * 0.6), 3, 8),
            material
        );
        limb.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        limb.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(dx / length, dy / length, dz / length)
        );
        limb.castShadow = true;
        limb.receiveShadow = true;
        parent.add(limb);
        return limb;
    }

    // Builds front + rear wheel groups at the contract positions, with
    // round-profile torus tires, a per-bike rim style ('alloy' five twin
    // spokes / 'wire' laced spokes / 'solid' covered discs), drilled brake
    // discs and calipers. Adds everything to this.group.
    buildWheelSet({
        rearTireRadius = 0.3, rearTireWidth = 0.15,
        frontTireRadius = 0.28, frontTireWidth = 0.12,
        rimRadius = 0.18, style = 'alloy', spokePairs = 5, wireSpokes = 12,
        knobby = false, knobCount = 18,
        discRadius = 0.25, frontDiscRadius = null,
        rimColor = 0xb6b9bf, caliperColor = 0xc42020, palette = null
    } = {}) {
        const P = palette || this.makeBikePalette();
        const rimMaterial = new THREE.MeshStandardMaterial({
            color: rimColor, roughness: 0.22, metalness: 0.92, envMapIntensity: 1.6
        });

        const makeWheel = (tireRadius, tireWidth) => {
            const wheel = new THREE.Group();
            const tube = tireWidth / 2;

            const tireGeometry = new THREE.TorusGeometry(tireRadius - tube, tube, 9, 22);
            tireGeometry.rotateY(Math.PI / 2); // spin axis along x
            const tire = new THREE.Mesh(tireGeometry, P.rubber);
            tire.castShadow = true;
            tire.receiveShadow = true;
            wheel.add(tire);

            if (knobby) {
                // Knobby tread blocks in two offset rows; one shared geometry
                const knobGeometry = new THREE.BoxGeometry(tireWidth * 0.45, 0.032, 0.045);
                for (let i = 0; i < knobCount; i++) {
                    const angle = (i * Math.PI * 2) / knobCount;
                    const knob = new THREE.Mesh(knobGeometry, P.rubber);
                    const row = (i % 2 === 0) ? -tireWidth * 0.24 : tireWidth * 0.24;
                    knob.position.set(row, Math.cos(angle) * tireRadius, Math.sin(angle) * tireRadius);
                    knob.rotation.x = -angle;
                    knob.castShadow = true;
                    wheel.add(knob);
                }
            }

            const innerRadius = tireRadius - tube * 2;
            if (style === 'solid') {
                // Covered scooter wheel: full disc, recessed vents, hub cap
                const cover = new THREE.Mesh(
                    new THREE.CylinderGeometry(innerRadius + 0.03, innerRadius + 0.03, tireWidth * 0.7, 18),
                    rimMaterial
                );
                cover.rotation.z = Math.PI / 2;
                cover.castShadow = true;
                wheel.add(cover);
                const ventGeometry = new THREE.CylinderGeometry(0.018, 0.018, tireWidth * 0.74, 6);
                for (let i = 0; i < 6; i++) {
                    const a = (i * Math.PI * 2) / 6;
                    const vent = new THREE.Mesh(ventGeometry, P.darkMetal);
                    vent.rotation.z = Math.PI / 2;
                    vent.position.set(0, Math.cos(a) * innerRadius * 0.62, Math.sin(a) * innerRadius * 0.62);
                    wheel.add(vent);
                }
                const capGeometry = new THREE.SphereGeometry(0.05, 10, 8);
                const cap = new THREE.Mesh(capGeometry, P.chrome);
                cap.scale.set(0.55, 1, 1);
                cap.position.set(tireWidth * 0.36, 0, 0);
                cap.castShadow = true;
                wheel.add(cap);
            } else {
                // Rim barrel just inside the tire bead
                const rim = new THREE.Mesh(
                    new THREE.CylinderGeometry(innerRadius + 0.025, innerRadius + 0.025, tireWidth * 0.78, 18, 1, true),
                    rimMaterial
                );
                rim.rotation.z = Math.PI / 2;
                rim.castShadow = true;
                wheel.add(rim);
                // Rim lips
                const lipGeometry = new THREE.TorusGeometry(innerRadius + 0.02, 0.011, 5, 18);
                lipGeometry.rotateY(Math.PI / 2);
                [-1, 1].forEach((side) => {
                    const lip = new THREE.Mesh(lipGeometry, rimMaterial);
                    lip.position.set(side * tireWidth * 0.39, 0, 0);
                    lip.castShadow = true;
                    wheel.add(lip);
                });

                if (style === 'wire') {
                    // Laced wire spokes: thin through-rods radiating in the
                    // wheel disc (fan around the X axle), alternating a small
                    // lateral lean for the cross-laced look
                    const spokeGeometry = new THREE.CylinderGeometry(0.0045, 0.0045, innerRadius * 2 + 0.03, 5);
                    for (let i = 0; i < wireSpokes; i++) {
                        const spoke = new THREE.Mesh(spokeGeometry, P.chrome);
                        spoke.rotation.x = (i * Math.PI * 2) / wireSpokes;
                        spoke.rotation.z = (i % 2 === 0 ? 0.1 : -0.1); // Lean toward the hub flanges
                        spoke.castShadow = true;
                        wheel.add(spoke);
                    }
                    const wireHub = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.055, 0.055, tireWidth * 0.6 + 0.05, 12), rimMaterial);
                    wireHub.rotation.z = Math.PI / 2;
                    wireHub.castShadow = true;
                    wheel.add(wireHub);
                } else {
                    // Alloy: five twin-spoke pairs (through-bars radiating in
                    // the wheel disc, slight angular gap between the twins)
                    const spokeGeometry = new THREE.BoxGeometry(0.018, innerRadius * 2 + 0.02, 0.028);
                    for (let i = 0; i < spokePairs; i++) {
                        for (let s = -1; s <= 1; s += 2) {
                            const spoke = new THREE.Mesh(spokeGeometry, rimMaterial);
                            spoke.rotation.x = (i * Math.PI) / spokePairs + s * 0.07;
                            spoke.castShadow = true;
                            wheel.add(spoke);
                        }
                    }
                    const hub = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.06, 0.06, tireWidth * 0.85, 12), rimMaterial);
                    hub.rotation.z = Math.PI / 2;
                    hub.castShadow = true;
                    wheel.add(hub);
                }
                // Valve stem
                const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.025, 5), P.darkMetal);
                valve.position.set(tireWidth * 0.34, innerRadius * 0.8, 0.03);
                wheel.add(valve);
            }

            wheel.castShadow = true;
            wheel.receiveShadow = true;
            return wheel;
        };

        this.rearWheel = makeWheel(rearTireRadius, rearTireWidth);
        this.rearWheel.position.set(0, 0.3, -0.7);
        this.frontWheel = makeWheel(frontTireRadius, frontTireWidth);
        this.frontWheel.position.set(0, 0.3, 0.7);
        this.group.add(this.rearWheel);
        this.group.add(this.frontWheel);

        // Drilled floating discs (contract: rotation.x is spun by updateMesh)
        const fDiscRadius = frontDiscRadius || discRadius;
        this.rearDisc = this.makeBrakeDisc(discRadius, P);
        this.rearDisc.position.set(0.09, 0.3, -0.7);
        this.frontDisc = this.makeBrakeDisc(fDiscRadius, P);
        this.frontDisc.position.set(0.09, 0.3, 0.7);
        this.group.add(this.rearDisc);
        this.group.add(this.frontDisc);

        // Calipers gripping the disc edges
        const caliperMaterial = new THREE.MeshStandardMaterial({
            color: caliperColor, roughness: 0.38, metalness: 0.55, envMapIntensity: 1.2
        });
        this.addCaliper(0.105, 0.3 - discRadius * 0.55, -0.7 + discRadius * 0.5, caliperMaterial, P);
        this.addCaliper(0.105, 0.3 - fDiscRadius * 0.55, 0.7 - fDiscRadius * 0.5, caliperMaterial, P);
    }

    // Brake disc with carrier and a ring of drilled-look holes
    makeBrakeDisc(radius, P) {
        const discMaterial = new THREE.MeshStandardMaterial({
            color: 0xb9bcc2, roughness: 0.32, metalness: 1.0, envMapIntensity: 1.4
        });
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.012, 22), discMaterial);
        disc.rotation.z = Math.PI / 2;
        disc.castShadow = true;
        disc.receiveShadow = true;
        const carrier = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, 0.018, 12), P.darkMetal);
        carrier.castShadow = true;
        disc.add(carrier);
        const holeGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.018, 5);
        for (let i = 0; i < 8; i++) {
            const a = (i * Math.PI * 2) / 8;
            const hole = new THREE.Mesh(holeGeometry, P.darkMetal);
            hole.position.set(Math.cos(a) * radius * 0.74, 0, Math.sin(a) * radius * 0.74);
            disc.add(hole);
        }
        return disc;
    }

    // Brake caliper body with pad ribs, static at group level
    addCaliper(x, y, z, caliperMaterial, P) {
        const caliper = this.attachPart(new THREE.BoxGeometry(0.05, 0.085, 0.13), caliperMaterial, x, y, z);
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.02, 0.02), P.darkMetal);
        rib.position.set(0, 0.01, 0.035);
        caliper.add(rib);
        const rib2 = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.02, 0.02), P.darkMetal);
        rib2.position.set(0, 0.01, -0.035);
        caliper.add(rib2);
        return caliper;
    }

    // Builds the left/right fork legs (stanchion + slider + axle clamp) and
    // adds them to this.group, plus a front axle. usd puts the thick slider
    // tube on top (modern inverted forks); gaiters adds rubber bellows.
    buildForkPair({
        length = 0.5, x = 0.1, y = 0.55, z = 0.7, radius = 0.025, rake = 0,
        usd = false, sliderColor = 0x8b8f96, gaiters = false, guards = false,
        guardMaterial = null, palette = null
    } = {}) {
        const P = palette || this.makeBikePalette();
        const stanchionMaterial = new THREE.MeshStandardMaterial({
            color: 0xd9dbdf, roughness: 0.08, metalness: 1.0, envMapIntensity: 2.0
        });
        const sliderMaterial = new THREE.MeshStandardMaterial({
            color: sliderColor, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.4
        });

        const buildLeg = (side) => {
            const leg = new THREE.Mesh(
                new THREE.CylinderGeometry(radius, radius, length, 10), stanchionMaterial);
            leg.position.set(side * x, y, z);
            leg.rotation.x = rake;
            leg.castShadow = true;
            leg.receiveShadow = true;
            // Thick outer tube over half the leg
            const sleeve = new THREE.Mesh(
                new THREE.CylinderGeometry(radius * 1.55, radius * 1.55, length * 0.52, 10), sliderMaterial);
            sleeve.position.set(0, usd ? length * 0.24 : -length * 0.24, 0);
            sleeve.castShadow = true;
            leg.add(sleeve);
            // Axle clamp foot
            const clamp = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.6, 0.06, 0.05), P.steelDark);
            clamp.position.set(0, -length / 2 + 0.02, 0);
            clamp.castShadow = true;
            leg.add(clamp);
            if (gaiters) {
                const gaiterGeometry = new THREE.TorusGeometry(radius * 1.7, 0.013, 5, 10);
                gaiterGeometry.rotateX(Math.PI / 2);
                for (let i = 0; i < 4; i++) {
                    const ring = new THREE.Mesh(gaiterGeometry, P.rubber);
                    ring.position.set(0, -length * 0.08 - i * 0.05, 0);
                    ring.castShadow = true;
                    leg.add(ring);
                }
            }
            if (guards) {
                const guardGeometry = new THREE.CylinderGeometry(
                    radius * 2.3, radius * 2.6, length * 0.5, 8, 1, true, -Math.PI / 2, Math.PI);
                const guard = new THREE.Mesh(guardGeometry, guardMaterial || P.plastic);
                guard.position.set(0, -length * 0.2, 0.01);
                guard.castShadow = true;
                leg.add(guard);
            }
            this.group.add(leg);
            return leg;
        };

        this.leftFork = buildLeg(-1);
        this.rightFork = buildLeg(1);
        // Front axle across the wheel hub
        this.attachPart(new THREE.CylinderGeometry(0.016, 0.016, x * 2 + 0.1, 8), P.chrome,
            0, 0.3, 0.7, { rz: Math.PI / 2 });
    }

    // Full articulated rider: torso + chest panel, helmet with visor and
    // vents, two-segment arms with gloves, two-segment legs with boots, all
    // children of this.rider so the lean (rotation.z) and the jump stand-up
    // animation (position/rotation.x driven from riderBasePos in updateMesh)
    // move the whole body. torsoLean is baked into the torso geometry so
    // rotation.x stays free for the stand-up blend.
    //
    // The kit of the outfit the rider wears (OUTFITS, or a character's own
    // `kit`) overrides the bike's rider colours. Gear left out takes the old
    // colours: trousers the suit's, boots the gloves', the knees, boot soles
    // and helmet trim the accents'. A style names the cut of a part of the
    // modelled rider (helmet_<style> and the rest in tools/blender/rider.py);
    // backpackColor gives the rider a backpack. What this stand-in does not
    // draw (the styles, the trim colours, the neck tube, the build) goes to
    // the modelled rider through riderSpec.
    buildVariantRider(options = {}) {
        // The pose and colours, kept for the modelled rider (js/bikemodels.js)
        this.riderSpec = Vehicle.riderSpec({ ...options, ...(this.outfit ? this.outfit.kit : this.character.kit) }, this.character, this.model);
        const {
            y, z, torsoLean, suitColor, suitAccent, helmetColor, helmetAccent, gloveColor, pantsColor, bootColor, bootAccent,
            backpackColor, style, hand, foot, elbowOut, kneeOut, kneeForward, scarf
        } = this.riderSpec;
        const suitMaterial = new THREE.MeshStandardMaterial({
            color: suitColor, roughness: 0.85, metalness: 0.0
        });
        const accentMaterial = new THREE.MeshStandardMaterial({
            color: suitAccent, roughness: 0.6, metalness: 0.15
        });
        const gloveMaterial = new THREE.MeshStandardMaterial({
            color: gloveColor, roughness: 0.9, metalness: 0.0
        });
        const pantsMaterial = new THREE.MeshStandardMaterial({
            color: pantsColor, roughness: 0.85, metalness: 0.0
        });
        const bootMaterial = new THREE.MeshStandardMaterial({
            color: bootColor, roughness: 0.9, metalness: 0.0
        });
        const soleMaterial = new THREE.MeshStandardMaterial({
            color: bootAccent, roughness: 0.6, metalness: 0.15
        });
        const helmetMaterial = new THREE.MeshStandardMaterial({
            color: helmetColor, roughness: 0.12, metalness: 0.35, envMapIntensity: 1.8
        });
        const helmetAccentMaterial = new THREE.MeshStandardMaterial({
            color: helmetAccent, roughness: 0.2, metalness: 0.4
        });
        const visorMaterial = new THREE.MeshStandardMaterial({
            color: 0x0e1218, roughness: 0.06, metalness: 0.45, envMapIntensity: 2.0
        });

        // Torso with the riding lean baked into the geometry (rotation stays
        // free for the lean/stand-up animation channels)
        const torsoGeometry = new THREE.CapsuleGeometry(0.13, 0.3, 4, 12);
        torsoGeometry.rotateX(torsoLean);
        this.rider = new THREE.Mesh(torsoGeometry, suitMaterial);
        this.rider.position.set(0, y, z);
        this.rider.castShadow = true;
        this.rider.receiveShadow = true;

        // Torso axis and facing direction for placing attachments
        const dY = Math.cos(torsoLean), dZ = Math.sin(torsoLean);
        const fY = -dZ, fZ = dY; // forward (chest) direction

        // Chest panel: contrast leathers/jacket front
        const chestGeometry = new THREE.CapsuleGeometry(0.115, 0.24, 3, 10);
        chestGeometry.rotateX(torsoLean);
        const chest = new THREE.Mesh(chestGeometry, accentMaterial);
        chest.scale.set(1.0, 1.0, 0.62);
        chest.position.set(0, fY * 0.075, fZ * 0.075);
        chest.castShadow = true;
        this.rider.add(chest);

        // Waist belt ring
        const beltGeometry = new THREE.TorusGeometry(0.142, 0.018, 5, 12);
        const belt = new THREE.Mesh(beltGeometry, gloveMaterial);
        belt.rotation.x = torsoLean - Math.PI / 2;
        belt.position.set(0, dY * -0.13, dZ * -0.13);
        this.rider.add(belt);

        if (style === 'race') {
            // Aero hump on the back of the leathers
            const hump = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), suitMaterial);
            hump.scale.set(1.0, 1.3, 1.1);
            hump.position.set(0, dY * 0.16 - fY * 0.1, dZ * 0.16 - fZ * 0.1);
            hump.castShadow = true;
            this.rider.add(hump);
        }
        if (backpackColor !== null) {
            const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.12), new THREE.MeshStandardMaterial({
                color: backpackColor, roughness: 0.8, metalness: 0.05
            }));
            pack.rotation.x = torsoLean;
            pack.position.set(0, dY * 0.04 - fY * 0.17, dZ * 0.04 - fZ * 0.17);
            pack.castShadow = true;
            this.rider.add(pack);
        }

        if (scarf !== null) this.rider.add(Vehicle.buildScarf(scarf, torsoLean, 0.21));

        // ---- Helmet: shell, visor, vents, accent stripe ----
        const headY = dY * 0.31, headZ = dZ * 0.31;
        this.helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), helmetMaterial);
        this.helmet.position.set(0, headY + fY * 0.03, headZ + fZ * 0.03);
        this.helmet.castShadow = true;
        this.rider.add(this.helmet);

        this.visor = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), visorMaterial);
        this.visor.scale.set(1.08, 0.62, 0.55);
        this.visor.position.set(0, headY + fY * 0.1 - dY * 0.005, headZ + fZ * 0.1);
        this.visor.castShadow = true;
        this.rider.add(this.visor);

        // Crown stripe sweeping front-to-back + top vents
        const crestGeometry = new THREE.TorusGeometry(0.112, 0.016, 5, 10, Math.PI);
        const crest = new THREE.Mesh(crestGeometry, helmetAccentMaterial);
        crest.rotation.y = -Math.PI / 2;
        crest.rotation.x = torsoLean - 0.2;
        crest.position.set(0, this.helmet.position.y + 0.008, this.helmet.position.z);
        crest.castShadow = true;
        this.rider.add(crest);
        const ventGeometry = new THREE.BoxGeometry(0.035, 0.014, 0.05);
        [-0.045, 0.045].forEach((vx) => {
            const vent = new THREE.Mesh(ventGeometry, visorMaterial);
            vent.position.set(vx, this.helmet.position.y + dY * 0.065, this.helmet.position.z + dZ * 0.065 - fZ * 0.04);
            vent.rotation.x = torsoLean;
            this.rider.add(vent);
        });
        // Chin bar
        const chin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.06), helmetMaterial);
        chin.position.set(0, this.helmet.position.y - dY * 0.09 + fY * 0.075, this.helmet.position.z - dZ * 0.09 + fZ * 0.075);
        chin.rotation.x = torsoLean;
        chin.castShadow = true;
        this.rider.add(chin);
        if (style === 'mx') {
            // Motocross peak above the visor
            const peak = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.12), helmetAccentMaterial);
            peak.position.set(0, this.helmet.position.y + dY * 0.075 + fY * 0.07, this.helmet.position.z + dZ * 0.075 + fZ * 0.07);
            peak.rotation.x = torsoLean - 0.35;
            peak.castShadow = true;
            this.rider.add(peak);
            // Goggle strap around the shell
            const strapGeometry = new THREE.TorusGeometry(0.122, 0.012, 4, 12);
            const strap = new THREE.Mesh(strapGeometry, accentMaterial);
            strap.rotation.x = torsoLean - 0.15;
            strap.position.set(0, this.helmet.position.y, this.helmet.position.z);
            this.rider.add(strap);
        }

        // ---- Arms: shoulder -> elbow -> glove, both sides ----
        const armRadius = 0.046, forearmRadius = 0.04;
        this.arms = {};
        [-1, 1].forEach((side) => {
            const sx = side * 0.15, sy = dY * 0.17, sz = dZ * 0.17;
            const hx = side * hand[0], hy = hand[1], hz = hand[2];
            const elbowX = (sx + hx) / 2 + side * elbowOut;
            const elbowY = (sy + hy) / 2 - 0.02;
            const elbowZ = (sz + hz) / 2 - 0.03;
            // Shoulder armor cap
            const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), accentMaterial);
            shoulder.position.set(sx, sy, sz);
            shoulder.castShadow = true;
            this.rider.add(shoulder);
            const upper = this.addLimb(this.rider, suitMaterial, armRadius, sx, sy, sz, elbowX, elbowY, elbowZ);
            const lower = this.addLimb(this.rider, suitMaterial, forearmRadius, elbowX, elbowY, elbowZ, hx, hy, hz);
            const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 6), suitMaterial);
            elbow.position.set(elbowX, elbowY, elbowZ);
            elbow.castShadow = true;
            this.rider.add(elbow);
            const glove = new THREE.Mesh(new THREE.SphereGeometry(0.046, 8, 6), gloveMaterial);
            glove.scale.set(0.9, 0.75, 1.25);
            glove.position.set(hx, hy, hz);
            glove.castShadow = true;
            this.rider.add(glove);
            if (side > 0) { this.leftArm = upper; this.leftForearm = lower; }
            else { this.rightArm = upper; this.rightForearm = lower; }
            this.arms[side] = Vehicle.rigLimb({
                root: new THREE.Vector3(sx, sy, sz),
                mid: new THREE.Vector3(elbowX, elbowY, elbowZ),
                end: new THREE.Vector3(hx, hy, hz),
                pieces: [[upper, 'root', 'mid'], [lower, 'mid', 'end']],
                carried: { mid: [elbow], end: [glove] }
            });
        });

        // ---- Legs: hip -> knee -> boot, both sides ----
        // The rider is not mirrored with the bike, so +x is the rider's left here as everywhere (Route.LEFT)
        this.legs = {};
        [-1, 1].forEach((side) => {
            const px = side * 0.095, py = dY * -0.16, pz = dZ * -0.16;
            const fx = side * foot[0], fy = foot[1], fz = foot[2];
            const kx = (px + fx) / 2 + side * kneeOut;
            const ky = (py + fy) / 2 + 0.03;
            const kz = (pz + fz) / 2 + kneeForward;
            const thigh = this.addLimb(this.rider, pantsMaterial, 0.062, px, py, pz, kx, ky, kz);
            const shin = this.addLimb(this.rider, pantsMaterial, 0.05, kx, ky, kz, fx, fy, fz);
            const knee = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6),
                (style === 'race' || style === 'mx') ? accentMaterial : pantsMaterial);
            knee.position.set(kx, ky, kz);
            knee.castShadow = true;
            this.rider.add(knee);
            // Boot with contrast sole; taller shaft for mx
            const bootHeight = style === 'mx' ? 0.13 : 0.075;
            const boot = new THREE.Mesh(new THREE.BoxGeometry(0.085, bootHeight, 0.21), bootMaterial);
            boot.position.set(fx, fy + bootHeight / 2 - 0.025, fz + 0.045);
            boot.rotation.x = 0.12;
            boot.castShadow = true;
            this.rider.add(boot);
            const sole = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.018, 0.22), soleMaterial);
            sole.position.set(fx, fy - 0.03, fz + 0.045);
            sole.rotation.x = 0.12;
            this.rider.add(sole);
            if (side > 0) this.leftLeg = thigh; else this.rightLeg = thigh;
            this.legs[side] = Vehicle.rigLimb({
                rider: this.rider,
                root: new THREE.Vector3(px, py, pz),
                mid: new THREE.Vector3(kx, ky, kz),
                end: new THREE.Vector3(fx, fy, fz),
                pieces: [[thigh, 'root', 'mid'], [shin, 'mid', 'end']],
                carried: { mid: [knee], end: [boot, sole] }
            });
        });

        this.group.add(this.rider);
    }

    // Brake light helper - emissive red lens in a dark housing, toggled by
    // updateMesh() (contract: this.brakeLight.material.emissive)
    buildBrakeLight(x, y, z, tiltX = 0) {
        const brakeMaterial = new THREE.MeshStandardMaterial({
            color: 0xc40b0b, emissive: 0x000000, emissiveIntensity: 0.0,
            roughness: 0.15, metalness: 0.2
        });
        this.brakeLight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.035), brakeMaterial);
        this.brakeLight.position.set(x, y, z);
        this.brakeLight.rotation.x = tiltX;
        this.brakeLight.castShadow = true;
        this.brakeLight.receiveShadow = true;
        const housingMaterial = new THREE.MeshStandardMaterial({
            color: 0x101013, roughness: 0.6, metalness: 0.4
        });
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.065, 0.03), housingMaterial);
        housing.position.set(0, 0, 0.012);
        housing.castShadow = true;
        this.brakeLight.add(housing);
        this.group.add(this.brakeLight);
    }

    // Handlebar with grips, bar-end weights, levers, master cylinder and
    // optional mirrors/crossbar/risers, plus brake+clutch cables dropping to
    // the steering head. Added to this.group (contract: this.handlebar).
    buildHandlebar({
        y, z, width = 0.5, crossbar = false, mirrors = false, risers = false,
        cables = true, palette = null
    } = {}) {
        const P = palette || this.makeBikePalette();
        const barGeometry = new THREE.CylinderGeometry(0.021, 0.021, width, 10);
        barGeometry.rotateZ(Math.PI / 2);
        this.handlebar = new THREE.Mesh(barGeometry, P.chrome);
        this.handlebar.position.set(0, y, z);
        this.handlebar.castShadow = true;
        this.handlebar.receiveShadow = true;

        const gripGeometry = new THREE.CylinderGeometry(0.031, 0.031, 0.11, 10);
        gripGeometry.rotateZ(Math.PI / 2);
        const endGeometry = new THREE.CylinderGeometry(0.034, 0.034, 0.015, 8);
        endGeometry.rotateZ(Math.PI / 2);
        const leverGeometry = new THREE.BoxGeometry(0.012, 0.012, 0.1);
        [-1, 1].forEach((side) => {
            const grip = new THREE.Mesh(gripGeometry, P.rubber);
            grip.position.set(side * (width / 2 - 0.06), 0, 0);
            grip.castShadow = true;
            this.handlebar.add(grip);
            const end = new THREE.Mesh(endGeometry, P.darkMetal);
            end.position.set(side * (width / 2 + 0.005), 0, 0);
            this.handlebar.add(end);
            const lever = new THREE.Mesh(leverGeometry, P.chrome);
            lever.position.set(side * (width / 2 - 0.04), 0.018, 0.07);
            lever.rotation.y = side * -0.35;
            lever.castShadow = true;
            this.handlebar.add(lever);
        });
        // Brake master cylinder + reservoir on the right
        const master = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.04), P.darkMetal);
        master.position.set(width / 2 - 0.13, 0.012, 0.02);
        this.handlebar.add(master);
        const reservoir = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.025, 8), P.steel);
        reservoir.position.set(width / 2 - 0.13, 0.045, 0.02);
        this.handlebar.add(reservoir);

        if (crossbar) {
            const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.24, 8), P.chrome);
            bar.rotation.z = Math.PI / 2;
            bar.position.set(0, 0.05, 0);
            bar.castShadow = true;
            this.handlebar.add(bar);
        }
        if (risers) {
            const riserGeometry = new THREE.CylinderGeometry(0.016, 0.016, 0.09, 8);
            [-0.09, 0.09].forEach((rx) => {
                const riser = new THREE.Mesh(riserGeometry, P.steelDark);
                riser.position.set(rx, -0.05, 0);
                riser.castShadow = true;
                this.handlebar.add(riser);
            });
        }
        if (mirrors) {
            const stalkGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6);
            const headGeometry = new THREE.SphereGeometry(0.045, 10, 8);
            [-1, 1].forEach((side) => {
                const stalk = new THREE.Mesh(stalkGeometry, P.darkMetal);
                stalk.position.set(side * (width / 2 - 0.1), 0.07, -0.01);
                stalk.rotation.z = side * -0.8;
                stalk.castShadow = true;
                this.handlebar.add(stalk);
                const head = new THREE.Mesh(headGeometry, P.darkMetal);
                head.scale.set(1.35, 0.8, 0.4);
                head.position.set(side * (width / 2 - 0.04), 0.12, -0.01);
                head.castShadow = true;
                this.handlebar.add(head);
            });
        }
        this.group.add(this.handlebar);

        if (cables) {
            // Brake/clutch lines drooping from the bar ends to the headstock
            const cableMaterial = new THREE.MeshStandardMaterial({
                color: 0x121214, roughness: 0.85, metalness: 0.1
            });
            [-1, 1].forEach((side) => {
                this.addCable([
                    [side * (width / 2 - 0.1), y - 0.01, z + 0.04],
                    [side * 0.12, y - 0.16, z + 0.02],
                    [side * 0.05, y - 0.3, z - 0.04]
                ], 0.006, cableMaterial);
            });
        }
    }

    // ---- Alex: sandy-gold adventure tourer. Wire wheels, long-travel
    // gaitered forks, beak, crash bars with spotlights, alloy luggage. ----
    buildAdventureBike() {
        const P = this.makeBikePalette(0x2b2f38);
        const luggageMaterial = new THREE.MeshStandardMaterial({
            color: 0x33373d, roughness: 0.5, metalness: 0.65, envMapIntensity: 1.0
        });

        // Wire-spoked wheels with dual-sport rubber
        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.13,
            frontTireRadius: 0.3, frontTireWidth: 0.1,
            style: 'wire', wireSpokes: 14, discRadius: 0.22,
            rimColor: 0xc8cacc, caliperColor: 0x2255aa, palette: P
        });

        // Long-travel forks with rubber gaiters (bottom at the axle, top
        // tucked behind the beak rather than towering over the tank)
        this.buildForkPair({
            length: 0.58, x: 0.09, y: 0.58, z: 0.68, rake: 0.12,
            gaiters: true, palette: P
        });

        // ---- Frame + engine + bash plate ----
        this.frame = this.attachPart(new THREE.BoxGeometry(0.12, 0.18, 1.0), P.paint, 0, 0.72, 0.0);
        this.engine = this.attachPart(new THREE.BoxGeometry(0.3, 0.3, 0.42), P.darkMetal, 0, 0.5, 0.08);
        // Boxer-style cylinder heads poking out each side
        const headGeometry = new THREE.CylinderGeometry(0.07, 0.075, 0.1, 10);
        this.attachPart(headGeometry, P.steel, -0.21, 0.48, 0.18, { rz: Math.PI / 2 });
        this.attachPart(headGeometry, P.steel, 0.21, 0.48, 0.18, { rz: Math.PI / 2 });
        const headCapGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8);
        this.attachPart(headCapGeometry, P.darkMetal, -0.27, 0.48, 0.18, { rz: Math.PI / 2 });
        this.attachPart(headCapGeometry, P.darkMetal, 0.27, 0.48, 0.18, { rz: Math.PI / 2 });
        // Bevelled aluminium bash plate
        const bashGeometry = this.makePanel([
            [0.38, 0.22], [0.42, 0.34], [0.3, 0.4], [-0.18, 0.4], [-0.24, 0.3], [-0.1, 0.22]
        ], 0.34, 0.015);
        this.attachPart(bashGeometry, P.steel, 0, 0.0, 0.06);

        // ---- Tall lathe-turned tank with side shrouds ----
        const tankGeometry = this.makeLathe([
            [0.0, 0.0], [0.17, 0.01], [0.21, 0.08], [0.215, 0.2],
            [0.18, 0.3], [0.1, 0.36], [0.0, 0.38]
        ], 16);
        this.fuelTank = this.attachPart(tankGeometry, P.paint, 0, 0.78, 0.2,
            { rx: 0.08, sx: 1.05, sy: 1.0, sz: 1.35 });
        this.attachPart(new THREE.CylinderGeometry(0.032, 0.038, 0.012, 10), P.steel, 0, 1.155, 0.16);
        const shroudGeometry = this.makePanel([
            [0.42, 0.74], [0.5, 0.92], [0.3, 1.06], [0.02, 1.02], [0.0, 0.84], [0.18, 0.72]
        ], 0.05, 0.012);
        this.attachPart(shroudGeometry, P.paint, -0.18, 0, 0, { ry: 0.12 });
        this.attachPart(shroudGeometry, P.paint, 0.18, 0, 0, { ry: -0.12 });
        // Shroud decal stripes
        const shroudDecalGeometry = new THREE.BoxGeometry(0.012, 0.05, 0.26);
        this.attachPart(shroudDecalGeometry, P.paintDark, -0.215, 0.92, 0.26, { rx: -0.3 });
        this.attachPart(shroudDecalGeometry, P.paintDark, 0.215, 0.92, 0.26, { rx: -0.3 });

        // ---- Beak fender + low fender ----
        const beakGeometry = this.makePanel([
            [0.5, 0.72], [0.78, 0.62, 0.97, 0.6], [0.92, 0.55], [0.62, 0.6], [0.46, 0.64]
        ], 0.16, 0.014);
        this.attachPart(beakGeometry, P.paint, 0, 0.08, 0);
        const lowFenderGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.13, 12, 1, true, 0.7, 1.6);
        lowFenderGeometry.rotateZ(Math.PI / 2);
        this.attachPart(lowFenderGeometry, P.paintDark, 0, 0.3, 0.7);

        // ---- Headlight cluster + tall touring screen ----
        this.headlight = this.attachPart(new THREE.SphereGeometry(0.06, 12, 8), P.headlight,
            -0.06, 0.95, 0.58, { sx: 1.1, sy: 0.9, sz: 0.6 });
        this.attachPart(new THREE.SphereGeometry(0.06, 12, 8), P.headlight,
            0.06, 0.95, 0.58, { sx: 1.1, sy: 0.9, sz: 0.6 });
        this.attachPart(new THREE.BoxGeometry(0.3, 0.16, 0.06), P.paintDark, 0, 0.95, 0.55);
        // Curved windscreen (cylindrical segment) with trim
        const screenGeometry = new THREE.CylinderGeometry(0.36, 0.4, 0.44, 10, 1, true, -0.55, 1.1);
        this.attachPart(screenGeometry, P.glass, 0, 1.3, 0.2, { rx: -0.22 });
        this.attachPart(new THREE.BoxGeometry(0.3, 0.02, 0.03), P.darkMetal, 0, 1.1, 0.55);
        // TFT dash
        this.attachPart(new THREE.BoxGeometry(0.18, 0.1, 0.02), P.dash, 0, 1.12, 0.44, { rx: -0.4 });

        // ---- Crash bars with spotlights ----
        const barGeometry = new THREE.TorusGeometry(0.17, 0.013, 5, 10, Math.PI * 1.2);
        [-1, 1].forEach((side) => {
            const bar = this.attachPart(barGeometry, P.steel, side * 0.2, 0.56, 0.3,
                { ry: Math.PI / 2, rz: -0.5 });
            this.attachPart(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), P.steel,
                side * 0.2, 0.62, 0.22, { rx: 0.5 });
            // Spotlight pod: body + emissive lens
            this.attachPart(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 10), P.darkMetal,
                side * 0.21, 0.68, 0.5, { rx: Math.PI / 2 });
            const lens = this.attachPart(new THREE.CircleGeometry(0.03, 10), P.headlight,
                side * 0.21, 0.68, 0.527);
        });

        // ---- Wide bars with risers, hand guards and mirrors ----
        this.buildHandlebar({ y: 1.18, z: 0.5, width: 0.56, risers: true, mirrors: true, cables: true, palette: P });
        const guardGeometry = new THREE.TorusGeometry(0.085, 0.013, 5, 8, Math.PI);
        [-1, 1].forEach((side) => {
            const guard = new THREE.Mesh(guardGeometry, P.paint);
            guard.position.set(side * 0.24, 0.01, 0.05);
            guard.rotation.y = side * Math.PI / 2 + side * 0.3;
            guard.castShadow = true;
            this.handlebar.add(guard);
        });

        // ---- Stepped two-tone touring seat ----
        const seatGeometry = new THREE.CapsuleGeometry(0.11, 0.34, 4, 12);
        seatGeometry.rotateX(Math.PI / 2);
        this.attachPart(seatGeometry, P.leather, 0, 0.95, -0.18, { sx: 1.3, sy: 0.55 });
        const pillionMaterial = new THREE.MeshStandardMaterial({
            color: 0x3c3f46, roughness: 0.85, metalness: 0.0
        });
        this.attachPart(new THREE.CapsuleGeometry(0.1, 0.16, 3, 10), pillionMaterial,
            0, 1.0, -0.48, { rx: Math.PI / 2, sx: 1.35, sy: 0.55 });

        // ---- Luggage: bevelled panniers + top box with reflectors ----
        const pannierGeometry = this.makePanel([
            [-0.24, 0.58], [-0.62, 0.58], [-0.66, 0.66], [-0.66, 0.84], [-0.6, 0.9], [-0.26, 0.9], [-0.2, 0.82], [-0.2, 0.66]
        ], 0.13, 0.016);
        const reflectorMaterial = new THREE.MeshStandardMaterial({
            color: 0xa01010, emissive: 0x550000, emissiveIntensity: 0.5, roughness: 0.3
        });
        [-1, 1].forEach((side) => {
            const pannier = this.attachPart(pannierGeometry, luggageMaterial, side * 0.225, 0, 0);
            // Lid seam + latch + reflector
            this.attachPart(new THREE.BoxGeometry(0.135, 0.01, 0.4), P.darkMetal, side * 0.225, 0.8, -0.43);
            this.attachPart(new THREE.BoxGeometry(0.02, 0.05, 0.04), P.steel, side * 0.295, 0.74, -0.43);
            this.attachPart(new THREE.BoxGeometry(0.012, 0.025, 0.06), reflectorMaterial, side * 0.292, 0.64, -0.6);
        });
        // Top box + paint lid + grab rails + rack plate
        this.attachPart(new THREE.BoxGeometry(0.36, 0.26, 0.32), luggageMaterial, 0, 1.14, -0.6);
        this.attachPart(new THREE.BoxGeometry(0.38, 0.05, 0.34), P.paint, 0, 1.295, -0.6);
        this.attachPart(new THREE.BoxGeometry(0.1, 0.02, 0.02), P.steel, 0, 1.27, -0.43);
        this.attachPart(new THREE.BoxGeometry(0.3, 0.025, 0.36), P.steelDark, 0, 0.995, -0.6);
        const railGeometry = new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6);
        this.attachPart(railGeometry, P.steel, -0.18, 1.0, -0.5, { rx: Math.PI / 2 });
        this.attachPart(railGeometry, P.steel, 0.18, 1.0, -0.5, { rx: Math.PI / 2 });

        // ---- Swingarm + shaft drive + upswept exhaust ----
        const swingarmGeometry = new THREE.BoxGeometry(0.05, 0.07, 0.55);
        this.attachPart(swingarmGeometry, P.steelDark, 0.1, 0.32, -0.4);
        // Shaft drive housing on the left (no chain on this tourer)
        this.addLimb(this.group, P.steel, 0.042, -0.1, 0.42, -0.12, -0.1, 0.31, -0.66);
        const shockGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.26, 8);
        this.attachPart(shockGeometry, P.caliperRed, 0.02, 0.5, -0.32, { rx: 0.4 });

        // Header pipes from each cylinder sweeping back to a high can
        this.addCable([[0.22, 0.42, 0.24], [0.2, 0.3, 0.1], [0.16, 0.32, -0.2], [0.15, 0.5, -0.38]], 0.02, P.steel);
        this.addCable([[-0.22, 0.42, 0.24], [-0.18, 0.26, 0.05], [0.0, 0.28, -0.15], [0.13, 0.45, -0.36]], 0.018, P.steel);
        const canGeometry = this.makeLathe([
            [0.0, 0.0], [0.05, 0.0], [0.065, 0.06], [0.065, 0.34], [0.045, 0.42], [0.0, 0.43]
        ], 12);
        canGeometry.rotateX(-Math.PI / 2);
        const advCan = this.attachPart(canGeometry, P.steel, 0.17, 0.6, -0.3, { rx: 0.3 });
        const shieldGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.2, 8, 1, true, -0.6, 1.4);
        shieldGeometry.rotateX(Math.PI / 2);
        const shield = new THREE.Mesh(shieldGeometry, P.chrome);
        shield.position.set(0.005, 0, -0.2);
        shield.castShadow = true;
        advCan.add(shield);

        // Footpegs, side stand, licence plate
        const pegGeometry = new THREE.BoxGeometry(0.09, 0.02, 0.05);
        this.attachPart(pegGeometry, P.steel, -0.2, 0.45, -0.1);
        this.attachPart(pegGeometry, P.steel, 0.2, 0.45, -0.1);
        this.attachPart(new THREE.CylinderGeometry(0.011, 0.011, 0.32, 8), P.steelDark,
            -0.15, 0.2, 0.0, { rz: 0.5, rx: 0.2 });
        this.attachPart(new THREE.BoxGeometry(0.16, 0.1, 0.008), P.plate, 0, 0.62, -0.88, { rx: 0.3 });

        // Brake light on the top box (contract position preserved)
        this.buildBrakeLight(0, 1.12, -0.79);

        // Upright touring rider in ADV gear
        this.buildVariantRider({
            ...Vehicle.BIKES.adventure.seat,
            suitColor: 0x2f3640, suitAccent: P.paintHex, helmetColor: 0xe8e6dd, helmetAccent: 0x2f3640
        });
    }

    // ---- Tim: silver maxi-scooter. Smooth lathe bodywork, covered wheels,
    // floorboard with rubber strips, plush two-tone seat, chrome trim. ----
    buildScooter() {
        const P = this.makeBikePalette(0x30343c);
        const trimMaterial = new THREE.MeshStandardMaterial({
            color: 0x1c1e22, roughness: 0.7, metalness: 0.3
        });

        // Covered solid wheels, fat tires, small discs
        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.17,
            frontTireRadius: 0.28, frontTireWidth: 0.15,
            style: 'solid', discRadius: 0.14, frontDiscRadius: 0.16,
            rimColor: 0xcfd2d6, caliperColor: 0x3a3e46, palette: P
        });

        // Stubby forks mostly hidden behind the bodywork
        this.buildForkPair({ length: 0.4, x: 0.08, y: 0.5, z: 0.68, radius: 0.022, palette: P });

        // ---- Main body: smooth under-seat hump (colour-feedback frame) ----
        const bodyGeometry = new THREE.CapsuleGeometry(0.21, 0.5, 6, 14);
        bodyGeometry.rotateX(Math.PI / 2);
        this.frame = this.attachPart(bodyGeometry, P.paint, 0, 0.64, -0.32, { sx: 0.95, sy: 0.78 });
        // Side skirt panels in the darker two-tone shade
        const skirtGeometry = this.makePanel([
            [0.32, 0.36], [0.34, 0.52], [0.1, 0.6], [-0.5, 0.66], [-0.72, 0.56], [-0.6, 0.4], [-0.1, 0.34]
        ], 0.04, 0.012);
        this.attachPart(skirtGeometry, P.paintDark, -0.17, 0, 0, { ry: 0.05 });
        this.attachPart(skirtGeometry, P.paintDark, 0.17, 0, 0, { ry: -0.05 });
        // Chrome pinstripe along the flanks
        const stripGeometry = new THREE.BoxGeometry(0.008, 0.014, 0.6);
        this.attachPart(stripGeometry, P.chrome, -0.195, 0.6, -0.25);
        this.attachPart(stripGeometry, P.chrome, 0.195, 0.6, -0.25);

        // ---- Front apron: lathe-turned smooth shield (contract fuelTank) ----
        const apronGeometry = this.makeLathe([
            [0.0, 0.0], [0.22, 0.02], [0.3, 0.18], [0.32, 0.38],
            [0.28, 0.52], [0.18, 0.62], [0.0, 0.66]
        ], 18);
        this.fuelTank = this.attachPart(apronGeometry, P.paint, 0, 0.42, 0.55, { sx: 0.62, sy: 1.0, sz: 0.55 });
        // Inner leg shield + glovebox seams
        this.attachPart(new THREE.BoxGeometry(0.3, 0.4, 0.04), trimMaterial, 0, 0.74, 0.42, { rx: -0.12 });
        this.attachPart(new THREE.BoxGeometry(0.22, 0.008, 0.02), P.darkMetal, 0, 0.82, 0.44, { rx: -0.12 });
        this.attachPart(new THREE.BoxGeometry(0.025, 0.04, 0.02), P.chrome, 0.09, 0.76, 0.45, { rx: -0.12 });

        // ---- Floorboard with rubber strips + underbody ----
        this.attachPart(new THREE.BoxGeometry(0.38, 0.06, 0.55), trimMaterial, 0, 0.38, 0.12);
        const stripRubberGeometry = new THREE.BoxGeometry(0.05, 0.012, 0.5);
        [-0.13, -0.045, 0.045, 0.13].forEach((sx) => {
            this.attachPart(stripRubberGeometry, P.rubber, sx, 0.412, 0.12);
        });
        this.attachPart(new THREE.BoxGeometry(0.34, 0.16, 0.7), trimMaterial, 0, 0.3, 0.0);

        // Front fender hugging the wheel
        const fenderGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.18, 12, 1, true, 0.6, 1.8);
        fenderGeometry.rotateZ(Math.PI / 2);
        this.attachPart(fenderGeometry, P.paint, 0, 0.3, 0.7);

        // ---- Tall curved commuter screen with chrome trim ----
        const screenGeometry = new THREE.CylinderGeometry(0.42, 0.46, 0.55, 12, 1, true, -0.55, 1.1);
        this.attachPart(screenGeometry, P.glass, 0, 1.28, 0.18, { rx: -0.18 });
        this.attachPart(new THREE.CylinderGeometry(0.43, 0.43, 0.025, 10, 1, true, -0.5, 1.0), P.chrome,
            0, 1.54, 0.16, { rx: -0.18 });

        // ---- Headlight + indicators set into the apron ----
        this.headlight = this.attachPart(new THREE.SphereGeometry(0.06, 12, 8), P.headlight,
            0, 0.85, 0.72, { sx: 2.0, sy: 0.7, sz: 0.6 });
        this.attachPart(new THREE.BoxGeometry(0.34, 0.025, 0.02), P.chrome, 0, 0.78, 0.72);
        const signalMaterial = new THREE.MeshStandardMaterial({
            color: 0xd88a1a, emissive: 0x9a5500, emissiveIntensity: 0.4, roughness: 0.2
        });
        this.attachPart(new THREE.SphereGeometry(0.022, 8, 6), signalMaterial, -0.15, 0.92, 0.66);
        this.attachPart(new THREE.SphereGeometry(0.022, 8, 6), signalMaterial, 0.15, 0.92, 0.66);

        // ---- Covered bars, console with dials, long chrome mirror stalks ----
        this.buildHandlebar({ y: 1.12, z: 0.55, width: 0.5, cables: false, palette: P });
        this.attachPart(new THREE.BoxGeometry(0.26, 0.1, 0.16), trimMaterial, 0, 1.04, 0.56);
        this.attachPart(new THREE.CircleGeometry(0.032, 12), P.dash, -0.05, 1.1, 0.51, { rx: -0.9 });
        this.attachPart(new THREE.CircleGeometry(0.032, 12), P.dash, 0.05, 1.1, 0.51, { rx: -0.9 });
        const stalkGeometry = new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6);
        const mirrorGeometry = new THREE.SphereGeometry(0.05, 10, 8);
        [-1, 1].forEach((side) => {
            this.attachPart(stalkGeometry, P.chrome, side * 0.18, 1.2, 0.56, { rz: side * -0.7 });
            this.attachPart(mirrorGeometry, P.chrome, side * 0.25, 1.28, 0.57, { sx: 1.3, sy: 0.85, sz: 0.4 });
        });

        // ---- Plush two-tone stepped seat with piping + backrest ----
        const seatGeometry = new THREE.CapsuleGeometry(0.16, 0.34, 5, 12);
        seatGeometry.rotateX(Math.PI / 2);
        this.attachPart(seatGeometry, P.leather, 0, 0.84, -0.22, { sx: 1.2, sy: 0.55 });
        const pillionMaterial = new THREE.MeshStandardMaterial({
            color: 0x474b54, roughness: 0.85, metalness: 0.0
        });
        this.attachPart(new THREE.CapsuleGeometry(0.15, 0.2, 4, 12), pillionMaterial,
            0, 0.93, -0.52, { rx: Math.PI / 2, sx: 1.2, sy: 0.6 });
        this.attachPart(new THREE.BoxGeometry(0.3, 0.012, 0.04), P.plastic, 0, 0.9, -0.38);
        this.attachPart(new THREE.BoxGeometry(0.32, 0.14, 0.07), pillionMaterial, 0, 1.02, -0.66, { rx: -0.15 });
        // Chrome pillion grab rail wrapping the tail
        const railGeometry = new THREE.TorusGeometry(0.19, 0.013, 5, 12, Math.PI);
        this.attachPart(railGeometry, P.chrome, 0, 0.92, -0.6, { rx: Math.PI / 2, rz: Math.PI });
        // Fold-out pillion pegs
        this.attachPart(new THREE.BoxGeometry(0.06, 0.015, 0.03), P.steel, -0.21, 0.55, -0.35);
        this.attachPart(new THREE.BoxGeometry(0.06, 0.015, 0.03), P.steel, 0.21, 0.55, -0.35);

        // ---- Tail bodywork + licence plate ----
        this.attachPart(new THREE.SphereGeometry(0.2, 14, 10), P.paint, 0, 0.66, -0.72, { sx: 0.95, sy: 0.6, sz: 0.7 });
        this.attachPart(new THREE.BoxGeometry(0.14, 0.1, 0.008), P.plate, 0, 0.6, -0.86, { rx: 0.2 });

        // ---- CVT transmission case (acts as the swingarm) + exhaust ----
        this.addLimb(this.group, P.steel, 0.06, 0.15, 0.38, -0.15, 0.13, 0.31, -0.66);
        this.attachPart(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), P.steelDark,
            0.19, 0.36, -0.3, { rz: Math.PI / 2 });
        // Chrome muffler with heat shield
        const muffGeometry = this.makeLathe([
            [0.0, 0.0], [0.05, 0.0], [0.06, 0.05], [0.06, 0.3], [0.04, 0.36], [0.0, 0.37]
        ], 12);
        muffGeometry.rotateX(-Math.PI / 2);
        const muffler = this.attachPart(muffGeometry, P.chrome, 0.16, 0.34, -0.42, { rx: 0.12 });
        const shieldGeometry = new THREE.BoxGeometry(0.02, 0.06, 0.3);
        const muffShield = new THREE.Mesh(shieldGeometry, P.steel);
        muffShield.position.set(0.05, 0.02, -0.18);
        muffShield.castShadow = true;
        muffler.add(muffShield);

        // Centre + side stands tucked under the floor
        this.attachPart(new THREE.CylinderGeometry(0.01, 0.01, 0.24, 6), P.steelDark,
            -0.14, 0.16, -0.05, { rz: 0.45, rx: 0.15 });
        this.attachPart(new THREE.BoxGeometry(0.04, 0.012, 0.05), P.steelDark, -0.2, 0.04, -0.02);

        // Brake light across the tail (contract position preserved)
        this.buildBrakeLight(0, 0.76, -0.84);

        // Relaxed commuter: upright, feet forward on the floorboard
        this.buildVariantRider({
            ...Vehicle.BIKES.scooter.seat,
            suitColor: 0x3a3f4a, suitAccent: 0xd6d8dc, helmetColor: 0xe8e8ea, helmetAccent: 0x9aa0a8
        });
    }

    // ---- Lucy: black naked middleweight. Lime-green trellis frame, angular
    // tank shrouds with green stripes, a sharp LED cowl, a short tail, copper
    // headers into an underslung silencer, black wheels with green rim
    // stripes. The modelled bike (tools/blender/bike_naked.py) stands its
    // parts, grips and pegs where this one does. ----
    buildNakedBike() {
        const P = this.makeBikePalette(0x9ccc1a);
        const copper = new THREE.MeshStandardMaterial({ color: 0xa8643a, roughness: 0.32, metalness: 0.9 });

        this.buildWheelSet({
            rearTireRadius: 0.3, rearTireWidth: 0.15,
            frontTireRadius: 0.28, frontTireWidth: 0.11,
            rimRadius: 0.2, style: 'alloy', spokePairs: 5,
            discRadius: 0.22, rimColor: 0x1a1b1f, caliperColor: 0x2a2c31, palette: P
        });
        // Green stripes round both rims
        const stripeGeometry = new THREE.TorusGeometry(0.2, 0.006, 4, 28);
        stripeGeometry.rotateY(Math.PI / 2);
        [this.rearWheel, this.frontWheel].forEach((wheel) => {
            [-0.055, 0.055].forEach((x) => this.attachPart(stripeGeometry, P.accent, x, 0, 0, { parent: wheel }));
        });

        // Conventional forks, raked back toward the bar
        this.buildForkPair({
            length: 0.7, x: 0.1, y: 0.635, z: 0.59, radius: 0.021, rake: -0.32,
            sliderColor: 0x1a1b1f, palette: P
        });
        this.attachPart(new THREE.CylinderGeometry(0.042, 0.042, 0.2, 10), P.darkMetal, 0, 0.88, 0.49, { rx: -0.31 });

        // ---- Trellis frame in the accent green, from the headstock round
        // the engine to the swingarm pivot; the painted spine under the tank
        // carries the crash tint ----
        this.frame = this.attachPart(new THREE.BoxGeometry(0.08, 0.08, 0.5), P.paint, 0, 0.8, 0.2);
        const joints = { head: [0.06, 0.86, 0.46], top: [0.13, 0.8, 0.16], rear: [0.14, 0.72, -0.08], low: [0.13, 0.56, 0.32], mid: [0.14, 0.56, 0.04], pivot: [0.14, 0.44, -0.12] };
        const rails = [['head', 'top'], ['top', 'rear'], ['head', 'low'], ['low', 'top'], ['top', 'mid'], ['mid', 'rear'], ['low', 'mid'], ['mid', 'pivot'], ['rear', 'pivot']];
        [-1, 1].forEach((side) => {
            const at = (name) => [side * joints[name][0], joints[name][1], joints[name][2]];
            rails.forEach(([a, b]) => this.addCable([at(a), at(b)], 0.012, P.accent));
            this.attachPart(new THREE.BoxGeometry(0.02, 0.2, 0.16), P.darkMetal, side * 0.15, 0.45, -0.1);
            this.addCable([at('rear'), [side * 0.09, 0.88, -0.6]], 0.011, P.darkMetal);
        });

        // ---- Parallel twin: crankcase, barrels leaning forward, covers ----
        this.engine = this.attachPart(new THREE.BoxGeometry(0.26, 0.24, 0.36), P.darkMetal, 0, 0.36, 0.05);
        this.attachPart(new THREE.BoxGeometry(0.23, 0.2, 0.17), P.darkMetal, 0, 0.55, 0.2, { rx: -0.45 });
        this.attachPart(new THREE.BoxGeometry(0.24, 0.08, 0.16), P.steelDark, 0, 0.67, 0.27, { rx: -0.45 });
        const coverGeometry = new THREE.CylinderGeometry(0.085, 0.085, 0.03, 14);
        this.attachPart(coverGeometry, P.steelDark, 0.14, 0.37, 0.02, { rz: Math.PI / 2 });
        this.attachPart(coverGeometry, P.steelDark, -0.14, 0.37, 0.02, { rz: Math.PI / 2 });
        this.radiator = this.attachPart(new THREE.BoxGeometry(0.3, 0.24, 0.045), P.darkMetal, 0, 0.6, 0.43, { rx: -0.3 });

        // ---- Exhaust: copper headers down the front of the engine into a
        // black silencer under it, behind green-striped belly covers ----
        [-1, 1].forEach((side) => {
            this.addCable([[side * 0.05, 0.63, 0.36], [side * 0.06, 0.52, 0.42], [side * 0.06, 0.36, 0.38], [side * 0.04, 0.22, 0.26], [side * 0.02, 0.17, 0.1]], 0.02, copper);
        });
        this.attachPart(new THREE.BoxGeometry(0.2, 0.12, 0.38), P.darkMetal, 0, 0.19, -0.07);
        const bellyGeometry = this.makePanel([[0.14, 0.27], [0.08, 0.16], [-0.22, 0.17], [-0.26, 0.24], [-0.02, 0.29]], 0.012, 0.004);
        const bellyStripeGeometry = new THREE.BoxGeometry(0.006, 0.02, 0.28);
        [-1, 1].forEach((side) => {
            this.attachPart(bellyGeometry, P.paint, side * 0.12, 0, 0);
            this.attachPart(bellyStripeGeometry, P.accent, side * 0.13, 0.222, -0.04);
        });

        // ---- Tank and shrouds ----
        const tankGeometry = this.makeLathe([
            [0.0, 0.0], [0.15, 0.005], [0.2, 0.05], [0.21, 0.13],
            [0.19, 0.2], [0.14, 0.26], [0.06, 0.3], [0.0, 0.31]
        ], 18);
        this.fuelTank = this.attachPart(tankGeometry, P.paint, 0, 0.74, 0.18, { rx: 0.04, sx: 0.95, sz: 1.5 });
        const shroudGeometry = this.makePanel([[0.44, 0.96], [0.58, 0.82], [0.6, 0.7], [0.5, 0.6], [0.38, 0.62], [0.33, 0.78]], 0.026, 0.008);
        const shroudStripeGeometry = new THREE.BoxGeometry(0.006, 0.022, 0.24);
        [-1, 1].forEach((side) => {
            this.attachPart(shroudGeometry, P.paint, side * 0.17, 0, 0, { ry: -side * 0.12 });
            this.attachPart(shroudStripeGeometry, P.accent, side * 0.186, 0.728, 0.48, { rx: -0.4, ry: -side * 0.12 });
            this.attachPart(shroudStripeGeometry, P.accent, side * 0.18, 0.84, 0.43, { rx: -0.5, ry: -side * 0.12 });
        });

        // ---- Seat, short upswept tail, tail tidy ----
        const seatGeometry = new THREE.CapsuleGeometry(0.09, 0.3, 4, 12);
        seatGeometry.rotateX(Math.PI / 2);
        this.seat = this.attachPart(seatGeometry, P.leather, 0, 0.82, -0.22, { sx: 1.55, sy: 0.45 });
        this.attachPart(new THREE.BoxGeometry(0.17, 0.05, 0.22), P.leather, 0, 0.91, -0.54, { rx: 0.1 });
        const tailGeometry = new THREE.ConeGeometry(0.14, 0.55, 12);
        tailGeometry.rotateX(-Math.PI / 2);
        this.tailSection = this.attachPart(tailGeometry, P.paint, 0, 0.85, -0.56, { rx: 0.22, sy: 0.6 });
        this.attachPart(new THREE.BoxGeometry(0.26, 0.14, 0.36), P.paint, 0, 0.74, -0.2, { rx: 0.18 });
        const tailStripeGeometry = new THREE.BoxGeometry(0.006, 0.02, 0.3);
        this.attachPart(tailStripeGeometry, P.accent, -0.115, 0.85, -0.52, { rx: 0.2 });
        this.attachPart(tailStripeGeometry, P.accent, 0.115, 0.85, -0.52, { rx: 0.2 });
        this.attachPart(new THREE.BoxGeometry(0.05, 0.025, 0.32), P.darkMetal, 0, 0.75, -0.81, { rx: 0.85 });
        this.attachPart(new THREE.BoxGeometry(0.16, 0.1, 0.008), P.plate, 0, 0.6, -0.93, { rx: 0.25 });
        this.buildBrakeLight(0, 0.925, -0.8, 0.35);

        // ---- Swingarm, chain, laid-down shock ----
        const swingarmGeometry = new THREE.BoxGeometry(0.035, 0.075, 0.6);
        this.attachPart(swingarmGeometry, P.darkMetal, -0.1, 0.36, -0.42, { rx: 0.2 });
        this.attachPart(swingarmGeometry, P.darkMetal, 0.1, 0.36, -0.42, { rx: 0.2 });
        this.attachPart(new THREE.BoxGeometry(0.014, 0.02, 0.6), P.darkMetal, -0.1, 0.44, -0.36, { rx: 0.06 });
        this.attachPart(new THREE.BoxGeometry(0.014, 0.02, 0.6), P.darkMetal, -0.1, 0.3, -0.36, { rx: 0.27 });
        this.attachPart(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), P.steelDark, 0, 0.54, -0.23, { rx: 0.99 });

        // ---- Front: LED cowl, fly screen, dash, mudguards ----
        this.attachPart(new THREE.BoxGeometry(0.24, 0.17, 0.18), P.paint, 0, 0.89, 0.66, { rx: -0.25 });
        this.headlight = this.attachPart(new THREE.BoxGeometry(0.15, 0.05, 0.02), P.headlight, 0, 0.85, 0.72, { rx: -0.3 });
        this.windscreen = this.attachPart(new THREE.BoxGeometry(0.2, 0.11, 0.005), P.glass, 0, 1.0, 0.66, { rx: -0.6 });
        this.attachPart(new THREE.BoxGeometry(0.1, 0.06, 0.008), P.dash, 0, 1.037, 0.575, { rx: -0.6 });
        const fenderGeometry = new THREE.CylinderGeometry(0.31, 0.31, 0.12, 12, 1, true, 0.5, 1.8);
        fenderGeometry.rotateZ(Math.PI / 2);
        this.frontFender = this.attachPart(fenderGeometry, P.paint, 0, 0.3, 0.7);
        const huggerGeometry = new THREE.CylinderGeometry(0.33, 0.33, 0.13, 10, 1, true, 2.7, 1.2);
        huggerGeometry.rotateZ(Math.PI / 2);
        this.attachPart(huggerGeometry, P.darkMetal, 0, 0.3, -0.7);

        // ---- Wide flat bar, pegs, side stand ----
        this.buildHandlebar({ y: 1.04, z: 0.46, width: 0.66, mirrors: true, cables: true, palette: P });
        const footpegGeometry = new THREE.BoxGeometry(0.08, 0.02, 0.04);
        this.attachPart(footpegGeometry, P.steel, -0.2, 0.42, -0.12);
        this.attachPart(footpegGeometry, P.steel, 0.2, 0.42, -0.12);
        const hangerGeometry = new THREE.BoxGeometry(0.015, 0.12, 0.05);
        this.attachPart(hangerGeometry, P.steelDark, -0.15, 0.48, -0.11, { rz: 0.3 });
        this.attachPart(hangerGeometry, P.steelDark, 0.15, 0.48, -0.11, { rz: -0.3 });
        this.attachPart(new THREE.CylinderGeometry(0.011, 0.011, 0.3, 8), P.steelDark, -0.2, 0.17, 0.02, { rz: 0.55, rx: 0.25 });

        // ---- Rider: upright on a naked bike, hands wide on the bar. The
        // colours are a plain default; a character's kit dresses them. ----
        this.buildVariantRider({
            ...Vehicle.BIKES.naked.seat,
            suitColor: 0x16161c, suitAccent: P.accentHex, helmetColor: 0xf0f0f2, helmetAccent: 0x16161c
        });
    }

    // ---- Shane: orange motocross bike. Wire wheels with knobbies, tall
    // gaiterless USD forks with guards, shrouds, high fenders, MX plates. ----
    buildDirtBike() {
        const P = this.makeBikePalette(0xffffff);
        const plasticMaterial = new THREE.MeshStandardMaterial({
            color: 0xeceff1, roughness: 0.5, metalness: 0.08
        });

        // Thin wire-spoked wheels wrapped in knobby rubber
        this.buildWheelSet({
            rearTireRadius: 0.28, rearTireWidth: 0.11,
            frontTireRadius: 0.3, frontTireWidth: 0.08,
            style: 'wire', wireSpokes: 14, knobby: true, knobCount: 18,
            discRadius: 0.18, frontDiscRadius: 0.2,
            rimColor: 0x23252b, caliperColor: 0x9aa0a6, palette: P
        });

        // Long-travel USD motocross forks with plastic guards
        this.buildForkPair({
            length: 0.78, x: 0.08, y: 0.62, z: 0.66, radius: 0.027, rake: 0.16,
            usd: true, sliderColor: 0xb8923e, guards: true, guardMaterial: plasticMaterial,
            palette: P
        });
        this.attachPart(new THREE.BoxGeometry(0.22, 0.05, 0.1), P.steelDark, 0, 0.95, 0.6);
        this.attachPart(new THREE.BoxGeometry(0.2, 0.04, 0.09), P.steelDark, 0, 0.84, 0.62);

        // ---- Frame: spine + cradle downtubes + subframe ----
        this.frame = this.attachPart(new THREE.BoxGeometry(0.08, 0.16, 0.95), P.paint, 0, 0.7, 0.0);
        const tubeGeometry = new THREE.CylinderGeometry(0.014, 0.014, 0.42, 7);
        this.attachPart(tubeGeometry, P.steel, -0.06, 0.5, 0.3, { rx: 0.5 });
        this.attachPart(tubeGeometry, P.steel, 0.06, 0.5, 0.3, { rx: 0.5 });
        this.attachPart(tubeGeometry, P.steel, -0.06, 0.74, -0.38, { rx: -1.0 });
        this.attachPart(tubeGeometry, P.steel, 0.06, 0.74, -0.38, { rx: -1.0 });

        // ---- Compact single + brushed cases + carb ----
        this.engine = this.attachPart(new THREE.BoxGeometry(0.22, 0.26, 0.32), P.darkMetal, 0, 0.44, 0.05);
        this.attachPart(new THREE.BoxGeometry(0.16, 0.16, 0.16), P.steel, 0, 0.62, 0.16, { rx: -0.15 });
        this.attachPart(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 12), P.steel, 0.125, 0.42, -0.02, { rz: Math.PI / 2 });
        this.attachPart(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10), P.steelDark, -0.12, 0.44, 0.05, { rz: Math.PI / 2 });
        this.attachPart(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 8), P.steelDark, 0, 0.52, -0.14, { rx: 0.4 });
        // Skid plate
        this.attachPart(new THREE.BoxGeometry(0.24, 0.025, 0.4), P.steel, 0, 0.29, 0.05);

        // ---- Small tank + radiator shrouds + radiators with fins ----
        const tankGeometry = this.makeLathe([
            [0.0, 0.0], [0.13, 0.01], [0.15, 0.08], [0.12, 0.16], [0.05, 0.2], [0.0, 0.21]
        ], 14);
        this.fuelTank = this.attachPart(tankGeometry, P.paint, 0, 0.84, 0.22, { rx: 0.1, sx: 1.0, sy: 1.0, sz: 1.35 });
        this.attachPart(new THREE.CylinderGeometry(0.03, 0.034, 0.014, 8), P.darkMetal, 0, 1.055, 0.18);
        const shroudGeometry = this.makePanel([
            [0.38, 0.7], [0.46, 0.9], [0.26, 1.0], [0.04, 0.94], [0.08, 0.74], [0.24, 0.66]
        ], 0.045, 0.012);
        this.attachPart(shroudGeometry, P.paint, -0.155, 0, 0, { ry: 0.22 });
        this.attachPart(shroudGeometry, P.paint, 0.155, 0, 0, { ry: -0.22 });
        // Shroud decals
        const decalGeometry = new THREE.BoxGeometry(0.012, 0.045, 0.2);
        this.attachPart(decalGeometry, plasticMaterial, -0.19, 0.86, 0.32, { ry: 0.22, rx: -0.25 });
        this.attachPart(decalGeometry, plasticMaterial, 0.19, 0.86, 0.32, { ry: -0.22, rx: -0.25 });
        // Radiator cores tucked behind the shrouds
        const radGeometry = new THREE.BoxGeometry(0.04, 0.16, 0.1);
        const leftRad = this.attachPart(radGeometry, P.darkMetal, -0.12, 0.74, 0.3, { ry: 0.25 });
        const rightRad = this.attachPart(radGeometry, P.darkMetal, 0.12, 0.74, 0.3, { ry: -0.25 });
        const radFinGeometry = new THREE.BoxGeometry(0.044, 0.008, 0.09);
        [leftRad, rightRad].forEach((rad) => {
            for (let i = 0; i < 3; i++) {
                const fin = new THREE.Mesh(radFinGeometry, P.steelDark);
                fin.position.set(0, -0.05 + i * 0.05, 0.008);
                rad.add(fin);
            }
        });
        this.addCable([[-0.1, 0.66, 0.3], [-0.08, 0.6, 0.22], [-0.04, 0.58, 0.14]], 0.011, P.rubber);

        // ---- High fenders, front number plate, side plates ----
        const frontFenderGeometry = this.makePanel([
            [0.42, 0.86], [0.8, 0.96, 1.05, 1.12], [0.95, 1.06], [0.62, 0.92, 0.42, 0.9]
        ], 0.15, 0.012);
        this.attachPart(frontFenderGeometry, P.paint, 0, 0, 0);
        const rearFenderGeometry = this.makePanel([
            [-0.3, 0.88], [-0.7, 0.98, -0.92, 1.12], [-0.88, 1.04], [-0.55, 0.92, -0.3, 0.84]
        ], 0.16, 0.012);
        this.attachPart(rearFenderGeometry, P.paint, 0, 0, 0);
        // Front number plate with race number bars
        const plateGeometry = this.makePanel([
            [-0.1, -0.1], [0.08, -0.1], [0.1, 0.02], [0.06, 0.12], [-0.08, 0.12]
        ], 0.02, 0.01);
        this.attachPart(plateGeometry, plasticMaterial, 0, 1.0, 0.55, { ry: Math.PI / 2, rx: -0.2 });
        this.attachPart(new THREE.BoxGeometry(0.012, 0.08, 0.025), P.darkMetal, 0, 1.01, 0.575, { rx: -0.2 });
        // Side number plates under the seat
        const sidePlateGeometry = this.makePanel([
            [-0.28, 0.62], [-0.62, 0.62], [-0.68, 0.78], [-0.5, 0.9], [-0.26, 0.82]
        ], 0.03, 0.01);
        this.attachPart(sidePlateGeometry, plasticMaterial, -0.13, 0, 0, { ry: 0.1 });
        this.attachPart(sidePlateGeometry, plasticMaterial, 0.13, 0, 0, { ry: -0.1 });
        const numeralGeometry = new THREE.BoxGeometry(0.012, 0.1, 0.03);
        this.attachPart(numeralGeometry, P.darkMetal, -0.152, 0.74, -0.45);
        this.attachPart(numeralGeometry, P.darkMetal, 0.152, 0.74, -0.45);

        // ---- Gripper seat with ribs running tank to tail ----
        this.attachPart(new THREE.BoxGeometry(0.18, 0.06, 0.62), P.leather, 0, 0.92, -0.16, { rx: -0.04 });
        const ribGeometry = new THREE.BoxGeometry(0.16, 0.008, 0.02);
        for (let i = 0; i < 5; i++) {
            this.attachPart(ribGeometry, P.rubber, 0, 0.952 + i * 0.0035, -0.36 + i * 0.09, { rx: -0.04 });
        }

        // ---- Swingarm, chain, big rear sprocket, brake pedal, pegs ----
        const swingarmGeometry = new THREE.BoxGeometry(0.04, 0.07, 0.58);
        this.attachPart(swingarmGeometry, P.steel, -0.08, 0.32, -0.4);
        this.attachPart(swingarmGeometry, P.steel, 0.08, 0.32, -0.4);
        const sprocket = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.014, 18), P.steelDark);
        sprocket.rotation.z = Math.PI / 2;
        sprocket.position.set(-0.09, 0, 0);
        sprocket.castShadow = true;
        this.rearWheel.add(sprocket);
        const sprocketInner = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.018, 12), P.darkMetal);
        sprocket.add(sprocketInner);
        this.attachPart(new THREE.BoxGeometry(0.014, 0.022, 0.6), P.darkMetal, -0.105, 0.4, -0.36, { rx: -0.08 });
        this.attachPart(new THREE.BoxGeometry(0.014, 0.022, 0.6), P.darkMetal, -0.105, 0.25, -0.36, { rx: -0.25 });
        this.attachPart(new THREE.BoxGeometry(0.03, 0.04, 0.06), P.steelDark, -0.105, 0.3, -0.55);
        // Serrated footpegs + shift/brake levers
        const pegGeometry = new THREE.BoxGeometry(0.1, 0.018, 0.055);
        this.attachPart(pegGeometry, P.steel, -0.19, 0.42, -0.08);
        this.attachPart(pegGeometry, P.steel, 0.19, 0.42, -0.08);
        this.attachPart(new THREE.BoxGeometry(0.014, 0.014, 0.16), P.steelDark, -0.15, 0.44, 0.06, { ry: -0.2 });
        this.attachPart(new THREE.BoxGeometry(0.014, 0.014, 0.18), P.steelDark, 0.15, 0.4, 0.04, { ry: 0.15 });

        // Rear shock + linkage
        this.attachPart(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 8), P.caliperRed, 0, 0.5, -0.18, { rx: 0.35 });
        this.attachPart(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6), P.steelDark, 0, 0.34, -0.26, { rx: 1.2 });

        // ---- Exhaust: swept header into a brushed silencer up high ----
        this.addCable([[0.0, 0.64, 0.3], [0.13, 0.5, 0.36], [0.16, 0.34, 0.16], [0.14, 0.4, -0.2], [0.13, 0.6, -0.4]], 0.024, P.steel);
        const silencerGeometry = this.makeLathe([
            [0.0, 0.0], [0.04, 0.0], [0.055, 0.05], [0.055, 0.3], [0.04, 0.35], [0.025, 0.36], [0.025, 0.4], [0.0, 0.4]
        ], 12);
        silencerGeometry.rotateX(-Math.PI / 2);
        this.attachPart(silencerGeometry, P.steel, 0.13, 0.66, -0.32, { rx: 0.22 });

        // ---- Wide MX bar with crossbar + pad ----
        this.buildHandlebar({ y: 1.12, z: 0.52, width: 0.6, crossbar: true, cables: true, palette: P });
        const pad = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.16, 3, 8), P.paint);
        pad.rotation.z = Math.PI / 2;
        pad.position.set(0, 0.05, 0);
        pad.castShadow = true;
        this.handlebar.add(pad);

        // Tiny enduro tail light (contract position preserved)
        this.buildBrakeLight(0, 1.04, -0.8, -0.28);

        // Attack-posture rider in MX gear: up off the seat, elbows high
        this.buildVariantRider({
            ...Vehicle.BIKES.dirt.seat,
            suitColor: 0x1e2026, suitAccent: P.paintHex, helmetColor: P.paintHex, helmetAccent: 0xeceff1
        });
    }

    // The physics state a step may write, checked finite after each step: the position, the velocity and these
    static get PHYSICS_STATE() { return ['speed', 'leanAngle', 'leanVelocity', 'yawAngle', 'handlebarAngle', 'steeringAngle', 'wheelieAngle', 'slideAngle']; }

    // One physics step, and the guard on what it leaves: no non-finite number reaches the physics state (and from
    // there the camera, the fog and the frame). A step that leaves one is undone: the last finite state is held and
    // the first such step is logged with the inputs that produced it. A held step is a bug upstream, not a recovery
    // (nonFiniteSteps counts them, and the tests require it to stay 0).
    update(deltaTime, steeringInput, throttleInput, brakeInput, wheelieInput = 0) {
        const held = this.heldState || (this.heldState = { position: new THREE.Vector3(), velocity: new THREE.Vector3() });
        const fields = Vehicle.PHYSICS_STATE;
        held.position.copy(this.position);
        held.velocity.copy(this.velocity);
        for (const k of fields) held[k] = this[k];
        this.integrate(deltaTime, steeringInput, throttleInput, brakeInput, wheelieInput);
        // A field that was not a finite number before the step (unset on this bike) is not this step's to judge
        const lost = k => Number.isFinite(held[k]) && !Number.isFinite(this[k]);
        const lostVector = k => Vehicle.finiteVector(held[k]) && !Vehicle.finiteVector(this[k]);
        let ok = !lostVector('position') && !lostVector('velocity');
        for (let i = 0; ok && i < fields.length; i++) ok = !lost(fields[i]);
        if (ok) return;
        const bad = fields.filter(lost).concat(['position', 'velocity'].filter(lostVector));
        this.nonFiniteSteps = (this.nonFiniteSteps || 0) + 1;
        if (!this.nonFiniteLogged) {
            this.nonFiniteLogged = true;
            const p = this.projection || {};
            console.error('Vehicle.update: a non-finite', bad.join(', '), 'held at the last finite state', JSON.stringify({
                deltaTime, steeringInput, throttleInput, brakeInput, wheelieInput,
                before: { x: held.position.x, y: held.position.y, z: held.position.z, speed: held.speed, lean: held.leanAngle, yaw: held.yawAngle },
                after: { x: this.position.x, y: this.position.y, z: this.position.z, speed: this.speed, lean: this.leanAngle, yaw: this.yawAngle },
                projection: { index: p.index, along: p.along, s: p.s, lateral: p.lateral, distance: p.distance, y: p.y }
            }));
        }
        this.position.copy(held.position);
        this.velocity.copy(held.velocity);
        for (const k of fields) if (Number.isFinite(held[k])) this[k] = held[k];
        this.updateMesh();
    }

    static finiteVector(v) { return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }

    integrate(deltaTime, steeringInput, throttleInput, brakeInput, wheelieInput = 0) {
        // Store inputs for use in updateMesh
        this.currentBrakeInput = brakeInput;
        this.currentDeltaTime = deltaTime;
        // The way the bike rode into this tick: a crash replaces the speed and the velocity (a bounce off a wall),
        // and the rider leaves the bike with what it had (Vehicle.beginRiderFall)
        if (!this.crashed) {
            this.rodeSpeed = this.speed;
            this.rodeYaw = this.yawAngle;
        }

        // Snapshot for render interpolation (fixed-timestep physics vs
        // variable-rate rendering: frames otherwise alternate between 1 and 2
        // physics steps and the bike visibly judders against the camera)
        if (!this.prevRenderPos) {
            this.prevRenderPos = this.position.clone();
            this.renderPosition = this.position.clone();
            this.renderYawAngle = this.yawAngle;
        } else {
            this.prevRenderPos.copy(this.position);
        }
        this.prevRenderYaw = this.yawAngle;

        // Track distance traveled (only when not crashed)
        if (!this.crashed && this.lastPosition) {
            const distanceDelta = this.position.distanceTo(this.lastPosition);
            this.distanceTraveled += distanceDelta;
        }
        this.lastPosition = this.position.clone();

        // Note: currentRoadSegment is now updated ONLY by the search-based methods
        // (checkWallCollision and updateElevation) which find the true closest segment.
        // The old Z-delta tracking was unreliable on curves and caused oscillation.
        
        // After the finish line the run is over: roll to a stop upright.
        // Live physics here let the bike fall over or ride off the cliff
        // behind the results banner.
        if (this.finished && !this.crashed) {
            this.speed *= Math.max(0, 1 - 1.5 * deltaTime);
            this.leanAngle *= Math.max(0, 1 - 6 * deltaTime);
            this.leanVelocity = 0;
            this.steeringAngle = 0;
            this.isWheelie = false;
            this.wheelieAngle *= Math.max(0, 1 - 6 * deltaTime);
            if (!this.isJumping) {
                const roll = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, this.yawAngle, 0));
                this.velocity.copy(roll.multiplyScalar(this.speed));
                this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
                this.updateElevation();
                this.updateMesh();
                return;
            }
        }

        // Check for wall/edge collision FIRST (even when crashed, in case we need to fall)
        if (!this.fallingOffCliff) {
            this.checkWallCollision(deltaTime);
        }
        
        if (this.crashed) {
            // If falling off cliff, apply gravity and check ground collision
            if (this.fallingOffCliff) {
                // Apply stronger gravity for dramatic falling
                this.velocity.y -= 15 * deltaTime;

                // Add air resistance (proportional to velocity squared, opposing motion)
                const airResistance = 0.1 * Math.abs(this.velocity.y) * this.velocity.y * deltaTime;
                if (this.velocity.y < 0) {
                    this.velocity.y -= airResistance; // Slow down falling speed
                }

                // Apply air resistance to horizontal movement too
                const horizontalSpeed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
                if (horizontalSpeed > 0.1) {
                    const dragFactor = 1 - (0.05 * horizontalSpeed * deltaTime);
                    this.velocity.x *= Math.max(dragFactor, 0.9);
                    this.velocity.z *= Math.max(dragFactor, 0.9);
                }

                // Update position
                this.position.x += this.velocity.x * deltaTime;
                this.position.y += this.velocity.y * deltaTime;
                this.position.z += this.velocity.z * deltaTime;

                // Tumble while airborne/sliding, slowing as energy bleeds off
                if (!this.hitGround && this.tumbleSpeed) {
                    this.tumbleAngle += this.tumbleSpeed * deltaTime;
                    this.tumbleRoll += this.tumbleSpeed * 0.6 * deltaTime;
                }

                // Check terrain collision - sample terrain height at current position
                const terrainHeight = this.getTerrainHeightAt(this.position.x, this.position.z);
                const lip = this.fallLip();
                
                // Check if hit terrain or lake
                if (this.position.y <= terrainHeight + 0.5) {
                    // Hit the terrain/slope
                    this.position.y = terrainHeight + 0.5; // Place bike on terrain

                    // Hard impacts bounce the bike back off the hillside,
                    // kicking the tumble - it cartwheels down rather than stopping
                    if (this.velocity.y < -8) {
                        this.velocity.y = Math.abs(this.velocity.y) * 0.35;
                        this.tumbleSpeed = Math.min((this.tumbleSpeed || 3) * 1.3, 14);
                    }

                    // Ground contact scrubs tumble energy (only once it has
                    // actually descended - keep cartwheeling over the lip)
                    if (this.tumbleSpeed && this.fallStartY - this.position.y > lip) {
                        this.tumbleSpeed *= Math.max(0, 1 - 1.2 * deltaTime);
                        if (this.tumbleSpeed < 0.3) this.tumbleSpeed = 0;
                    }

                    // Calculate slope normal to determine slide direction
                    const slopeNormal = this.calculateSlopeNormal(this.position.x, this.position.z);
                    
                    // If on a steep slope, slide down it
                    const slopeAngle = Math.acos(slopeNormal.y);
                    const slopeDegrees = slopeAngle * 180 / Math.PI;
                    
                    if (slopeDegrees > 30) { // Steep slope - keep sliding
                        // Project velocity onto slope
                        const slideDirection = new THREE.Vector3(slopeNormal.x, 0, slopeNormal.z).normalize();
                        const slideSpeed = Math.max(5, this.speed * 0.7); // Maintain some sliding speed
                        
                        this.velocity.x = slideDirection.x * slideSpeed;
                        this.velocity.z = slideDirection.z * slideSpeed;
                        this.velocity.y = -Math.tan(slopeAngle) * slideSpeed * 0.5; // Slide downward
                        
                        // Apply friction
                        this.velocity.multiplyScalar(0.98);
                    } else if (this.fallStartY - this.position.y < lip) {
                        // Still on the flat shoulder at the cliff lip - keep
                        // the bike rolling outward so it carries over the edge
                        // and tumbles down the hill instead of stalling here
                        const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
                        if (hSpeed > 0.1 && hSpeed < 6) {
                            const boost = 6 / hSpeed;
                            this.velocity.x *= boost;
                            this.velocity.z *= boost;
                        }
                    } else {
                        // Gentle slope or flat - stop. Rest is judged on the
                        // ground speed: gravity keeps a resting bike's vertical
                        // velocity at about -1.4 for as long as it sits there, so
                        // the full length never fell under 0.5 and a bike at the
                        // foot of a fall never counted as landed.
                        this.velocity.multiplyScalar(0.85); // Quick stop
                        if (Math.hypot(this.velocity.x, this.velocity.z) < 0.5) {
                            this.velocity.set(0, 0, 0);
                            this.speed = 0;
                            this.hitGround = true;
                        }
                    }

                    if (!this.groundHitLogged && this.hitGround) {
                        console.log('CRASHED! Hit the terrain after falling',
                            Math.abs(this.fallStartY - terrainHeight).toFixed(1) + ' meters');
                        this.groundHitLogged = true;
                    }
                }
            } else {
                // Normal crash - sliding on road. Crash impulses include an
                // upward kick, so gravity must pull the bike back down and the
                // road must catch it (it used to float away on the impulse)
                this.velocity.y -= 20 * deltaTime;
                this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
                this.velocity.x *= 0.98; // Friction slows the slide
                this.velocity.z *= 0.98;

                // Clamp to the road surface (windowed nearest-segment search)
                const crashRoadY = this.environment && this.environment.route
                    ? this.surfaceAt(this.position.x, this.position.z)
                    : this.position.y;
                if (this.position.y <= crashRoadY && this.velocity.y < 0) {
                    this.position.y = crashRoadY;
                    this.velocity.y = 0;
                }
            }
            
            this.speed = Math.sqrt(this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z);
            if (this.fall) this.stepFall(deltaTime);
            if (this.riderFall && this.riderFall.on) this.stepRiderFall(deltaTime);
            this.updateMesh();
            return;
        }
        
        // Update speed based on throttle/brake
        this.updateSpeed(deltaTime, throttleInput, brakeInput);

        // Update wheelie physics
        this.updateWheelie(deltaTime, throttleInput, brakeInput, wheelieInput, this.onWheelieScore);

        // Check for jump ramps
        if (!this.isJumping && this.environment && this.environment.jumpRamps) {
            for (const ramp of this.environment.jumpRamps) {
                const dx = this.position.x - ramp.position.x;
                const dz = this.position.z - ramp.position.z;
                
                // Rotate to ramp's local space
                // Inverse of the ramp mesh's rotation.y = heading
                const cos = Math.cos(ramp.rotation);
                const sin = Math.sin(ramp.rotation);
                const localX = dx * cos - dz * sin;
                const localZ = dx * sin + dz * cos;
                
                // Check if we're within ramp bounds
                const onRamp = Math.abs(localX) < ramp.width / 2 && 
                              localZ > -ramp.length / 2 && 
                              localZ < ramp.length / 2;
                
                if (onRamp && this.speed > 15) {
                    // Calculate height on ramp based on position
                    const rampProgress = (localZ + ramp.length / 2) / ramp.length;
                    let expectedHeight;
                    
                    if (rampProgress < 0.6) {
                        // Going up the ramp
                        expectedHeight = (rampProgress / 0.6) * ramp.height;
                    } else {
                        // Going down the ramp
                        expectedHeight = ramp.height * (1 - (rampProgress - 0.6) / 0.4);
                    }
                    
                    // Adjust bike height to follow ramp
                    const targetY = ramp.position.y + expectedHeight;
                    
                    // If we're on the upward part and high enough, initiate jump
                    if (rampProgress > 0.4 && rampProgress < 0.7 && expectedHeight > ramp.height * 0.7) {
                        this.initiateJump(ramp);
                        break;
                    } else if (!this.isJumping) {
                        // Smoothly follow ramp surface
                        this.position.y = this.position.y * 0.7 + targetY * 0.3;
                    }
                }
            }
        }
        
        // Handle jump physics
        if (this.isJumping) {
            this.updateJump(deltaTime, throttleInput, brakeInput);
        }
        
        // Check for low-speed fall (but not while jumping)
        if (!this.worldPhysics && !this.isJumping && this.speed < this.minSpeed) {
            this.crashed = true;
            this.crashWhy = 'stall';
            this.crashAngle = this.leanAngle || 0.5; // Fall to the side
            console.log('CRASHED! Speed too low:', (this.speed * 2.237).toFixed(1) + ' mph');
        }

        // Check for boulder collisions. A loose boulder is skipped while
        // airborne (the bike clears what it is hopping over). A solid one
        // (a trunk, a rock on run-off ground, a piece of roadworks plant) is
        // tested in the air too, by horizontal distance and height: a bike
        // above its top clears it, one below it hits it and is never hopped.
        if (this.environment && this.environment.boulders) {
            for (const boulder of this.environment.boulders) {
                if (boulder.solid) {
                    if (this.hitSolid(boulder)) break;
                    continue;
                }
                if (this.isJumping) continue;

                const dx = this.position.x - boulder.position.x;
                const dy = this.position.y - boulder.position.y;
                const dz = this.position.z - boulder.position.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                
                // Check if we hit the boulder (account for bike size)
                if (distance < boulder.radius + 1.0) {
                    // Bikes with enough suspension hop small rocks instead of
                    // crashing - dirt bike clears most debris, scooter almost none
                    if (this.attemptHop(boulder.radius)) {
                        break;
                    }

                    this.crashed = true;
                    this.crashWhy = 'obstacle';
                    this.blockRider(boulder.position.x, boulder.position.z, boulder.radius);
                    this.crashAngle = this.leanAngle || 0.5;

                    // Set crash velocity based on impact
                    const impactForce = this.speed * 0.5;
                    const impactDir = new THREE.Vector3(dx, 0, dz).normalize();
                    this.velocity = impactDir.multiplyScalar(impactForce);
                    this.velocity.y = 2; // Small upward force

                    console.log('CRASHED! Hit a boulder at', (this.speed * 2.237).toFixed(1) + ' mph');
                    break;
                }
            }
        }
        
        // Check for roadwork obstacle collisions (shipping containers, hairpin barriers)
        if (this.environment && this.environment.roadworkObstacles) {
            for (const obstacle of this.environment.roadworkObstacles) {
                const dx = this.position.x - obstacle.position.x;
                const dz = this.position.z - obstacle.position.z;

                // Simple box collision detection
                let collisionDistance;
                if (obstacle.type === 'container') {
                    collisionDistance = 2.5; // Shipping container collision radius
                } else {
                    collisionDistance = 2;
                }

                const distance = Math.sqrt(dx * dx + dz * dz);

                if (distance < collisionDistance) {
                    this.crashed = true;
                    this.crashWhy = 'obstacle';
                    this.blockRider(this.position.x - dx, this.position.z - dz, collisionDistance - 1);
                    this.crashAngle = this.leanAngle || 0.5;

                    // Set crash velocity based on impact
                    const impactForce = this.speed * 0.6;
                    const impactDir = new THREE.Vector3(dx, 0, dz).normalize();
                    this.velocity = impactDir.multiplyScalar(impactForce);
                    this.velocity.y = 1.5; // Small upward force

                    console.log('CRASHED! Hit construction', obstacle.type, 'at', (this.speed * 2.237).toFixed(1) + ' mph', 'distance:', distance.toFixed(2));
                    break;
                }
            }
        }

        // An obstacle crash set a bounce-back velocity above. Stop here, or
        // the normal movement below overwrites it and the bike slides
        // straight through the obstacle at full speed.
        if (this.crashed) {
            this.updateMesh();
            return;
        }

        // Check if bike has fallen through the road surface (especially when crashed on side)
        if (this.environment && this.environment.route && !this.fallingOffCliff) {
            // Windowed search - full scans here cost O(route) per physics tick
            const surfaceY = this.surfaceAt(this.position.x, this.position.z);

            if (this.position.y < surfaceY - 2.0) {
                // Bike is significantly below the surface - correct position
                this.position.y = surfaceY;
                this.velocity.y = Math.max(0, this.velocity.y); // Prevent downward velocity

                // If not already crashed, crash it now. The world only lifts the bike: its land steps up beside
                // the road (a bank, an 8 m tile cell) faster than the height follows, and a wall is a zone
                if (!this.crashed && !this.worldPhysics) {
                    this.crashed = true;
                    this.crashWhy = 'sunk';
                    this.crashAngle = this.leanAngle || 0.5;
                }
            }
        }

        // Wall collision is now handled in checkWallCollision() - removed duplicate check

        // Update physics
        this.updatePhysics(deltaTime, steeringInput);
        
        // Check for crash from excessive lean
        if (!this.worldPhysics && Math.abs(this.leanAngle) > this.legLeanLimit()) {
            this.crashed = true;
            this.crashWhy = 'grip';
            this.crashAngle = this.leanAngle;
            console.log('CRASHED! Lean angle exceeded:', (this.leanAngle * 180/Math.PI).toFixed(1) + '°');
        }
        
        // Update position
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyEuler(new THREE.Euler(0, this.yawAngle, 0));
        this.velocity.copy(forward.multiplyScalar(this.speed));

        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));

        // Update elevation to follow road
        const preElevationX = this.position.x;
        const preElevationZ = this.position.z;
        this.updateElevation();
        const postElevationX = this.position.x;
        const postElevationZ = this.position.z;

        // Wall collision already checked at the beginning of update()

        // A world's roadworks: the ramps and heaps ridden, the things knocked or hit, a red light run (Roadworks.ride)
        if (this.worldPhysics && this.environment && this.environment.roadworks) this.environment.roadworks.ride(this, deltaTime);

        // Update 3D model
        this.updateMesh();
    }
    
    // Weather grip, further reduced on loose run-off ground
    physicsMultipliers() {
        const weather = this.weatherSystem ? this.weatherSystem.getPhysicsMultipliers() : {
            lateralFriction: 1.0,
            brakeForce: 1.0,
            acceleration: 1.0
        };
        if (!this.runoff) return weather;
        const { grip } = this.legRunoff();
        return {
            ...weather,
            lateralFriction: weather.lateralFriction * grip,
            brakeForce: weather.brakeForce * grip,
            acceleration: weather.acceleration * grip
        };
    }

    updateSpeed(deltaTime, throttleInput, brakeInput) {
        if (this.worldPhysics) return this.updateWorldSpeed(deltaTime, throttleInput, brakeInput);
        // Calculate road gradient effect
        let gradientForce = 0;
        // (not in the air: position.y is then above the road and reads as a
        // steep downhill)
        if (this.environment && this.environment.route && !this.isJumping) {
            // Find the road gradient by looking ahead and behind
            const lookDistance = 5; // meters
            let currentY = this.position.y;
            // Beside the road the slope is the road's: the ground there falls
            // away sideways, which would otherwise read as downhill along the
            // track and speed a bike up on loose ground
            const onRunoff = !!this.runoff;
            if (onRunoff) currentY = this.roadYAt(this.position.x, this.position.z);
            
            // Find point ahead
            const forward = new THREE.Vector3(0, 0, lookDistance);
            forward.applyEuler(new THREE.Euler(0, this.yawAngle, 0));
            const aheadPos = this.position.clone().add(forward);
            
            // Find elevation ahead (windowed search around current segment)
            const aheadY = onRunoff
                ? this.roadYAt(aheadPos.x, aheadPos.z)
                : this.surfaceAt(aheadPos.x, aheadPos.z);
            
            // Calculate gradient (rise over run)
            const gradient = (aheadY - currentY) / lookDistance;
            
            // Gravity component along the slope
            // Going uphill: negative force, going downhill: positive force
            gradientForce = -gradient * 9.81 * 0.3; // Scaled for gameplay
        }
        
        // Get weather physics multipliers
        const weatherMultipliers = this.physicsMultipliers();

        // Apply throttle (reduced during wheelie for challenge)
        if (throttleInput > 0) {
            const wheeliePenalty = this.isWheelie ? 0.3 : 1.0; // Only 30% acceleration during wheelie
            this.speed += this.tuned('acceleration') * throttleInput * deltaTime * wheeliePenalty * weatherMultipliers.acceleration;
        }

        // Apply brakes (reduced in bad weather)
        if (brakeInput > 0) {
            this.speed -= this.tuned('brakeForce') * brakeInput * deltaTime * weatherMultipliers.brakeForce;
        }
        
        // Apply gradient force
        this.speed += gradientForce * deltaTime;
        
        // Air resistance (much reduced so you don't need constant throttle)
        const dragForce = 0.002 * this.speed * this.speed;
        this.speed -= dragForce * deltaTime;
        
        // Clamp speed
        this.speed = Math.max(0, Math.min(this.tuned('maxSpeed'), this.speed));
    }

    updateWheelie(deltaTime, throttleInput, brakeInput, wheelieInput = 0, onWheelieScore = null) {
        // Simple debug to confirm method is called
        if (!this.wheelieDebugInit) {
            console.log('=== WHEELIE SYSTEM INITIALIZED ===');
            this.wheelieDebugInit = true;
        }

        // Only allow wheelies when on ground and not crashed
        if (this.crashed || this.isJumping) {
            this.wheelieAngle = 0;
            this.wheelieVelocity = 0;
            this.isWheelie = false;
            return;
        }



        // Detect wheelie initiation - ONLY with dedicated wheelie key, any speed
        const isWheelieKeyPressed = wheelieInput > 0;
        // Simple wheelie trigger - just need to press the key
        const canStartWheelie = isWheelieKeyPressed && !this.isWheelie;
        
        // Debug wheelie attempts
        if (wheelieInput > 0 && !this.wheelieDebugThrottle) {
            console.log('Wheelie attempt:');
            console.log('  Wheelie key pressed: Yes');
            console.log('  isWheelie:', this.isWheelie);
            console.log('  wheelieAngle:', this.wheelieAngle);
            console.log('  Can start?', canStartWheelie);
            this.wheelieDebugThrottle = true; // Only log once
            setTimeout(() => this.wheelieDebugThrottle = false, 1000); // Reset after 1 second
        }

        if (canStartWheelie && this.wheelieAngle < 0.001) {
            // Start wheelie with a stronger pop
            this.isWheelie = true;
            this.wheelieAngle = 0.05; // Start with more visible angle
            // Initial lift: the rider's own, by how light the bike is at low speed and by the drive it has to spare at
            // this speed (Vehicle.popShare)
            this.wheelieVelocity = 3.5 * (this.tuned('wheeliePopMult') || 1) * Vehicle.popShare(this.wheelieBike, this.speed);
            this.wheelieStartTime = performance.now();
            this.wheelieScoreAccumulated = 0;
            console.log('===== WHEELIE STARTED! =====');
            console.log('Speed:', this.speed.toFixed(1) + 'm/s (' + (this.speed * 2.237).toFixed(1) + ' mph)');
        }

        if (this.isWheelie) {
            // SIMPLIFIED WHEELIE PHYSICS - More fun, less punishing
            
            const angleDegrees = this.wheelieAngle * 180 / Math.PI;
            
            // Natural gravity - wheelie wants to fall back down with progressive difficulty
            const gravityPull = 2.3 + (angleDegrees / 45) * 1.6; // 2.3-3.9 based on angle
            this.wheelieVelocity -= gravityPull * deltaTime;
            
            // Throttle control - main way to control wheelie after initiation
            if (throttleInput > 0) {
                // Progressive throttle response - more sensitive at higher angles
                // The throttle lifts only by the drive the bike has to spare at this speed (Vehicle.liftShare): a
                // bike with none cannot hold the front up, a powerful one still can at speed
                const throttleSensitivity = (5.2 + (angleDegrees / 60) * 0.8) * (this.tuned('wheelieThrottleMult') || 1) * Vehicle.liftShare(this.wheelieBike, this.speed);
                this.wheelieVelocity += throttleInput * throttleSensitivity * deltaTime;
            }
            
            // Brake brings it down - useful to save from crash
            if (brakeInput > 0) {
                // Progressive brake response - more effective at higher angles
                const brakePower = 5.5 + (angleDegrees / 60) * 1.5;
                this.wheelieVelocity -= brakeInput * brakePower * deltaTime;
            }
            
            // Note: Wheelie key (Space/Shift) is only used to START the wheelie
            // After that, use throttle (W) to maintain it
            
            // Update wheelie angle
            this.wheelieAngle += this.wheelieVelocity * deltaTime;
            
            // Check for backwards flip crash with warning zone
            const dangerAngleDegrees = 70; // Warning zone
            const crashAngleDegrees = this.wheelieCrashAngle * 180 / Math.PI; // Same threshold the HUD scales to
            
            if (angleDegrees >= crashAngleDegrees) {
                // CRASHED! Went too far back
                this.crashed = true;
                this.crashWhy = 'flip';
                this.isWheelie = false;
                this.wheelieAngle = 0;
                this.wheelieVelocity = 0;
                console.log('WHEELIE CRASH! Flipped backwards at', angleDegrees.toFixed(1) + '°');
                return;
            } else if (angleDegrees >= dangerAngleDegrees) {
                // In danger zone - provide extra gravity assistance
                this.wheelieVelocity -= 0.5 * deltaTime;
            }
            
            // Don't clamp the angle - let it go all the way to crash
            // This allows the player to actually flip if they're not careful
            this.wheelieAngle = Math.max(0, this.wheelieAngle);

            // SIMPLE FUN SCORING - Just rack up points!
            const wheelieDuration = (performance.now() - this.wheelieStartTime) / 1000;
            
            // Base points based on angle - higher is better (risk vs reward)
            let pointsPerSecond = 20; // Base points
            
            if (angleDegrees >= 60) {
                // High angle - risky but rewarding!
                pointsPerSecond = 100;
            } else if (angleDegrees >= 40) {
                // Good angle
                pointsPerSecond = 60;
            } else if (angleDegrees >= 20) {
                // Decent angle
                pointsPerSecond = 40;
            }
            
            // Duration bonus - longer wheelies are worth more (1x to 2x after 6 seconds)
            const durationBonus = 1 + Math.min(wheelieDuration / 6, 1);

            // Speed bonus - faster is better
            const speedMph = this.speed * 2.237;
            const speedMultiplier = 1 + (speedMph / 100); // +1% per mph

            // Calculate points for this frame
            const pointsThisFrame = pointsPerSecond * deltaTime * durationBonus * speedMultiplier;

            if (onWheelieScore && pointsThisFrame > 0) {
                this.wheelieScoreAccumulated += pointsThisFrame;
                // Per-tick points are fractional (e.g. ~0.3 at 60Hz); accumulate
                // and award whole points so they aren't rounded away every tick
                this.wheeliePendingScore = (this.wheeliePendingScore || 0) + pointsThisFrame;
                const wholePoints = Math.floor(this.wheeliePendingScore);
                if (wholePoints > 0) {
                    this.wheeliePendingScore -= wholePoints;
                    onWheelieScore(wholePoints);
                }
            }

            // End wheelie if angle gets to zero or speed too low
            if (this.wheelieAngle <= 0 || this.speed < 5) {
                this.isWheelie = false;
                this.wheelieAngle = 0;
                this.wheelieVelocity = 0;
                const wheelieDuration = (performance.now() - this.wheelieStartTime) / 1000;
                
                // Final score summary
                const rating = this.wheelieScoreAccumulated > 500 ? 'AMAZING!' :
                              this.wheelieScoreAccumulated > 200 ? 'Great!' :
                              this.wheelieScoreAccumulated > 50 ? 'Good' : 'Practice more!';
                              
                console.log(`Wheelie ended! Duration: ${wheelieDuration.toFixed(1)}s | Score: ${Math.round(this.wheelieScoreAccumulated)} | ${rating}`);
                
                // Reset combo
                this.wheelieCombo = 1;
                this.wheeliePerfectFrames = 0;
            }

            // Reduced damping - less forgiving, requires more active control
            this.wheelieVelocity *= (1 - this.wheelieDamping * 0.3);
        } else if (this.wheelieAngle > 0) {
            // Gradually return to normal only if there's an angle to return from
            this.wheelieAngle *= 0.95;
            if (this.wheelieAngle < 0.01) {
                this.wheelieAngle = 0;
            }
        }
    }

    updatePhysics(deltaTime, steeringInput) {
        if (this.worldPhysics) return this.updateWorldPhysics(deltaTime, steeringInput);
        // Get weather physics multipliers
        const weatherMultipliers = this.physicsMultipliers();
        const gripTune = this.gripTune();
        const lateralFriction = gripTune === 1 ? weatherMultipliers.lateralFriction : weatherMultipliers.lateralFriction * gripTune;

        // Steering visualization
        this.steeringAngle = steeringInput * 0.3;

        // Speed affects steering sensitivity (less sensitive at high speed)
        const speedFactor = Math.max(0.3, Math.min(1.0, 20 / this.speed));
        
        // THREE MAIN FORCES:
        
        // 1. STEERING TORQUE: Counter-steering effect (speed-dependent)
        // Higher speed = more gyroscopic stability = harder to lean
        // Increase torque when trying to return to upright from a lean
        let steeringTorque = -steeringInput * this.tuned('steeringForce') * speedFactor;
        
        // Boost steering torque when actively steering against current lean (counter-steering)
        // (torque is -steeringInput, so input and lean share a sign when the
        // rider is picking the bike up)
        if (steeringInput !== 0 && Math.sign(steeringInput) === Math.sign(this.leanAngle) && Math.abs(this.leanAngle) > 0.1) {
            steeringTorque *= 1.5; // 50% more responsive when counter-steering to upright
        }
        
        steeringTorque *= (1 - Math.abs(this.leanAngle) / this.legLeanLimit());
        
        // 2. GRAVITY TORQUE: Always tries to increase lean (destabilizing)
        // Once leaning, gravity pulls the bike further over
        const gravityTorque = Math.sin(this.leanAngle) * 3.0;
        
        // 3. CENTRIPETAL TORQUE: From turning (can be stabilizing or destabilizing)
        // When turning, centripetal force at ground creates moment around CG
        // REDUCED BY WEATHER: Low grip means less centripetal force available
        let centripetalTorque = 0;
        if (Math.abs(this.leanAngle) > 0.01) {
            // Calculate turn rate from lean angle
            const leanFactor = Math.tan(Math.abs(this.leanAngle));
            const turnRadius = Math.max(8, (this.speed * this.speed) / (9.81 * leanFactor));
            const turnRate = this.speed / turnRadius;

            // Centripetal force opposes lean only in steady-state turn
            // This creates the balance point
            // Weather reduces available grip for turning
            centripetalTorque = -Math.sign(this.leanAngle) * turnRate * this.speed * 0.15 * lateralFriction;
        }

        // 4. GYROSCOPIC RESISTANCE: Higher speed = more stability
        const gyroResistance = this.leanVelocity * this.speed * 0.02;

        // 5. SELF-RIGHTING TORQUE: Bike naturally tries to return upright
        // REDUCED BY WEATHER: Low grip means tire contact patch has less righting authority
        const selfRightingTorque = -this.leanAngle * 3.5 * lateralFriction;

        // Total torque is sum of all forces
        const totalTorque = steeringTorque + gravityTorque + centripetalTorque - gyroResistance + selfRightingTorque;
        
        // Update lean velocity with small damping to prevent oscillation
        this.leanVelocity += totalTorque * deltaTime;
        
        // Apply stronger damping when returning to upright to reduce oscillation
        if (Math.abs(this.leanAngle) < 0.2 && Math.sign(this.leanVelocity) !== Math.sign(this.leanAngle)) {
            this.leanVelocity *= 0.95; // Stronger damping near center
        } else {
            this.leanVelocity *= 0.99;
        }
        
        // Update lean angle
        this.leanAngle += this.leanVelocity * deltaTime;
        
        // Turn based on lean angle - bike turns in direction of lean
        if (Math.abs(this.leanAngle) > 0.01) {
            // Realistic motorcycle turning physics
            // Turn radius = v²/(g*tan(lean_angle))
            // Simplified: larger radius for more realistic turning
            const leanFactor = Math.tan(Math.abs(this.leanAngle));
            const turnRadius = (this.speed * this.speed) / (9.81 * leanFactor);
            
            // Limit minimum turn radius to prevent unrealistic tight turns
            const minRadius = 8; // minimum 8 meter turn radius
            const actualRadius = Math.max(minRadius, turnRadius);
            
            const angularVel = this.speed / actualRadius;
            this.yawAngle -= angularVel * Math.sign(this.leanAngle) * deltaTime;
        }
        
    }

    // The world physics parameters, or null on a leg. They come from the
    // environment, so a leg (physics: null) never reaches the world branches.
    get worldPhysics() {
        const world = (this.environment && this.environment.physics) || null;
        if (!world) return null;
        const own = this.riderWorld(world);
        // As the tuning has them (js/tuning.js): the same object while no multiplier over a world field is off 1
        return this.leanHeld(typeof Tuning !== 'undefined' ? Tuning.view('world', own) : own);
    }

    // The world's numbers with the lean limit held to the bike's own (leanMostDeg): the object itself when it is under
    // it (every bike with none), else a frozen copy, kept for the object it was made from
    leanHeld(world) {
        if (!(world.leanCapDeg > this.leanMostDeg)) return world;
        const kept = this.leanHeldKept;
        if (kept && kept.base === world) return kept.out;
        const out = Object.freeze({ ...world, leanCapDeg: this.leanMostDeg });
        this.leanHeldKept = { base: world, out };
        return out;
    }

    // A classic leg's lean limit (the lean at which the bike falls) as the tuning has it, held to the bike's own
    legLeanLimit() {
        return Math.min(this.tuned('maxLeanAngle'), this.leanMostLeg);
    }

    // The world's numbers as this rider has them: the lean limit by how daring the rider is (Vehicle.leanOf). The grip
    // cap, the lean limit and the lowside all read leanCapDeg, so they move together. A frozen copy, kept for the
    // world it was made from; the rider mode and the debug tuning multiply on top of it
    riderWorld(world) {
        if (this.leanDare === 1) return world;
        const kept = this.riderWorldKept;
        if (kept && kept.base === world) return kept.out;
        const out = Object.freeze({ ...world, leanCapDeg: world.leanCapDeg * this.leanDare });
        this.riderWorldKept = { base: world, out };
        return out;
    }

    // One of the bike's own numbers as the tuning has it (Tuning rows `on: 'bike'`): the number itself, untouched,
    // while no multiplier over it is off 1. The character's and the bike's own multipliers are in the number already
    tuned(field) {
        return typeof Tuning === 'undefined' ? this[field] : Tuning.field('bike', field, this[field]);
    }

    // The tuning's multiplier of the lean's grip (Tuning `gripDry`, `gripWet`): wet is any weather that takes grip
    gripTune() {
        if (typeof Tuning === 'undefined' || !Tuning.live) return 1;
        const weather = this.weatherSystem;
        const wet = !!weather && typeof weather.weatherPhysics === 'function' && weather.weatherPhysics().lateralFriction < 1;
        return Tuning.field('grip', wet ? 'wet' : 'dry', 1);
    }

    // Reads what the route says under the bike: the grade for gravity and the
    // cobbles for grip. The surface grip goes to the weather system so its
    // multipliers scale braking and lateral grip together. On the land the
    // grade is the land's own along the bike's heading (worldLand).
    syncWorldSurface() {
        const world = this.worldPhysics;
        const route = this.environment.route;
        const sample = route ? route.sample(this.routeS) : null;
        this.worldGrade = this.runoff && Number.isFinite(this.landAlong) ? this.landAlong
            : sample && Number.isFinite(sample.grade) ? sample.grade : 0;
        this.worldSurfaceGrip = sample && sample.flags && sample.flags.cobbles ? world.cobbleGrip : 1;
        this.worldHeading = sample && Number.isFinite(sample.heading) ? sample.heading : this.yawAngle;
        if (this.weatherSystem) this.weatherSystem.surfaceGrip = this.worldSurfaceGrip;
    }

    // physicsMultipliers with the world's surface grip applied when there is
    // no weather system to apply it. On the land the lean keeps landGrip, the
    // throttle landTraction and the brake landBrakeGrip of the weather's.
    worldMultipliers() {
        const multipliers = this.physicsMultipliers();
        let { lateralFriction, brakeForce, acceleration } = multipliers;
        if (this.runoff) {
            const world = this.worldPhysics;
            const weather = this.weatherSystem ? this.weatherSystem.getPhysicsMultipliers() : { lateralFriction: 1, brakeForce: 1, acceleration: 1 };
            const land = this.landValues();
            lateralFriction = weather.lateralFriction * land.landGrip;
            brakeForce = weather.brakeForce * land.landBrakeGrip;
            acceleration = weather.acceleration * land.landTraction;
        }
        if (!this.weatherSystem) {
            lateralFriction *= this.worldSurfaceGrip;
            brakeForce *= this.worldSurfaceGrip;
        }
        const gripTune = this.gripTune();
        if (gripTune !== 1) lateralFriction *= gripTune;
        return { ...multipliers, lateralFriction, brakeForce, acceleration };
    }

    // The run-off values this bike reads on a leg: the zone's own for a bike with no off-road trait (the same
    // object), else each one moved toward LEG_OFFROAD's by the trait
    legRunoff() {
        const runoff = this.runoff;
        if (!this.offroad) return runoff;
        if (this.legRunoffSource !== runoff) {
            this.legRunoffSource = runoff;
            this.legRunoffCache = Object.freeze({ ...runoff, ...Object.fromEntries(Object.entries(LEG_OFFROAD)
                .map(([key, value]) => [key, runoff[key] + (value - runoff[key]) * this.offroad])) });
        }
        return this.legRunoffCache;
    }

    // The land values this bike reads now: the world's own for a bike with no off-road trait (the same object, so
    // nothing moves for it). Else each one moves toward WorldPhysics.offroad's by the trait (the least an off-road
    // bike has), and on toward offroad.top's by the trait to the power offroad.rise; the values that set the pace
    // (offroad.pace) take that second step by the ground under the bike too: the land cover's share and the slope's
    // (worldLand reads both from the tile data and the drawn ground). One scratch object, written each call
    landValues() {
        const world = this.worldPhysics;
        const to = world.offroad;
        if (!this.offroad || !to) return world;
        const top = to.top || {};
        const more = Math.pow(this.offroad, to.rise || 1);
        const cover = world.landCover ? world.landCover[this.landCover] || world.landCover[0] : null;
        const x = Math.max(0, Math.min(1, (this.landSteep - to.slopeFrom) / (to.slopeTo - to.slopeFrom)));
        const ground = (cover ? cover.pace : 1) * (1 - x * x * (3 - 2 * x));
        const land = this.landScratch || (this.landScratch = {});
        for (const key in to) {
            if (typeof to[key] !== 'number' || typeof world[key] !== 'number') continue;
            land[key] = world[key] + (to[key] - world[key]) * this.offroad;
        }
        for (const key in top) {
            if (typeof world[key] !== 'number') continue;
            const least = typeof to[key] === 'number' ? to[key] : world[key];
            land[key] = world[key] + (least - world[key]) * this.offroad + (top[key] - least) * more * (to.pace.includes(key) ? ground : 1);
        }
        if (cover) {
            land.landBumpM *= cover.rough;
            land.landWobbleDeg *= cover.rough;
        }
        return land;
    }

    // The deceleration of the world's full brake (m/s^2): the bike's brake times brakeGain and the surface,
    // less what the lean takes of the grip. The lean's share of the cap is used as on a friction circle, and the
    // brake keeps sqrt(1 - share^2) of itself, never less than trailBrakeFloor
    worldBrakeDecel(multipliers) {
        const world = this.worldPhysics;
        const grip = Math.max(0.01, multipliers.lateralFriction);
        const tanCap = Math.tan(world.leanCapDeg * Math.PI / 180) * grip;
        const used = Math.min(1, Math.tan(Math.min(Math.abs(this.leanAngle), 1.5)) / tanCap);
        const share = world.trailBrakeFloor + (1 - world.trailBrakeFloor) * Math.sqrt(1 - used * used);
        return this.tuned('brakeForce') * world.brakeGain * multipliers.brakeForce * share;
    }

    // The least the world's full brake gives on this surface (m/s^2): at the lean limit, where the lean has all of
    // the grip and the brake keeps trailBrakeFloor of itself. What a rider, the advice or a pilot may count on at
    // any lean
    worldBrakeLeast(multipliers) {
        const world = this.worldPhysics;
        return this.tuned('brakeForce') * world.brakeGain * multipliers.brakeForce * world.trailBrakeFloor;
    }

    updateWorldSpeed(deltaTime, throttleInput, brakeInput) {
        const world = this.worldPhysics;
        this.syncWorldSurface();
        const weatherMultipliers = this.worldMultipliers();

        // The twist grip opens over throttleRiseS and shuts over throttleFallS, so a key press does not give
        // full drive on the first frame
        const want = Math.max(0, Math.min(1, throttleInput));
        const step = deltaTime / (want > this.worldThrottle ? world.throttleRiseS : world.throttleFallS);
        this.worldThrottle = want > this.worldThrottle
            ? Math.min(want, this.worldThrottle + step)
            : Math.max(want, this.worldThrottle - step);
        throttleInput = this.worldThrottle;
        this.worldBrake = Math.max(0, Math.min(1, brakeInput || 0));
        const land = this.landValues();

        if (throttleInput > 0) {
            const wheeliePenalty = this.isWheelie ? 0.3 : 1.0;
            // On the land the wheel spins up over landCapSpeed: the pull fades out across landCapBand under it
            const spin = this.runoff ? Math.max(0, Math.min(1, (land.landCapSpeed - this.speed) / world.landCapBand)) : 1;
            this.speed += this.worldDrive(this.speed) * throttleInput * deltaTime * wheeliePenalty * weatherMultipliers.acceleration * spin;
        }
        if (brakeInput > 0) {
            this.speed -= this.worldBrakeDecel(weatherMultipliers) * Math.min(1, brakeInput) * deltaTime;
        }
        // Engine braking with the throttle closed, down to idleSpeed; under it the bike rolls down at rollDecel
        let engine = 0;
        if (throttleInput <= 0 && !this.isJumping) {
            if (this.speed > world.idleSpeed) {
                engine = Math.min(world.engineBrakeMax, world.engineBrake * this.speed);
                this.speed = Math.max(world.idleSpeed, this.speed - engine * deltaTime);
            } else {
                this.speed = Math.max(0, this.speed - world.rollDecel * deltaTime);
            }
        }
        // The land's drag: landRoll x the speed, and landDrag x the speed over landCapSpeed, at most landDecelMax
        if (this.runoff && !this.isJumping) {
            const drag = land.landRoll * this.speed + land.landDrag * Math.max(0, this.speed - land.landCapSpeed);
            this.speed -= Math.min(world.landDecelMax, drag) * deltaTime;
        }
        // A power slide scrubs speed by its angle (updateWorldPhysics), on the land only: back on the carriageway
        // the slide that is left costs nothing
        if (this.slideAngle !== 0 && this.runoff) this.speed -= world.slideScrub * Math.abs(this.slideAngle) * deltaTime;

        // The route grade acts at full strength, so a descent speeds the bike up
        if (!this.isJumping) {
            this.speed -= this.worldGrade * 9.81 * world.slopeGravity * deltaTime;
        }
        this.speed -= world.aeroDrag * this.speed * this.speed * deltaTime;
        this.adviceBraking(deltaTime, throttleInput, brakeInput, weatherMultipliers, engine);

        // Under fallSpeed with the throttle closed and the bike near upright, the rider puts a foot down and it stops
        // (leaned further it tips over instead: updateWorldPhysics). Nothing lifts the speed back up
        const crawl = throttleInput <= 0 && this.speed < world.fallSpeed && Math.abs(this.leanAngle) <= world.tipLeanDeg * Math.PI / 180;
        if (crawl) this.speed = Math.max(0, this.speed - world.footDownDecel * deltaTime);
        this.footDown = crawl && this.speed < world.footDownSpeed;
        if (this.footDown) this.speed = 0;

        this.speed = Math.max(0, Math.min(this.tuned('maxSpeed'), this.speed));
    }

    // The engine's drive at full throttle on the flat (m/s^2) at speed v. Over the air drag it gives the traction
    // limit (the bike's acceleration x driveShare, so a character keeps its ratio) up to powerSpeed, then constant
    // power, the limit x powerSpeed / v, so the pull falls toward top speed. From a stop the limit starts at
    // launchShare of itself and reaches all of it at launchSpeed (a smoothstep), so the bike does not lurch away.
    // The drag is covered, so the top speed (maxSpeed) is the same as before.
    worldDrive(v) {
        const world = this.worldPhysics;
        const speed = Math.max(0, v);
        const x = Math.min(1, speed / world.launchSpeed);
        const launch = world.launchShare + (1 - world.launchShare) * x * x * (3 - 2 * x);
        const limit = this.tuned('acceleration') * world.driveShare;
        return world.aeroDrag * speed * speed + limit * Math.min(launch, speed > world.powerSpeed ? world.powerSpeed / speed : 1);
    }

    // Steering is a torque, as on the legs: holding the key builds lean,
    // a tap gives a small correction, and every press moves the bike by
    // the same amount whatever it is already doing. Unlike the legs, the
    // lean has no momentum to fall over with (the lean rate follows the
    // steering within leanRateLag), and a soft limit settles held steering
    // at the most lean that turns the bike: the grip cap, or at low speed
    // the lean of the floor radius. The bike lowsides only when the grip
    // it asks for is more than the road has.
    //
    // Under turnBlendSpeed the bike also turns on its handlebar, as a real
    // bike does at walking pace: the yaw rate blends toward v tan(handlebar) /
    // wheelbase, the floor radius drops toward lockRadius, and the lean limit
    // (the lean of the floor radius) shrinks toward upright as the speed falls.
    // The blend is 0 at turnBlendSpeed with no slope, so the yaw rate has no
    // step there, and above it this method is the lean model alone, unchanged.
    updateWorldPhysics(deltaTime, steeringInput) {
        const world = this.worldPhysics;
        const g = 9.81;
        const u = Math.max(-1, Math.min(1, steeringInput));
        const v = this.speed;
        const v2 = v * v;
        const lean = this.leanAngle;
        this.steeringAngle = steeringInput * 0.3;

        // The edge lean: running wide, the lean has a little more grip to tighten the line with, and the tightest turn
        // is tighter by the same share (under about 8 m/s the lean limit is the lean of that turn, not the grip's).
        // 0 anywhere else, and then every number here is the plain one to the last bit
        const wide = this.edgeLean(deltaTime);
        const tightest = wide > 0 ? world.radiusFloor / (1 + wide) : world.radiusFloor;
        const handlebarShare = this.lowSpeedShare(v);
        const radiusFloor = handlebarShare > 0
            ? world.lockRadius + (tightest - world.lockRadius) * (1 - handlebarShare)
            : tightest;

        const grip = Math.max(0.01, this.worldMultipliers().lateralFriction);
        const capEff = Math.atan(Math.tan(world.leanCapDeg * Math.PI / 180) * (wide > 0 ? grip * (1 + wide) : grip));
        // An off-road bike on the land (not the verge, which has the road's grip) with the throttle open steps its
        // rear out past the grip instead of falling: hold is how much of that this bike has now, 0 for a road bike,
        // on the carriageway, with the throttle shut or the brake on hard
        const hold = this.offroad > 0 && this.runoff && !this.isJumping && this.worldBrake <= world.slideBrake
            ? this.offroad * this.worldThrottle : 0;
        const capLean = hold > 0 ? Math.atan(Math.tan(capEff) * (1 + world.slideLean * hold)) : capEff;
        // At walking pace the rider lays the bike over and counterbalances: the limit rises to lowLeanDeg
        const low = this.lowLeanShare(v);
        // (and never past what the bike itself leans: leanMostRad, Infinity for a bike held by the grip alone)
        const leanLimit = Math.min(capLean, this.leanMostRad, Math.max(Math.atan(v2 / (g * radiusFloor)), low * world.lowLeanDeg * Math.PI / 180));

        // The steering torque falls with speed as the legacy speedFactor does, and picking the bike up is quicker
        const speedFactor = v > world.steerSpeed ? Math.max(0.3, Math.pow(world.steerSpeed / v, world.steerFalloff)) : 1;
        const character = ((this.character.physics && this.character.physics.steeringForce) || 1) * this.leanMass;
        let rate = -u * world.leanRate * speedFactor * character;
        if (u !== 0 && Math.sign(u) === Math.sign(lean)) rate *= world.pickUpBoost;

        // The soft limit: an outward rate shrinks to the room left under the limit. Past the limit (the grip
        // fell) steering held into the lean gives it back only at limitReturn, so a big enough grip loss still
        // lowsides unless the rider lets go
        const side = Math.sign(rate) || Math.sign(lean);
        const outward = side * lean;
        const room = outward <= leanLimit
            ? world.leanLimitGain * (leanLimit - outward)
            : world.limitReturn * Math.abs(u) * (leanLimit - outward);
        if (side * rate > room) rate = side * room;
        // The hairpin assist: the line capture, or away from a captured line the edge assist, as one change to the
        // lean rate, low-passed over assistSmoothing so it never steps from one frame to the next. Only on the
        // carriageway, and never against the rider (worldAssistRate)
        const assist = this.onCarriageway()
            ? this.lineCapture(rate, u, leanLimit, handlebarShare, radiusFloor) - rate + (this.lineCaptured ? 0 : this.edgeAssistRate(u, deltaTime))
            : this.releaseAssist();
        this.assistApplied = 0; // the assist's lean rate this tick, as applied (read by the tests)
        if (assist !== 0 || this.assistLeanRate !== 0) {
            this.assistLeanRate += (assist - this.assistLeanRate) * (1 - Math.exp(-deltaTime / world.assistSmoothing));
            if (assist === 0 && Math.abs(this.assistLeanRate) < 1e-6) this.assistLeanRate = 0;
            this.assistApplied = this.worldAssistRate(this.assistLeanRate, u);
            rate += this.assistApplied;
        }
        this.leanVelocity += (rate - this.leanVelocity) * (1 - Math.exp(-deltaTime / world.leanRateLag));

        // The handlebar follows the steering within handlebarLag, up to the lock that turns the bike at lockRadius.
        // A captured line steers it too, by the line's weight, toward the handlebar of the line's curvature
        const lock = Math.atan(this.wheelbase / world.lockRadius);
        let bar = u * lock;
        let barAssist = 0;
        if (this.lineCaptured && this.lineWeight > 0) {
            barAssist = (Math.max(-lock, Math.min(lock, Math.atan(this.wheelbase * this.lineWant))) - bar) * this.lineWeight;
        } else if (handlebarShare > 0 && this.edgeShare > 0) {
            // At low speed the lean turns the bike little, so the edge assist turns the handlebar back off the edge
            barAssist = (-this.edgeSide * lock * 0.5 - bar) * this.edgeShare;
        }
        // The handlebar turns the bike as a lean rate of the other sign does: the same rule as the lean's assist
        bar += this.worldAssistRate(-barAssist, u) === 0 ? 0 : barAssist;
        this.handlebarAngle += (bar - this.handlebarAngle) * (1 - Math.exp(-deltaTime / world.handlebarLag));
        if (handlebarShare > 0) this.steeringAngle += (this.handlebarAngle - this.steeringAngle) * handlebarShare;

        // Let go and the bike stands itself up. This acts on the lean directly, not through the lagged rate, so
        // the next press starts from rest and moves the bike as far as the last one did
        const released = 1 - Math.abs(u);
        const righting = -released * released * world.selfRighting * lean;
        this.leanAngle += (this.leanVelocity + righting) * deltaTime;
        // Past what the bike itself leans something under it grounds: the lean stops there
        if (Math.abs(this.leanAngle) > this.leanMostRad) {
            this.leanAngle = Math.sign(this.leanAngle) * this.leanMostRad;
            if (this.leanVelocity * this.leanAngle > 0) this.leanVelocity = 0;
        }

        const tanLean = Math.tan(Math.abs(this.leanAngle));
        let curvature = v2 > 1e-6 ? Math.min(1 / radiusFloor, g * tanLean / v2) : 0;
        // Signed toward +yaw: the lean turns the bike away from its sign, the handlebar toward its own
        let turn = -curvature * Math.sign(this.leanAngle);
        if (handlebarShare > 0) {
            turn = (1 - handlebarShare) * turn + handlebarShare * Math.tan(this.handlebarAngle) / this.wheelbase;
            curvature = Math.abs(turn);
        }
        this.lastDemand = v2 * curvature / g;

        // The power slide. With a hold the rear steps out from a demand under the grip (the drive uses some of it),
        // and the drawn bike heads further into the turn by the slide angle; the path never turns tighter than the
        // grip gives (yawAngle stays the way the bike travels, so the camera, the cut rule and the progress read the
        // path). With no hold the slide comes back and the lowside below is the one every bike has
        const tanCap = Math.tan(capEff);
        const used = this.lastDemand / tanCap;
        if (hold > 0 && used > 1) turn /= used;
        this.yawAngle += v * turn * deltaTime;
        if (hold > 0 || this.slideAngle !== 0) {
            const over = hold > 0 ? Math.max(0, used - (1 - world.slideOnset * hold)) : 0;
            const want = Math.sign(turn) * Math.min(world.slideMaxDeg * Math.PI / 180, world.slideGain * over * hold);
            const lag = Math.abs(want) > Math.abs(this.slideAngle) ? world.slideRiseS : world.slideFallS;
            this.slideAngle += (want - this.slideAngle) * (1 - Math.exp(-deltaTime / lag));
            if (want === 0 && Math.abs(this.slideAngle) < 1e-3) this.slideAngle = 0;
        }

        if (this.lastDemand > (world.lowsideMargin + world.slideRoom * hold) * tanCap) {
            this.lowsideTimerMs += deltaTime * 1000;
            if (this.lowsideTimerMs >= world.lowsideMs) {
                this.worldCrash(hold > 0 ? 'Slid too far: the rear came round on the grass'
                    : this.runoff ? 'Lost the front on the grass' : 'Lost the front: too much lean for the grip', 'lowside', hold > 0 ? 'rear' : 'grip');
            }
        } else {
            this.lowsideTimerMs = 0;
        }

        // Under fallSpeed the bike holds itself up only near upright: leaned past tipLeanDeg for tipS it falls over to
        // that side; nearer upright the rider has a foot down (updateWorldSpeed) and the lean eases out
        const tip = world.tipLeanDeg * Math.PI / 180;
        if (v < world.fallSpeed && Math.abs(this.leanAngle) > tip) {
            this.tipTimerS += deltaTime;
            if (this.tipTimerS >= world.tipS) this.worldCrash('Fell over at walking pace: too much lean to put a foot down', 'tip', 'stall');
        } else {
            this.tipTimerS = 0;
            if (this.footDown || v < world.fallSpeed) this.leanAngle *= Math.exp(-world.footDownRight * deltaTime);
        }
        if (!this.crashed) this.footReach(deltaTime);
    }

    // The rider's reach at a stop (FOOT_REACH; .agent/system/handling.md, "A rider who cannot reach the ground"). A
    // rider with a footSlopeDeg cannot put a foot down on ground steeper than it: a stop there, under stopSpeed for
    // stopS, tips the bike over to the downhill side. The slope is the physics' ground under the bike: the road's grade
    // (the road is level across), or the land's whole slope. It arms only once the bike has moved off since the last
    // reset, so a restart that stands the bike on a slope never tips it before the rider rides away. Slowing under
    // hintSpeed on such ground the game tells the rider (footWarnNew), once until the bike is over hintSpeed + hintBand
    // again, so pulling away says nothing
    footReach(deltaTime) {
        if (!(this.footSlope < Infinity)) return;
        const rule = FOOT_REACH;
        if (this.speed > rule.armSpeed) this.footArmed = true;
        if (this.speed > rule.hintSpeed + rule.hintBand) this.footHint = true;
        const slope = this.runoff ? this.landSteep : Math.abs(this.worldGrade);
        const steep = this.footArmed && !this.isJumping && slope > this.footSlope;
        if (steep && this.footHint && this.speed < rule.hintSpeed) {
            this.footHint = false;
            this.footWarnNew = true;
        }
        this.footStillS = steep && this.speed < rule.stopSpeed ? this.footStillS + deltaTime : 0;
        if (this.footStillS < rule.stopS) return;
        // The ground's rise toward the bike's left: on the road the grade along the ride, by the angle between the ride
        // and the bike; on the land the land's own. A bike that faces up or down the slope goes over to the side of the
        // foot the rider reaches for (the stop pose's: Vehicle.LEFT)
        const across = this.runoff ? this.landAcross : this.worldGrade * Math.sin(this.worldHeading - this.yawAngle);
        const side = Math.abs(across) > rule.sideShare * slope ? Math.sign(across) : -Vehicle.LEFT;
        this.worldCrash(rule.cause, 'tip', 'foot');
        // A positive roll is the bike's right: the downhill side when the ground rises to its left
        this.crashAngle = side * Math.max(rule.leastRoll, Math.abs(this.leanAngle));
    }

    // A world crash with the cause the crash card shows. `fall` is how the bike is drawn going down (Vehicle.FALL):
    // 'lowside' and 'tip' fall over time (Vehicle.drawFall); any other crash lies on its side at once, as before.
    // `why` is the class of the cause (a key of Vehicle.CRASH_CAUSES), which says how the rider comes off: nothing
    // reads the words of `cause`
    worldCrash(cause, fall = null, why = null) {
        this.crashed = true;
        this.crashWhy = why;
        this.fall = fall && { kind: fall, t: 0, from: this.leanAngle + (this.landRock || 0), heading: this.yawAngle, yaw: this.slideAngle, down: 0 };
        this.slideAngle = 0;
        this.crashCause = cause;
        this.crashAngle = this.leanAngle || 0.5;
        console.log(`CRASHED! ${cause} at`, (this.speed * 2.237).toFixed(1) + ' mph');
    }

    // The share of lowLeanDeg the lean limit reaches at speed v: 0 at lowLeanSpeed and over, 1 at lowLeanFullSpeed and
    // under, a smoothstep between (no step in the limit)
    lowLeanShare(v) {
        const world = this.worldPhysics;
        const x = Math.max(0, Math.min(1, (world.lowLeanSpeed - v) / (world.lowLeanSpeed - world.lowLeanFullSpeed)));
        return x * x * (3 - 2 * x);
    }

    // The bike is on the carriageway (or nowhere on the route): the only place the hairpin assist acts
    onCarriageway() {
        const p = this.projection;
        return !p || !(p.index >= 0) || !Number.isFinite(p.lateral) || Math.abs(p.lateral) <= p.width / 2;
    }

    // Off the carriageway: the assist lets go of the line and the edge, and contributes nothing
    releaseAssist() {
        this.releaseLine(0);
        this.edgeShare = 0;
        return 0;
    }

    // An assist's lean rate as it may act. With the rider steering (u; the rider's own lean rate is -u x leanRate), a
    // rate against the rider's is dropped unless it turns the bike toward the road's centre line: a lean rate of the
    // sign of the lateral turns the bike back across it. So an assist never pulls the bike outward against the rider
    // and never resists a turn back toward the road, while it still holds a rider at full lock off the inside of a
    // hairpin. With no input the assist acts freely (it only ever acts on the carriageway)
    worldAssistRate(rate, u) {
        if (u === 0 || rate * -u >= 0) return rate;
        const lateral = this.projection && Number.isFinite(this.projection.lateral) ? this.projection.lateral : 0;
        return rate * lateral > 0 ? rate : 0;
    }

    // The share of the yaw rate the handlebar gives at speed v: 1 at rest, 0 at turnBlendSpeed and above, with no
    // slope at either end (a smoothstep), so the blend adds no step to the yaw rate
    lowSpeedShare(v) {
        const blend = this.worldPhysics.turnBlendSpeed;
        if (!(blend > 0) || v >= blend) return 0;
        const x = 1 - Math.max(0, v) / blend;
        return x * x * (3 - 2 * x);
    }

    // The hairpin assist's state: no line captured, no edge nudge
    resetHairpinAssist() {
        this.lineCaptured = false;
        this.lineWeight = 0;
        this.lineWant = 0;
        this.assistLeanRate = 0; // rad/s, the assist's low-passed share of the lean rate
        this.edgeUsedS = 0; // seconds the edge assist has acted since the bike was last near the road centre
        this.edgeShare = 0; // the edge assist's strength this frame, 0 to 1
        this.edgeLeanShare = 0; // the edge lean's share this frame, 0 to the assist's share
        this.edgeLeanUsedS = 0; // seconds the edge lean has been in use (by its share) since the bike was last near the road centre
        this.edgeSide = 0;
        this.hairpinAdvice = null;
    }

    // The share of the hairpin assist in force (0 off, 1 normal); 0 on a leg or a route with no curvature
    assistShare() {
        const world = this.worldPhysics;
        const route = this.environment && this.environment.route;
        if (!world || !route || typeof route.curvatureAt !== 'function' || typeof WorldAssist === 'undefined') return 0;
        return WorldAssist.share(world, this.assistLevel || WorldAssist.level());
    }

    // 1. Speed advice: well over the advised speed of the next tight bend, with no throttle, and near enough
    // that the bike must slow now to make it, the engine brakes at up to adviceBrake. It never brakes past the
    // advised speed, never harder than the rider's own full brake, and never with the throttle held.
    adviceBraking(deltaTime, throttleInput, brakeInput, multipliers, engine = 0) {
        const world = this.worldPhysics;
        const share = this.assistShare();
        this.hairpinAdvice = null;
        if (share <= 0 || this.crashed || !this.onCarriageway()) return;
        const v = this.speed;
        const s = Number.isFinite(this.projection.s) ? this.projection.s : this.routeS;
        // The advice plans with no more braking than the brake has at full lean (worldBrakeLeast), so a weak brake
        // (a slippery surface, a soft mode) makes it start sooner and the bike still reaches the advised speed
        const decel = Math.min(world.adviceBrake * share, this.worldBrakeLeast(multipliers));
        const look = Math.max(40, v * v / (2 * decel) + v * 1.5);
        const advice = WorldAssist.advice(this.environment.route, world, s, look, multipliers.lateralFriction);
        this.hairpinAdvice = advice;
        if (!advice || throttleInput > 0 || v <= advice.speed * 1.1) return;
        // Brake only once the bike would no longer make the advised speed at the bend with this braking
        if ((v * v - advice.speed * advice.speed) / (2 * decel) < advice.bend.distance - v * 0.5) return;
        // The engine braking already applied counts toward the advice, so the two together slow at adviceBrake
        const most = this.worldBrakeDecel(multipliers);
        const extra = Math.min(decel, most) - most * Math.max(0, brakeInput) - engine;
        if (extra > 0) this.speed = Math.max(advice.speed, this.speed - extra * deltaTime);
    }

    // The road's signed curvature at the bike over assistSpanM, read `ahead` metres on; 0 with no projection
    roadCurvature(ahead = 0) {
        const p = this.projection;
        if (!p || !(p.index >= 0) || !Number.isFinite(p.s)) return 0;
        return WorldAssist.curvature(this.environment.route, this.worldPhysics, this.roadFrame().s + ahead);
    }

    // The bike's road frame for the assist {s, heading, lateral, width}: on the route's smooth centreline when it
    // has one (WorldRoute.smoothFrame), so the frame does not jump where the polyline turns; else the projection
    roadFrame() {
        const p = this.projection;
        const route = this.environment && this.environment.route;
        if (!this.frameScratch) this.frameScratch = {};
        const frame = this.frameScratch;
        if (frame.x === this.position.x && frame.z === this.position.z && frame.from === p.s) return frame;
        if (route && typeof route.smoothFrame === 'function') route.smoothFrame(this.position.x, this.position.z, p.s, frame);
        else { frame.s = p.s; frame.heading = p.heading; frame.lateral = p.lateral; }
        frame.width = p.width;
        frame.x = this.position.x;
        frame.z = this.position.z;
        frame.from = p.s;
        return frame;
    }

    // 2. Line capture: steering into a tight bend at a turn radius within lineCapture of the line's (the road's
    // radius at the bike's offset, the offset kept within LINE_BAND_M of the centre), the lean rate is blended toward the lean of
    // that line with weight lineStrength x the fade of the bend x |input|. The rest is the rider's own torque.
    // It does nothing with no input, with the input out of the bend, on a gentle bend, or far off the line;
    // once captured it holds while the radius stays within twice the window. Under turnBlendSpeed the bike's
    // radius is the blend of the lean and the handlebar, and the handlebar is steered onto the line as well
    // (lineWant, lineWeight; updateWorldPhysics).
    lineCapture(rate, u, leanLimit, handlebarShare = 0, radiusFloor = this.worldPhysics.radiusFloor) {
        const share = this.assistShare();
        if (share <= 0 || u === 0) return this.releaseLine(rate);
        const world = this.worldPhysics;
        const v = this.speed;
        const k = this.roadCurvature(v * 0.2);
        const sign = Math.sign(k);
        const fade = WorldAssist.fade(world, 1 / Math.abs(k));
        if (fade <= 0 || Math.sign(u) !== sign || v < 1) return this.releaseLine(rate);
        const p = this.roadFrame();
        // The line keeps to the rider's band of the road, clear of the traffic lanes either side
        const room = Math.max(0, Math.min(p.width / 2 - 1.5, WorldAssist.LINE_BAND_M));
        const inner = Math.max(-room, Math.min(room, p.lateral * sign));
        const lineRadius = Math.max(radiusFloor, 1 / Math.abs(k) - inner);
        // The bike's own radius now: a lean into the bend turns it at v^2 / (g tan lean), blended at low speed
        // with the handlebar's wheelbase / tan(handlebar)
        const into = -this.leanAngle * sign;
        let radius = into > 1e-3 ? v * v / (9.81 * Math.tan(into)) : Infinity;
        if (handlebarShare > 0) {
            const leanCurvature = Math.min(1 / radiusFloor, into > 1e-3 ? 9.81 * Math.tan(into) / (v * v) : 0);
            const curvature = (1 - handlebarShare) * leanCurvature + handlebarShare * Math.tan(this.handlebarAngle * sign) / this.wheelbase;
            radius = curvature > 1e-6 ? 1 / curvature : Infinity;
        }
        const capture = world.lineCapture * (this.lineCaptured ? 2 : 1);
        // Under turnBlendSpeed a turn tighter than the line is captured too: the handlebar can turn the bike far
        // tighter than any hairpin, and a rider holding the lock would otherwise circle on the spot
        this.lineCaptured = Math.abs(radius / lineRadius - 1) <= capture || (handlebarShare > 0 && radius < lineRadius);
        if (!this.lineCaptured) return this.releaseLine(rate);
        // The arc runs along the road: a heading turned past the road's (or short of it) is brought back over
        // about a second of riding, so an early or late turn-in ends on the arc rather than parallel to it
        const ahead = Math.atan2(Math.sin(this.yawAngle - p.heading), Math.cos(this.yawAngle - p.heading)) * sign;
        const reach = Math.max(8, v);
        const want = Math.max(0, Math.min(1 / radiusFloor, 1 / lineRadius - 2 * Math.sin(ahead) / reach));
        const lineLean = -sign * Math.min(leanLimit, Math.atan(v * v * want / 9.81));
        this.lineLeanTarget = lineLean; // read by the smoothness tests
        const weight = Math.min(1, world.lineStrength * share * fade * Math.abs(u));
        this.lineWant = sign * want;
        // The handlebar is steered onto the line whole at full input (the rider's share of a lock that turns the bike
        // at under 3 m would still cut every hairpin)
        this.lineWeight = handlebarShare > 0 ? Math.min(1, share * fade * Math.abs(u)) : 0;
        return rate * (1 - weight) + weight * WorldAssist.LINE_GAIN * (lineLean - this.leanAngle);
    }

    releaseLine(rate) {
        this.lineCaptured = false;
        this.lineWeight = 0;
        return rate;
    }

    // 3. Edge assist: anywhere on the ride, a bike on the carriageway within edgeZoneM of either road edge whose
    // heading points further off the road gets a lean-rate nudge back toward the road's
    // direction, scaled by how close it is to the edge (full from half the zone out) and how sharply it heads off. It does nothing while the
    // rider steers back toward the road, or in a tunnel or gallery (the wall response has those), and it fades out over edgeBudgetS of use, so it cannot hold a bike against the edge like a
    // rail; the budget refills once the bike is back in the middle half of the road. Returns the rate (rad/s).
    edgeAssistRate(u, deltaTime) {
        this.edgeShare = 0;
        const share = this.assistShare();
        const world = this.worldPhysics;
        const p = this.projection;
        if (share <= 0 || !(world.edgeLeanRate > 0) || this.crashed || !p || !(p.index >= 0) || !Number.isFinite(p.lateral)) return 0;
        const frame = this.roadFrame();
        const half = p.width / 2;
        const lateral = frame.lateral;
        if (Math.abs(lateral) <= half * 0.5) this.edgeUsedS = 0;
        const gap = half - Math.abs(lateral);
        if (gap > world.edgeZoneM || gap < 0 || this.speed < 1) return 0;
        const side = Math.sign(lateral) || 1;
        const turn = this.yawAngle - frame.heading;
        const off = Math.sin(turn) * side;
        if (Math.cos(turn) <= 0 || off <= 0) return 0;
        if (u !== 0 && Math.sign(u) === -side) return 0;
        if (this.edgeBlocked(frame.s)) return 0;
        const budget = Math.max(0, 1 - this.edgeUsedS / world.edgeBudgetS);
        this.edgeUsedS += deltaTime;
        if (budget <= 0) return 0;
        const close = Math.min(1, 2 * (world.edgeZoneM - gap) / world.edgeZoneM); // full from half the zone out
        const sharp = Math.min(1, off / Math.sin(world.edgeAngleDeg * Math.PI / 180));
        this.edgeShare = share * close * sharp * budget;
        this.edgeSide = side;
        return side * world.edgeLeanRate * this.edgeShare;
    }

    // 4. Edge lean: the share of grip the lean gains now (WorldPhysics.edgeLean), 0 to extra x the assist's share.
    // Only for a bike on the carriageway that leans away from the edge it is near (it has run wide and turns back
    // in): a smoothstep of the distance to that edge, 0 at fromM and whole from fullM out. A lean toward the near
    // edge (the inside of the turn) and a bike past the edge get none, so it never helps a cut. The time it is in
    // use counts by its share (edgeLeanUsedS): whole for holdS, gone fadeS later, and new in the middle half of the
    // road, as the edge assist's budget is
    edgeLean(deltaTime = 0) {
        const world = this.worldPhysics;
        const rule = world.edgeLean;
        const p = this.projection;
        this.edgeLeanShare = 0; // the share in force this tick, 0 to the assist's (read by the tests)
        if (!rule || !(rule.extra > 0) || this.crashed || !p || !(p.index >= 0) || !Number.isFinite(p.lateral)) return 0;
        const half = p.width / 2;
        const gap = half - Math.abs(p.lateral);
        if (gap >= half * 0.5) this.edgeLeanUsedS = 0;
        if (gap < 0 || gap >= rule.fromM || !(this.leanAngle * p.lateral > 0)) return 0;
        const share = this.assistShare();
        if (share <= 0) return 0;
        const x = Math.min(1, (rule.fromM - gap) / (rule.fromM - rule.fullM));
        const near = x * x * (3 - 2 * x);
        const left = Math.max(0, Math.min(1, (rule.holdS + rule.fadeS - this.edgeLeanUsedS) / rule.fadeS));
        this.edgeLeanUsedS += deltaTime * near;
        this.edgeLeanShare = share * near * left;
        return rule.extra * this.edgeLeanShare;
    }

    // In a tunnel or gallery: the wall response handles the edge
    edgeBlocked(s) {
        const sample = this.environment.route.sample(s, this.edgeScratch || (this.edgeScratch = {}));
        return !!(sample.flags && (sample.flags.tunnel || sample.flags.gallery));
    }

    updateMesh() {
        this.group.position.copy(this.position);
        // The world's land is rough: the drawn bike bobs and rocks, more with speed (the physics is untouched). On the
        // drawn ground (groundPose) a bob only lifts it: down, the wheels went into the land
        const world = this.worldPhysics;
        this.landRock = 0;
        this.landBob = 0;
        const grounded = !!world && !this.roadworksSurface && this.standsOnGround();
        if (world && this.runoff && !this.crashed) {
            const d = this.distanceTraveled;
            const land = this.landValues();
            const rough = Math.min(1, this.speed / land.landCapSpeed);
            const bob = land.landBumpM * rough * Math.sin(d * 2.3) * Math.sin(d * 0.9 + 1);
            this.landBob = grounded ? Math.abs(bob) : bob;
            this.group.position.y += this.landBob;
            this.landRock = land.landWobbleDeg * Math.PI / 180 * rough * Math.sin(d * 1.7) * Math.sin(d * 0.6 + 2);
        }
        this.groundTilt = 0;
        // In a power slide the drawn bike heads into the turn past the way it travels
        this.group.rotation.y = this.yawAngle + this.slideAngle;
        this.meshNeedsBaseCapture = true;

        // Rider stands up over the jump and settles back on landing - an
        // eased blend rather than a pose snap
        if (this.riderBasePos) {
            const dt = this.currentDeltaTime || 1 / 60;
            // (and an off-road bike's rider stands on the pegs over the land, by the bike's trait)
            const pegs = world && this.runoff && this.offroad > 0 && !this.crashed && this.speed > world.landStandSpeed ? world.landStand * this.offroad : 0;
            const standTarget = (this.isJumping && !this.crashed) ? 1 : pegs;
            const standRate = standTarget > this.riderStandFactor ? 5.5 : 4;
            this.riderStandFactor += (standTarget - this.riderStandFactor) *
                Math.min(1, standRate * dt);

            const stand = this.riderStandFactor;
            this.rider.position.y = this.riderBasePos.y + stand * this.riderStandHeight;
            this.rider.position.z = this.riderBasePos.z - stand * 0.05;
            // Unbend from the riding posture toward upright, knees braced
            this.rider.rotation.x = this.riderBaseRotX - stand * 0.4;
        }
        
        // Rotate wheels and discs based on speed: the rear by its own radius,
        // the front by as much more as it is smaller
        if (!this.wheelRotation) this.wheelRotation = 0;
        const rear = this.axles.rear[2], front = this.axles.front[2];
        const rotationSpeed = this.speed / rear; // rad/s = v / r
        this.wheelRotation += rotationSpeed * (this.currentDeltaTime || 1/60);
        const frontRotation = front === rear ? this.wheelRotation : this.wheelRotation * rear / front;
        // In a power slide the rear tyre spins faster than the bike travels
        if (this.slideAngle !== 0) this.wheelSlip += rotationSpeed * this.worldPhysics.slideSpin * Math.abs(this.slideAngle) * (this.currentDeltaTime || 1/60);
        this.rearWheel.rotation.x = this.wheelRotation + this.wheelSlip;
        this.rearDisc.rotation.x = this.wheelRotation + this.wheelSlip;
        this.steerFront(frontRotation, this.shownBar(this.currentDeltaTime));
        if (!this.crashed) {
            if (this.fall || (this.riderFall && this.riderFall.on)) this.endFall();
        } else if (!(this.riderFall && this.riderFall.on)) {
            // Before the bike is drawn down: the rider leaves from where he sat in the last frame
            this.beginRiderFall();
        }

        if (this.crashed) {
            if (this.fallingOffCliff && !this.hitGround && this.tumbleSpeed > 0) {
                // Cartwheeling down the hillside
                this.group.rotation.x = this.tumbleAngle;
                this.group.rotation.z = this.tumbleRoll;
                this.leanRider(0);
                if (this.riderFall && this.riderFall.on) this.drawRiderFall();
                this.previousSpeed = this.speed;
                if (!this.meshBasePosition) {
                    this.meshBasePosition = new THREE.Vector3();
                }
                this.meshBasePosition.copy(this.group.position);
                return;
            }
            this.leanRider(0); // Rider doesn't lean when crashed
            if (this.fall && !this.fallingOffCliff) {
                this.drawFall();
            } else {
                // Fall over animation
                this.group.rotation.z = this.crashAngle > 0 ? Math.PI/2 : -Math.PI/2;
                this.group.rotation.x = 0;
                // Only adjust height if not falling off cliff
                if (!this.fallingOffCliff) {
                    // Adjust bike position so it sits properly on the ground when rotated
                    this.group.position.y = this.position.y + 0.3;
                }
            }
        } else if (this.isJumping) {
            // Jumping animation - forward rotation
            this.group.rotation.x = this.jumpRotation;
            this.group.rotation.z = this.leanAngle * 0.5; // Reduce lean while jumping
            this.leanRider(0.5);
        } else if (this.isWheelie) {
            if (grounded) {
                // On a world's ground the wheelie pitches over the ground's own pitch, about the rear axle where the
                // ground puts it (groundPose)
                this.group.rotation.z = this.groundPose(this.wheelieAngle) + this.leanAngle * 0.3;
            } else {
                // Wheelie animation - pivot around center of rear wheel
                // Rear wheel centre is at this.axles.rear in local space
                // Bike origin is at CG height (0.6m) above ground
            
                // Apply the rotation first
                this.group.rotation.x = -this.wheelieAngle; // Negative for wheelie (front up)
            
                // Calculate translation needed to keep rear wheel center fixed
                // Vector from bike origin to rear wheel center
                // Rear wheel center Y: 0.3 (above ground)
                // Bike origin Y: 0.6 (CG height above ground)
                // So offset from bike origin to wheel center: 0.3 - 0.6 = -0.3
            
                const angle = -this.wheelieAngle;
                const cosTheta = Math.cos(angle);
                const sinTheta = Math.sin(angle);
            
                // Original vector from origin to pivot point (rear wheel center)
                const pivotX = 0;
                const pivotY = this.axles.rear[0]; // Rear axle height: the model origin is on the ground, not at the CG
                const pivotZ = this.axles.rear[1]; // and how far behind the centre
            
                // After rotation, this vector becomes:
                const rotatedY = pivotY * cosTheta - pivotZ * sinTheta;
                const rotatedZ = pivotY * sinTheta + pivotZ * cosTheta;
            
                // Translation needed to keep pivot point fixed. The offset is in
                // bike-local axes; rotate it into world space by the heading
                // (applying it raw to world z shoved the bike sideways on any
                // non-axis-aligned heading)
                const localZOffset = pivotZ - rotatedZ;
                this.group.position.y = this.position.y + (pivotY - rotatedY);
                this.group.position.x = this.position.x + Math.sin(this.yawAngle) * localZOffset;
                this.group.position.z = this.position.z + Math.cos(this.yawAngle) * localZOffset;
            
                // Apply lean (reduced during wheelie)
                this.group.rotation.z = this.leanAngle * 0.3; // Reduce lean during wheelie
            }
            this.leanRider(0.5);
            
            // Simple visual feedback - bike gets brighter during wheelie,
            // brightening the character's own paint color
            const angleDegrees = this.wheelieAngle * 180 / Math.PI;
            const brightness = 1.0 + (angleDegrees / 90) * 0.5; // Brighter as angle increases
            this.frame.material.color.setRGB(
                Math.min(1, this.baseColorRGB.r * brightness),
                Math.min(1, this.baseColorRGB.g * brightness),
                Math.min(1, this.baseColorRGB.b * brightness)
            );
        } else {
            // Normal lean
            // The world pitches the bike to the road; a leg stays level
            // On a roadworks ramp the bike pitches to its slope; a knocked beacon or cone leaves a wobble (Roadworks.ride)
            // (and a bump against a rider of the crew: Traffic.touch)
            // On a world's drawn ground the bike stands on it (groundPose): pitched to the ground under its two wheels and
            // its lean measured from the ground's normal across it
            if (grounded) this.groundPose(0);
            else this.group.rotation.x = this.worldPhysics ? -Math.atan(this.worldGrade) - (this.roadworksSurface ? this.rampPitch || 0 : 0) : 0;
            this.group.rotation.z = this.worldPhysics ? this.groundTilt + this.leanAngle + (this.landRock || 0) + (this.roadworksWobble || 0) + (this.contactWobble || 0) : this.leanAngle;
            // The rider's body goes into the turn as that rider does (CHARACTERS bodyLean)
            this.leanRider(1);

            // Restore normal bike color
            if (!this.crashed) {
                this.frame.material.color.setHex(parseInt(this.bikeColor));
            }
        }


        // Brake light glow - light up when brake is pressed
        if (this.currentBrakeInput > 0) {
            this.brakeLight.material.emissive.setHex(0xff0000);
            this.brakeLight.material.emissiveIntensity = 1.0;
        } else {
            this.brakeLight.material.emissive.setHex(0x000000);
            this.brakeLight.material.emissiveIntensity = 0.0;
        }
        this.previousSpeed = this.speed;
        this.updateFooting();
        this.holdRider();

        // Base position for render interpolation offsets
        if (!this.meshBasePosition) {
            this.meshBasePosition = new THREE.Vector3();
        }
        this.meshBasePosition.copy(this.group.position);
    }

    // The handlebar angle the bike is drawn with (radians, the sign of steeringAngle), from the lean alone: nothing
    // in the physics reads it. A bike at speed is steered by the lean, and the bar does what a real one does
    // (Vehicle.BAR): while the bike rolls, the bar is pushed the other way (to roll left the rider pushes the bar to
    // the right), by `counter` for each rad/s of roll; at a held lean it sits a little into the turn, by the angle the
    // front wheel needs for that radius. Under `directSpeed` the bar turns the bike itself, so the drawn bar goes over
    // to the steering angle. A crashed bike keeps the bar it fell with
    shownBar(deltaTime) {
        const bar = Vehicle.barRule(), state = this.barState || (this.barState = { lean: this.leanAngle, rate: 0, shown: 0 });
        if (this.crashed) {
            state.held = true;
            return state.shown;
        }
        // A restart puts the bike upright at once: that is not a roll
        if (state.held) {
            state.held = false;
            state.lean = this.leanAngle;
            state.rate = 0;
        }
        if (deltaTime > 0) {
            const rate = (this.leanAngle - state.lean) / deltaTime;
            state.rate += (rate - state.rate) * (1 - Math.exp(-deltaTime / bar.lag));
        }
        state.lean = this.leanAngle;
        state.shown = Vehicle.barShown(this.leanAngle, state.rate, this.speed, this.steeringAngle, this.wheelbase);
        return state.shown;
    }

    // Vehicle.BAR and Vehicle.BODY as the tuning has them (js/tuning.js): the objects themselves with none
    static barRule() { return typeof Tuning === 'undefined' ? Vehicle.BAR : Tuning.view('bar', Vehicle.BAR); }
    static bodyRule() { return typeof Tuning === 'undefined' ? Vehicle.BODY : Tuning.view('body', Vehicle.BODY); }

    static barShown(lean, rate, speed, steer, wheelbase) {
        const bar = Vehicle.barRule();
        const x = Math.max(0, 1 - Math.max(0, speed) / bar.directSpeed);
        const direct = x * x * (3 - 2 * x);
        const counter = Math.max(-bar.counterMax, Math.min(bar.counterMax, bar.counter * rate));
        const v = Math.max(speed, bar.directSpeed / 2);
        const into = -Math.sign(lean) * Math.min(bar.intoMax, Math.atan(wheelbase * 9.81 * Math.tan(Math.min(Math.abs(lean), 1.2)) / (v * v)));
        return direct * steer * Vehicle.STEER_SHOWN + (1 - direct) * (counter + into);
    }

    // The front end that turns with the handlebar (the wheel, its disc, the fork legs and the bar) and the line it
    // turns about: the fork legs' line through the front axle (Vehicle.steerAxis). Each part's pose is kept as it is
    // now, the rest pose; steerFront turns them from it. Run again whenever those parts are replaced.
    rigSteering() {
        const [y, z] = this.axles.front;
        const spun = new Set([this.frontWheel, this.frontDisc]);
        this.steerRig = {
            point: new THREE.Vector3(0, y, z),
            axis: Vehicle.steerAxis(this.group, [this.leftFork, this.rightFork]),
            parts: [this.frontWheel, this.frontDisc, this.leftFork, this.rightFork, this.handlebar].filter(Boolean).map(part => ({
                part, spun: spun.has(part), position: part.position.clone(), quaternion: part.quaternion.clone()
            })),
            turn: new THREE.Quaternion(),
            spin: new THREE.Quaternion()
        };
    }

    // The front end turned by the steering about the steering axis, the wheel and its disc spun by `spin` about their
    // own axle inside that turn. Spun about the bike's x after the turn (an Euler x over a steer y), a steered wheel
    // wobbled on a cone and leaned off upright.
    steerFront(spin, bar = this.steeringAngle * Vehicle.STEER_SHOWN) {
        const rig = this.steerRig;
        const turn = rig.turn.setFromAxisAngle(rig.axis, bar);
        rig.spin.setFromAxisAngle(Vehicle.AXLE, spin);
        for (const { part, spun, position, quaternion } of rig.parts) {
            part.position.copy(position).sub(rig.point).applyQuaternion(turn).add(rig.point);
            part.quaternion.copy(turn);
            if (spun) part.quaternion.multiply(rig.spin);
            part.quaternion.multiply(quaternion);
        }
    }

    // How far the rider's body goes into a turn past the bike's own lean (Vehicle.BODY), by the rider's `bodyLean`
    // (CHARACTERS, 0 to 1): 0 sits in line with the bike at any lean, 1 hangs off, the shoulders and the head well
    // inside and the hips off the seat. `roll` is the rider's own roll (radians, the sign of the lean) and `shift` how
    // far the rider moves across the seat (m, in the bike's x). Drawn only: the physics reads none of it
    static riderLean(lean, bodyLean) {
        const body = Vehicle.bodyRule();
        const share = bodyLean === undefined ? body.usual : bodyLean;
        // A positive roll leans the bike to its right, which is -x
        return { roll: lean * body.roll * share, shift: -body.shift * share * Math.max(-1, Math.min(1, lean / body.full)) };
    }

    // The rider drawn leaned into the turn, by `share` of what this rider does (less in the air, none in a crash)
    leanRider(share) {
        const lean = Vehicle.riderLean(this.leanAngle * share, this.character && this.character.bodyLean);
        this.rider.rotation.z = lean.roll;
        this.rider.position.x = (this.riderBasePos ? this.riderBasePos.x : 0) + lean.shift;
    }

    // A lowside or a fall at walking pace, drawn as it happens (Vehicle.FALL). The crash itself, the slide of the
    // bike along the road and the restart are the physics', unchanged: this is only how the bike and the rider are
    // drawn from the moment the crash is called. The bike goes down from the lean it had to its side over `downS`
    // (`tipS` at walking pace), slowly at first as a falling thing does. While it slides its rear comes round, so it
    // turns into the bend by `spin` rad for each metre slid, at most `spinMax`. The rider comes off by the kind of the
    // crash (Vehicle.beginRiderFall)
    stepFall(deltaTime) {
        const f = Vehicle.FALL, fall = this.fall;
        const side = this.crashAngle > 0 ? 1 : -1;
        fall.t += deltaTime;
        const x = Math.min(1, fall.t / (fall.kind === 'tip' ? f.tipS : f.downS));
        fall.down = x * x;
        // The bend turns the bike against the sign of its lean, and the rear steps out to the outside of it
        fall.yaw = Math.max(-f.spinMax, Math.min(f.spinMax, fall.yaw - side * f.spin * this.speed * deltaTime));
    }

    // The bike drawn as the fall stands now (stepFall moves it on with the physics' own time, so it plays at one pace
    // however often the bike is drawn)
    drawFall() {
        const fall = this.fall, down = fall.down;
        const side = this.crashAngle > 0 ? 1 : -1;
        const roll = fall.from + (side * Math.PI / 2 - fall.from) * down;
        this.group.rotation.set(this.group.rotation.x * (1 - down), fall.heading + fall.yaw, roll);
        // On its side the bike lies on its tyres' edges and its bar end, 0.3 m over its upright origin
        this.group.position.y = this.position.y + 0.3 * down;
    }

    // Riding again after a crash: the rider is back on the seat in the riding pose, every limb as it was built
    endFall() {
        this.fall = null;
        if (this.riderFall) this.riderFall.on = false;
        if (this.riderBlock) this.riderBlock.on = false;
        if (this.riderHit) this.riderHit.on = false;
        if (this.rider && this.riderBasePos) {
            this.rider.position.copy(this.riderBasePos);
            this.rider.rotation.set(this.riderBaseRotX || 0, 0, 0);
        }
        for (const limbs of [this.arms, this.legs]) for (const side of [-1, 1]) if (limbs && limbs[side]) limbs[side].rest();
        if (this.steerRig) this.steerRig.held = false;
        this.footPlaced = false;
    }

    // What the rider who comes off must stop against, beside the walls and the buildings: the thing the bike hit, as
    // a circle on the ground (a car, a rock, a roadworks machine). Whoever raises the crash names it. With no hitFrom,
    // the line from its middle to the bike is the face he meets
    blockRider(x, z, radius) {
        const block = this.riderBlock || (this.riderBlock = { on: false, x: 0, z: 0, r: 0 });
        block.on = true;
        block.x = x;
        block.z = z;
        block.r = radius;
    }

    // The face the bike hit: its normal (nx, nz), out of the thing toward the bike, and the thing's own velocity (vx,
    // vz m/s; a wall stands). Whoever raises the crash names it where it is known; the rider's fall reads from it how
    // fast and how square he went into it (Vehicle.riderCrash)
    hitFrom(nx, nz, vx = 0, vz = 0) {
        const hit = this.riderHit || (this.riderHit = { on: false, nx: 0, nz: 0, vx: 0, vz: 0 });
        const length = Math.hypot(nx, nz);
        if (!(length > 0)) return;
        hit.on = true;
        hit.nx = nx / length;
        hit.nz = nz / length;
        hit.vx = vx;
        hit.vz = vz;
    }

    // The crash's own numbers, into `out`, as the rider's fall reads them (Vehicle.RIDER_FALLS `when`,
    // riderFallNumbers): the speed and the heading he rode in with, the lean in degrees, the closing speed into what
    // was hit and the share of the heading that went into it (from hitFrom, else from the circle of blockRider, else
    // head-on), and the land round the bike: its fall away toward the low side (`low`: the limbs' x sign of that side)
    // and toward the high side, and its grade along the way
    riderCrash(out, speed, heading, low) {
        const rule = Vehicle.RIDER_FALL;
        const sin = Math.sin(heading), cos = Math.cos(heading);
        out.speed = speed;
        out.lean = Math.abs(this.leanAngle || 0) * 180 / Math.PI;
        const hit = this.riderHit, block = this.riderBlock;
        out.hit = false;
        let ovx = 0, ovz = 0;
        if (hit && hit.on) {
            out.hit = true;
            out.nx = hit.nx;
            out.nz = hit.nz;
            ovx = hit.vx;
            ovz = hit.vz;
        } else if (block && block.on) {
            const dx = this.position.x - block.x, dz = this.position.z - block.z, gap = Math.hypot(dx, dz);
            out.hit = true;
            out.nx = gap > 1e-6 ? dx / gap : -sin;
            out.nz = gap > 1e-6 ? dz / gap : -cos;
        }
        out.closing = out.hit ? -((speed * sin - ovx) * out.nx + (speed * cos - ovz) * out.nz) : speed;
        out.into = out.hit ? Math.max(0, -(sin * out.nx + cos * out.nz)) : 1;
        // (the low side is the limbs' x side: x of the bike's left is cos, -sin of the heading)
        const lx = cos * low, lz = -sin * low, x = this.position.x, z = this.position.z;
        const fallAway = (side) => (this.riderGroundY(x + side * lx * rule.bankNearM, z + side * lz * rule.bankNearM)
            - this.riderGroundY(x + side * lx * rule.bankFarM, z + side * lz * rule.bankFarM)) / (rule.bankFarM - rule.bankNearM);
        out.bank = fallAway(1);
        out.highBank = fallAway(-1);
        out.grade = (this.riderGroundY(x + sin * rule.gradeM, z + cos * rule.gradeM) - this.riderGroundY(x - sin * rule.gradeM, z - cos * rule.gradeM)) / (2 * rule.gradeM);
        return out;
    }

    // The rider comes off the bike. The kind of the fall is the cause's (Vehicle.CRASH_CAUSES by this.crashWhy), and
    // its row the first variant of that kind that the crash's numbers fit (Vehicle.riderFallRow by riderCrash). The
    // row's numbers are blended with its calm row's (the tip-over) by the speed (Vehicle.riderFallNumbers). He starts
    // where he sat, in the pose he rode in, with `along` m/s of the bike's way, `out` to the low side and `lift`
    // upward; against what was hit he loses `stop` of his speed into it and goes `away` off it. From here he has his
    // own place and velocity (stepRiderFall) and his limbs go through the keys (drawRiderFall). Every number comes
    // from the crash itself, so the same crash is the same fall
    beginRiderFall() {
        const rider = this.rider;
        if (!rider || !this.riderBasePos || !this.arms || !this.legs) return;
        const rf = this.riderFall || (this.riderFall = Vehicle.riderFallState());
        const speed = Math.abs(Number.isFinite(this.rodeSpeed) ? this.rodeSpeed : this.speed) || 0;
        const heading = Number.isFinite(this.rodeYaw) ? this.rodeYaw : this.yawAngle;
        const kind = Vehicle.riderFallKind(this.crashWhy);
        rf.on = true;
        rf.kind = kind;
        rf.t = 0;
        rf.up = 0;
        rf.slid = 0;
        rf.toppled = 0;
        rf.speed = speed;
        rf.heading = heading;
        // The limbs' x sign on the side the bike went down to (a positive roll is to the right, which is -x)
        rf.low = this.crashAngle > 0 ? -1 : 1;
        rf.index = this.currentRoadSegment || 0;
        const crash = this.riderCrash(rf.crash, speed, heading, rf.low);
        rf.row = Vehicle.riderFallRow(kind, crash);
        rf.rule = Vehicle.RIDER_FALLS[rf.row];
        rf.calmRule = rf.rule.calm ? Vehicle.RIDER_FALLS[Vehicle.riderFallRow(rf.rule.calm, crash)] : null;
        const fall = Vehicle.riderFallNumbers(rf.rule, rf.calmRule, crash, rf.fall);
        rf.T = fall.T;
        rf.lean = (this.riderSpec && this.riderSpec.torsoLean || 0) + (this.riderBaseRotX || 0);
        this.group.updateMatrixWorld(true);
        rider.getWorldPosition(rf.p);
        rider.getWorldQuaternion(rf.q0);
        rf.q.copy(rf.q0);
        let i = 0;
        for (const limbs of [this.arms, this.legs]) for (const side of [-1, 1]) rf.from[i++].copy(limbs[side].at());
        rf.p.y += this.riderProbes(rf.q0);
        rf.seat.subVectors(rf.p, this.position);
        const sin = Math.sin(heading), cos = Math.cos(heading);
        rf.lowX = cos * rf.low;
        rf.lowZ = -sin * rf.low;
        rf.v.set(sin * fall.along + rf.lowX * fall.out, fall.lift, cos * fall.along + rf.lowZ * fall.out);
        if (crash.hit) {
            const into = rf.v.x * crash.nx + rf.v.z * crash.nz;
            const lose = into < 0 ? into * fall.stop : 0;
            rf.v.x += crash.nx * (fall.away - lose);
            rf.v.z += crash.nz * (fall.away - lose);
        }
        rf.ground = this.riderGroundY(rf.p.x, rf.p.z);
        rf.grounded = true;
    }

    // One step of the rider's own fall, on the physics' time. Gravity, then the ground under him; on the ground the
    // slope pulls him downhill (RIDER_FALL slopeGrade, slopeMost) and the slide loses `drag` of its speed and `scrub`
    // m/s each second, so a faster crash slides further. Over the keys his middle goes `topple` m to the low side. He
    // never goes into a wall or a parapet (the bike's own zones, bodyM from his middle), a drawn building
    // or the thing the bike hit (blockRider): he is put back to its face and loses the speed into it. A row
    // `withBike` (a drop, water) has no slide of its own: he goes from the seat to `off` beside the bike wherever it
    // falls
    stepRiderFall(deltaTime) {
        const rf = this.riderFall, k = rf.rule, fall = rf.fall, rule = Vehicle.RIDER_FALL, p = rf.p, v = rf.v;
        rf.t += deltaTime;
        const x = Math.min(1, rf.t / rf.T), e = x * x * (3 - 2 * x);
        if (k.withBike) {
            const sin = Math.sin(rf.heading), cos = Math.cos(rf.heading);
            const side = k.off[0] * rf.low * e, back = k.off[2] * e, seat = 1 - e;
            const fromX = p.x, fromZ = p.z;
            p.set(this.position.x + rf.seat.x * seat + cos * side + sin * back, this.position.y + rf.seat.y * seat + k.off[1] * e,
                this.position.z + rf.seat.z * seat - sin * side + cos * back);
            v.copy(this.velocity);
            // (he is on the bike's piece of the road, wherever the bike is put)
            rf.index = this.currentRoadSegment || 0;
            this.holdRiderOut(fromX, fromZ, deltaTime);
            rf.grounded = false;
            return;
        }
        v.y -= rule.gravity * deltaTime;
        if (rf.grounded) {
            // Downhill by the ground's gradient where he is, at most slopeMost. A gradient over slopeGrade is an edge or
            // a step, not a slope: it pulls nobody over
            const reach = 0.5, ground = rf.ground;
            const gx = (this.riderGroundY(p.x + reach, p.z) - ground) / reach, gz = (this.riderGroundY(p.x, p.z + reach) - ground) / reach;
            const steep = Math.hypot(gx, gz);
            if (steep > 0 && steep <= rule.slopeGrade) {
                const pull = Math.min(rule.slopeMost, rule.gravity * steep / Math.sqrt(1 + steep * steep)) / steep;
                v.x -= gx * pull * deltaTime;
                v.z -= gz * pull * deltaTime;
            }
            const pace = Math.hypot(v.x, v.z);
            if (pace > 0) {
                const left = Math.max(0, pace - (fall.drag * pace + fall.scrub) * deltaTime) / pace;
                v.x *= left;
                v.z *= left;
            }
        }
        const fromX = p.x, fromZ = p.z;
        const topple = (e - rf.toppled) * fall.topple;
        rf.toppled = e;
        p.x += v.x * deltaTime + rf.lowX * topple;
        p.z += v.z * deltaTime + rf.lowZ * topple;
        this.holdRiderOut(fromX, fromZ, deltaTime);
        p.y += v.y * deltaTime;
        const ground = this.riderGroundY(p.x, p.z);
        rf.ground = ground;
        if (p.y <= ground) {
            p.y = ground;
            v.y = v.y < -rule.bounceFrom ? -v.y * fall.bounce : 0;
            rf.grounded = true;
        } else {
            rf.grounded = p.y - ground < rule.touchM;
        }
        rf.slid += Math.hypot(p.x - fromX, p.z - fromZ);
        // Lying still, he sits up (the row's `sit` key) when there is time
        if (rf.t > rf.T && rf.grounded && Math.hypot(v.x, v.z) < rule.stillSpeed) rf.up = Math.min(1, rf.up + deltaTime / rule.upS);
    }

    // The rider kept out of what is solid, after a step from (fromX, fromZ). A wall is the bike's own zone
    // (checkWallCollision), read `bodyM` nearer the wall than his middle: he is moved back toward its face, no faster
    // than pushSpeed (he may start against it, on a bike that hit it), and loses the speed into it. A building stops
    // him where he was. The thing the bike hit pushes him out of its circle
    holdRiderOut(fromX, fromZ, deltaTime) {
        const rf = this.riderFall, rule = Vehicle.RIDER_FALL, p = rf.p, v = rf.v;
        const environment = this.environment;
        const block = this.riderBlock;
        // The most he is moved out in a step: as far as he came in, and pushSpeed more
        const reach = Math.hypot(p.x - fromX, p.z - fromZ) + rule.pushSpeed * deltaTime;
        if (block && block.on) {
            const dx = p.x - block.x, dz = p.z - block.z, gap = Math.hypot(dx, dz), clear = block.r + rule.bodyM;
            if (gap < clear) {
                const nx = gap > 1e-6 ? dx / gap : -Math.sin(rf.heading), nz = gap > 1e-6 ? dz / gap : -Math.cos(rf.heading);
                const push = Math.min(clear - gap, reach);
                p.x += nx * push;
                p.z += nz * push;
                const into = -(v.x * nx + v.z * nz);
                if (into > 0) { v.x += nx * into; v.z += nz * into; }
            }
        }
        if (!environment || !environment.route || !environment.ground || environment.route.unitCount === 0) return;
        const scenery = environment.scenery;
        if (scenery && typeof scenery.houseAt === 'function' && scenery.houseAt(p.x, p.z, rule.bodyM)) {
            p.x = fromX;
            p.z = fromZ;
            v.x = 0;
            v.z = 0;
        }
        const projection = this.riderProject(p.x, p.z);
        if (!(projection.index >= 0)) return;
        const sign = projection.lateral < 0 ? -1 : 1;
        const located = rf.located;
        located.index = projection.index;
        located.t = projection.along;
        located.lateral = projection.lateral + sign * rule.bodyM;
        let zone = environment.ground.zoneAt(located, projection.width / 2);
        if (this.worldPhysics) zone = this.worldZone(zone, located, projection.y);
        if (zone.kind !== 'wall') return;
        const perpX = Math.cos(projection.heading), perpZ = -Math.sin(projection.heading);
        const deep = Math.abs(located.lateral) - zone.start;
        // A wall whose zone begins where he is, or one he is deep in at once, is one he did not slide up to (the next
        // row's zone, which begins far behind him): he stays where he was, against it
        if (deep <= 0 || deep > rule.bodyM + reach) {
            p.x = fromX;
            p.z = fromZ;
            v.x = 0;
            v.z = 0;
            return;
        }
        const push = Math.min(deep, reach);
        p.x -= sign * perpX * push;
        p.z -= sign * perpZ * push;
        const outward = (v.x * perpX + v.z * perpZ) * sign;
        if (outward > 0) {
            v.x -= outward * perpX * sign;
            v.z -= outward * perpZ * sign;
        }
    }

    // Where the rider is against the road: the nearest piece of it within nearUnits of the piece he was on last. He
    // moves less than a metre a step, so this never loses him, and it keeps him on his own strand where a stack of
    // hairpins has another strand nearer (the bike's wider search goes over to it, and its road is metres up or
    // down: he would step that far in a frame)
    riderProject(x, z) {
        const rf = this.riderFall, route = this.environment.route, near = Vehicle.RIDER_FALL.nearUnits;
        const out = rf.projection;
        if (typeof route.nearestSegment === 'function' && route.points && route.points.length > 1) {
            const last = route.points.length - 2;
            route.nearestSegment(x, z, Math.max(0, Math.min(last, rf.index - near)), Math.max(0, Math.min(last, rf.index + near)), out);
        } else {
            rf.hint.index = rf.index;
            route.project(x, z, rf.hint, out);
        }
        if (out.index >= 0) rf.index = out.index;
        return out;
    }

    // The ground under the rider at (x, z): the bike's own (surfaceAt: the road's height on the road, its verge and
    // against a wall, the land on the run-off), and past the edge of a drop the land he falls to, as the falling bike
    // has it (getTerrainHeightAt). A ride with no ground has the plane the bike is on
    riderGroundY(x, z) {
        const environment = this.environment;
        if (!environment || !environment.route || !environment.ground || environment.route.unitCount === 0) return this.position.y;
        const rf = this.riderFall, ground = environment.ground;
        // (on his own strand of the road: riderProject)
        rf.range.start = Math.max(0, rf.index - Vehicle.RIDER_FALL.nearUnits);
        rf.range.end = rf.index + Vehicle.RIDER_FALL.nearUnits;
        const loc = ground.locate(x, z, rf.range, rf.loc);
        if (!loc) return this.position.y;
        let zone = ground.zoneAt(loc, ground.halfRoad(loc));
        if (this.worldPhysics) zone = this.worldZone(zone, loc);
        if (zone.kind === 'runoff') return ground.heightAt(loc, false);
        if (zone.kind === 'fall') return Math.max(ground.heightAt(loc, false), ground.restY(loc));
        return loc.roadY;
    }

    // The points of the rider's body that may touch the ground, as he is posed now and turned by `q` (his turn in
    // the world): the head, the chest, the pelvis, and each limb's middle joint and end. Fills riderFall.probe with
    // each point from his origin, in the world's axes, and returns how far under his origin the lowest one reaches
    riderProbes(q) {
        const rf = this.riderFall, rule = Vehicle.RIDER_FALL, probe = rf.probe, radius = rf.radius;
        const helmet = this.helmet;
        const sin = Math.sin(rf.lean), cos = Math.cos(rf.lean);
        if (helmet) probe[0].copy(helmet.parent === this.rider ? helmet.position : helmet.parent.position);
        else probe[0].set(0, cos * 0.4, sin * 0.4);
        radius[0] = rule.headM;
        probe[1].set(0, cos * rule.torsoHalfM, sin * rule.torsoHalfM);
        probe[2].set(0, -cos * rule.torsoHalfM, -sin * rule.torsoHalfM);
        radius[1] = radius[2] = rule.torsoM;
        let i = 3;
        for (const limbs of [this.arms, this.legs]) {
            for (const side of [-1, 1]) {
                const limb = limbs[side];
                probe[i].copy(limb.mid());
                radius[i++] = rule.limbM;
                probe[i].copy(limb.at());
                radius[i++] = Math.max(rule.limbM, limb.drop || 0);
            }
        }
        let low = Infinity;
        for (let n = 0; n < probe.length; n++) low = Math.min(low, probe[n].applyQuaternion(q).y - radius[n]);
        return low;
    }

    // The rider drawn as his fall stands now. The pose is the row's keys (Vehicle.RIDER_FALLS `keys`) at the share
    // of the fall's time gone (Vehicle.riderKeyed), and as much of the calm row's as the speed gives it
    // (riderFallNumbers `calm`), angle by angle: from the pose he rode in to the first key, then key to key, then from
    // the last key to the `sit` key as he sits up. The body's turn is four angles and each limb's end is three
    // (Vehicle.riderPose). Then he is set on the ground: his lowest point (riderProbes) rests at his own height
    // (stepRiderFall), and no point of him is under the ground there
    drawRiderFall() {
        const rf = this.riderFall, rider = this.rider, pose = rf.pose;
        const u = Math.min(1, rf.t / rf.T), calm = rf.fall.calm;
        // `e` is how far he is from the pose he rode in toward the keys: under 1 until the first key
        let e = Vehicle.riderKeyed(rf.rule, u, rf.up, pose);
        if (calm > 0 && rf.calmRule) {
            const other = rf.calmPose, from = Vehicle.riderKeyed(rf.calmRule, u, rf.up, other);
            for (let i = 0; i < 16; i++) pose[i] += (other[i] - pose[i]) * calm;
            e += (from - e) * calm;
        }
        // The body's turn: about the world's up by the heading, then the roll, the pitch and the twist about the spine
        const low = rf.low, lean = rf.lean, d = Math.PI / 180;
        rf.q.setFromEuler(rf.euler.set(0, rf.heading + low * pose[3] * d, 0));
        rf.q.multiply(rf.turn.setFromEuler(rf.euler.set(0, 0, -low * pose[1] * d)));
        rf.q.multiply(rf.turn.setFromEuler(rf.euler.set(pose[0] * d, 0, 0)));
        rf.q.multiply(rf.turn.setFromEuler(rf.euler.set(0, low * pose[2] * d, 0)));
        // (the riding lean is in the rider's own shape: his spine is `lean` forward of his y axis)
        rf.q.multiply(rf.turn.setFromEuler(rf.euler.set(-lean, 0, 0)));
        if (e < 1) rf.q.slerpQuaternions(rf.q0, rf.turn.copy(rf.q), e);
        const sin = Math.sin(lean), cos = Math.cos(lean);
        let i = 0;
        for (const limbs of [this.arms, this.legs]) {
            for (const side of [-1, 1]) {
                const limb = limbs[side], end = rf.end[i];
                // The low side's limb reads the first triple of its pair
                const at = 4 + (i < 2 ? 0 : 6) + (side === low ? 0 : 3);
                const swing = pose[at] * d, spread = pose[at + 1] * d, reach = limb.reach * (1 - Vehicle.RIDER_FALL.bend * pose[at + 2]);
                const bx = side * Math.sin(spread), by = -Math.cos(spread) * Math.cos(swing), bz = Math.cos(spread) * Math.sin(swing);
                end.set(limb.root.x + bx * reach, limb.root.y + (by * cos - bz * sin) * reach, limb.root.z + (by * sin + bz * cos) * reach);
                if (e < 1) end.lerpVectors(rf.from[i], end, e);
                limb.place(end, null);
                i++;
            }
        }
        const lowest = this.riderProbes(rf.q);
        const p = rf.p;
        let y = p.y - lowest;
        for (let m = 0; m < rf.probe.length; m++) {
            const o = rf.probe[m];
            y = Math.max(y, this.riderGroundY(p.x + o.x, p.z + o.z) + rf.radius[m] - o.y);
        }
        rf.at.set(p.x, y, p.z);
        this.group.updateMatrixWorld(true);
        rider.position.copy(this.group.worldToLocal(rf.at));
        rider.quaternion.copy(this.group.getWorldQuaternion(rf.turn).invert().multiply(rf.q));
    }

    // The hands stay on the grips and the feet on the pegs while the bar turns and the rider leans across the bike:
    // each limb's end goes to where it is with the rider in line with the bike (and the hand then round with the
    // bar), in the rider's axes as the rider is drawn now. A rider who stands over a jump takes the limbs up as before
    holdRider() {
        const rig = this.steerRig, rider = this.rider, arms = this.arms, legs = this.legs;
        if (!rig || !rider || (!arms && !legs)) return;
        // A rider who has come off holds nothing: the fall poses every limb (Vehicle.drawRiderFall)
        if (this.riderFall && this.riderFall.on) {
            rig.held = false;
            this.drawRiderFall();
            return;
        }
        const leaned = rider.rotation.z !== 0 || rider.position.x !== (this.riderBasePos ? this.riderBasePos.x : 0);
        const turned = rig.turn.w !== 1;
        if (!leaned && !turned && !rig.held) return;
        rig.held = leaned || turned;
        const hold = rig.hold || (rig.hold = {
            plain: new THREE.Matrix4(), inverse: new THREE.Matrix4(), q: new THREE.Quaternion(), into: new THREE.Quaternion(),
            end: new THREE.Quaternion(), euler: new THREE.Euler(), at: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), to: new THREE.Vector3()
        });
        hold.q.setFromEuler(hold.euler.set(rider.rotation.x, 0, 0));
        hold.at.set(this.riderBasePos ? this.riderBasePos.x : 0, rider.position.y, rider.position.z);
        hold.plain.compose(hold.at, hold.q, hold.one);
        rider.updateMatrix();
        hold.inverse.copy(rider.matrix).invert();
        hold.into.copy(rider.quaternion).invert();
        for (const side of [-1, 1]) {
            const arm = arms && arms[side];
            if (arm) {
                hold.to.copy(arm.end).applyMatrix4(hold.plain).sub(rig.point).applyQuaternion(rig.turn).add(rig.point).applyMatrix4(hold.inverse);
                arm.place(hold.to.clone(), hold.end.copy(hold.into).multiply(rig.turn).multiply(hold.q));
            }
            // The left foot at a stop is on the ground (updateFooting)
            const leg = legs && legs[side];
            if (leg && !(this.footPlaced && side === Vehicle.LEFT)) {
                hold.to.copy(leg.end).applyMatrix4(hold.plain).applyMatrix4(hold.inverse);
                leg.place(hold.to.clone(), hold.end.copy(hold.into).multiply(hold.q));
            }
        }
    }

    // Whether the bike is drawn on a world's drawn ground (groundPose): a world's ground that reads it, and a route
    standsOnGround() {
        const environment = this.environment;
        return !!(environment && environment.ground && typeof environment.ground.drawnY === 'function' && environment.route && environment.route.unitCount > 0);
    }

    // The drawn ground at (x, z) (WorldGround.drawnY), located within Vehicle.GROUND.segments of the bike's own segment
    // so a stack of hairpins reads the bike's own strand. Nothing is allocated
    drawnGroundY(x, z) {
        const scratch = this.groundScratch || (this.groundScratch = { pitch: 0, hint: { start: 0, end: 0 }, loc: {} });
        const reach = Vehicle.GROUND.segments, last = this.environment.route.unitCount - 1;
        scratch.hint.start = Math.max(0, this.currentRoadSegment - reach);
        scratch.hint.end = Math.min(last, this.currentRoadSegment + reach);
        const ground = this.environment.ground;
        ground.locate(x, z, scratch.hint, scratch.loc);
        const y = ground.drawnY(scratch.loc);
        return Number.isFinite(y) ? y : this.position.y;
    }

    // The drawn bike stands on the world's drawn ground (Vehicle.GROUND; .agent/system/handling.md, "The bike stands on
    // the ground"): both tyres' contact points on the ground at their own places, the bike pitched to the line between
    // them, and `extra` (a wheelie) more about the rear axle where that puts it. Sets the group's pitch and height and
    // returns the ground's tilt across the bike (radians, a positive one higher on its left), which the lean is drawn
    // over (groundTilt). The contacts are read where the last frame's pitch put them; a frame's change of pitch moves
    // them by millimetres
    groundPose(extra = 0) {
        const group = this.group;
        const scratch = this.groundScratch || (this.groundScratch = { pitch: 0, hint: { start: 0, end: 0 }, loc: {} });
        const rear = this.axles.rear, front = this.axles.front;
        const ry = rear[0], rz = rear[1], fz = front[1];
        // Each contact point in the bike's axes: under its axle, by its own wheel's radius
        const yr = ry - rear[2], yf = front[0] - front[2];
        const was = scratch.pitch, ws = Math.sin(was), wc = Math.cos(was);
        const hr = rz * wc - yr * ws, hf = fz * wc - yf * ws;
        const sin = Math.sin(group.rotation.y), cos = Math.cos(group.rotation.y);
        const x = group.position.x, z = group.position.z;
        const hm = (hr + hf) / 2, mx = x + sin * hm, mz = z + cos * hm;
        const steep = Vehicle.GROUND.steepMost;
        let gr = this.drawnGroundY(x + sin * hr, z + cos * hr), gf = this.drawnGroundY(x + sin * hf, z + cos * hf);
        const gm = this.drawnGroundY(mx, mz);
        // A contact that reads the ground steeper than steepMost from the middle is against a face (a wall, a parapet,
        // the rock beside a tunnel, the lip of a drop), not under the tyre: the line goes on from the middle instead
        const rearOn = Math.abs(gm - gr) <= steep * (hm - hr), frontOn = Math.abs(gf - gm) <= steep * (hf - hm);
        const rise = rearOn && frontOn ? (gf - gr) / (hf - hr) : rearOn ? (gm - gr) / (hm - hr) : frontOn ? (gf - gm) / (hf - hm) : 0;
        if (!rearOn) gr = gm - rise * (hm - hr);
        if (!frontOn) gf = gm + rise * (hf - hm);
        const pitch = Math.atan(rise) - Math.atan2(yf - yr, fz - rz);
        scratch.pitch = pitch;
        // Across: either side of the middle, square to the heading (+x is the bike's left), by the same rule
        const w = Vehicle.GROUND.acrossM;
        const left = this.drawnGroundY(mx + cos * w, mz - sin * w), right = this.drawnGroundY(mx - cos * w, mz + sin * w);
        const leftOn = Math.abs(left - gm) <= steep * w, rightOn = Math.abs(gm - right) <= steep * w;
        const across = leftOn && rightOn ? (left - right) / (2 * w) : leftOn ? (left - gm) / w : rightOn ? (gm - right) / w : 0;
        // The roll that lays the bike's across axis in the ground's plane, pitched as it is
        this.groundTilt = Math.atan(across * Math.cos(pitch));
        const s = Math.sin(pitch), k = Math.cos(pitch);
        let y = gr - (yr * k + rz * s), shift = 0;
        if (extra) {
            const a = pitch + extra, sa = Math.sin(a), ka = Math.cos(a);
            const axleY = y + ry * k + rz * s, axleAlong = rz * k - ry * s;
            y = axleY - (ry * ka + rz * sa);
            shift = axleAlong - (rz * ka - ry * sa);
        }
        group.rotation.x = -(pitch + extra);
        group.position.set(x + sin * shift, y + this.landBob, z + cos * shift);
        return this.groundTilt;
    }

    // The ground the rider's foot comes down on at (x, z): a world's drawn ground, else the ride's own ground, or the
    // plane the bike stands on
    footGroundY(x, z) {
        if (this.worldPhysics && this.standsOnGround()) return this.drawnGroundY(x, z);
        return this.environment && this.environment.ground ? this.surfaceAt(x, z) : this.position.y;
    }

    // At a stop the bike leans a little to its left and the rider puts the left foot down on the ground, over
    // Vehicle.FOOT_S; moving off, the foot goes back to the peg and the bike comes upright. Only the drawing does this:
    // the physics lean stays as it is (the world's fall-over rule reads it). A stop is the world's foot-down state
    // (Vehicle.updateWorldSpeed) or any speed under STOP_SPEED, upright and on the ground.
    updateFooting() {
        const dt = this.currentDeltaTime || 1 / 60;
        const stopped = !this.crashed && !this.isJumping && !this.isWheelie && (this.footDown || this.speed < Vehicle.STOP_SPEED);
        this.footT = Math.max(0, Math.min(1, (this.footT || 0) + (stopped ? dt : -dt) / Vehicle.FOOT_S));
        const t = this.footT;
        const ease = t * t * (3 - 2 * t);
        const leg = this.legs && this.legs[Vehicle.LEFT];
        if (ease === 0) {
            if (this.footPlaced && leg) leg.place(leg.end, null);
            this.footPlaced = false;
            return;
        }
        if (this.crashed || this.isJumping || this.isWheelie) return;
        // A positive roll leans the bike to its right
        this.group.rotation.z -= Vehicle.LEFT * Vehicle.FOOT_LEAN * ease;
        if (!leg) return;
        this.group.updateMatrixWorld(true);
        const rider = this.rider;
        const scratch = this.footScratch || (this.footScratch = {
            ground: new THREE.Vector3(), up: new THREE.Vector3(), q: new THREE.Quaternion(), level: new THREE.Quaternion(),
            euler: new THREE.Euler(0, 0, 0, 'YXZ'), boot: new THREE.Quaternion()
        });
        // The foot comes down out to the rider's side, a little ahead of the peg, on the ground there
        const sin = Math.sin(this.group.rotation.y), cos = Math.cos(this.group.rotation.y);
        const out = Vehicle.LEFT * Vehicle.FOOT_OUT, ahead = rider.position.z + leg.end.z + Vehicle.FOOT_AHEAD;
        const gx = this.group.position.x + cos * out + sin * ahead;
        const gz = this.group.position.z - sin * out + cos * ahead;
        const world = this.worldPhysics && this.standsOnGround();
        let groundY = this.footGroundY(gx, gz);
        // On a world, ground read steeper than steepMost from the bike's own is a face beside it (a wall, a parapet):
        // the foot comes down on the bike's ground plane there instead
        const base = this.group.position.y - (this.landBob || 0);
        const face = world && Math.abs(groundY - base) > Vehicle.GROUND.steepMost * Math.hypot(out, ahead);
        if (face) groundY = base + Math.tan(this.groundTilt || 0) * out - Math.tan(this.group.rotation.x) * ahead;
        scratch.ground.set(gx, groundY, gz);
        rider.worldToLocal(scratch.ground);
        // World up and the ground's own level, in the rider's axes: the sole sits flat on the ground. On a world's drawn
        // ground the level is the ground's own at the foot (Vehicle.GROUND footM ahead of it and beside it), and the
        // ankle stands off the ground along its normal
        rider.getWorldQuaternion(scratch.q).invert();
        if (face) {
            scratch.euler.set(this.group.rotation.x, this.group.rotation.y, this.groundTilt || 0);
        } else if (world) {
            const m = Vehicle.GROUND.footM;
            const along = Math.atan((this.footGroundY(gx + sin * m, gz + cos * m) - groundY) / m);
            const across = (this.footGroundY(gx + cos * m, gz - sin * m) - groundY) / m;
            scratch.euler.set(-along, this.group.rotation.y, Math.atan(across * Math.cos(along)));
        } else {
            scratch.euler.set(this.group.rotation.x, this.group.rotation.y, 0);
        }
        scratch.level.setFromEuler(scratch.euler);
        scratch.up.set(0, 1, 0);
        if (world) scratch.up.applyQuaternion(scratch.level);
        scratch.up.applyQuaternion(scratch.q);
        scratch.level.premultiply(scratch.q);
        const ankle = scratch.ground.addScaledVector(scratch.up, leg.drop);
        ankle.lerpVectors(leg.end, ankle, ease);
        const turn = scratch.boot.identity().slerp(scratch.level, ease);
        const at = scratch.ankle || (scratch.ankle = new THREE.Vector3());
        leg.place(at.copy(ankle), turn);
        // No corner of the boot or its sole goes under the ground's plane at the foot: the ankle rises along the
        // normal by as much as the deepest one is under it (the boot's rest pose is not square to the sole)
        if (world && leg.ends) {
            const lift = this.footUnder(leg.ends, gx, groundY, gz, scratch);
            if (lift > 0) leg.place(at.addScaledVector(scratch.up, lift), turn);
        }
        this.footPlaced = true;
    }

    // How far the deepest corner of `objects` (the boot and its sole, children of the rider, as placed) is under the plane
    // through (x, y, z) square to the foot's ground normal (scratch.level's up, in the world): metres along the normal,
    // 0 or less where none is under. Nothing is allocated
    footUnder(objects, x, y, z, scratch) {
        const rider = this.rider;
        const n = scratch.normal || (scratch.normal = new THREE.Vector3());
        const corner = scratch.corner || (scratch.corner = new THREE.Vector3());
        const m = scratch.matrix || (scratch.matrix = new THREE.Matrix4());
        n.set(0, 1, 0).applyQuaternion(scratch.level).applyQuaternion(rider.getWorldQuaternion(scratch.q));
        let deepest = -Infinity;
        for (const object of objects) {
            const geometry = object.geometry;
            if (!geometry) continue;
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            object.updateMatrix();
            m.multiplyMatrices(rider.matrixWorld, object.matrix);
            for (let k = 0; k < 8; k++) {
                corner.set(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z).applyMatrix4(m);
                deepest = Math.max(deepest, (x - corner.x) * n.x + (y - corner.y) * n.y + (z - corner.z) * n.z);
            }
        }
        return deepest;
    }

    // Called once per rendered frame with the leftover fixed-timestep
    // fraction; places the mesh between the previous and current physics
    // states so motion stays smooth when frames span 0 or 2 physics steps
    applyRenderInterpolation(alpha) {
        if (!this.prevRenderPos || !this.meshBasePosition) return;

        const dx = this.position.x - this.prevRenderPos.x;
        const dy = this.position.y - this.prevRenderPos.y;
        const dz = this.position.z - this.prevRenderPos.z;

        // Teleport (reset/checkpoint restart) - snap instead of interpolating
        if (dx * dx + dy * dy + dz * dz > 25) {
            this.renderPosition.copy(this.position);
            this.group.position.copy(this.meshBasePosition);
            return;
        }

        const t = Math.min(Math.max(alpha, 0), 1);
        this.renderPosition.set(
            this.prevRenderPos.x + dx * t,
            this.prevRenderPos.y + dy * t,
            this.prevRenderPos.z + dz * t
        );

        // Interpolate heading as well - a stepped yaw reads as camera judder
        // in corners even when the position is smooth
        let dyaw = this.yawAngle - (this.prevRenderYaw !== undefined ? this.prevRenderYaw : this.yawAngle);
        if (dyaw > Math.PI) dyaw -= Math.PI * 2;
        else if (dyaw < -Math.PI) dyaw += Math.PI * 2;
        this.renderYawAngle = (this.prevRenderYaw !== undefined ? this.prevRenderYaw : this.yawAngle) + dyaw * t;
        this.group.rotation.y = this.renderYawAngle + this.slideAngle;

        // Shift the mesh by the interpolation offset relative to the physics
        // position (idempotent - rebased from meshBasePosition every call)
        this.group.position.set(
            this.meshBasePosition.x + (this.renderPosition.x - this.position.x),
            this.meshBasePosition.y + (this.renderPosition.y - this.position.y),
            this.meshBasePosition.z + (this.renderPosition.z - this.position.z)
        );
    }

    reset() {
        this.position.set(0, 0, 0);
        this.velocity.set(0, 0, 0);
        this.speed = 20;
        this.yawAngle = 0;
        this.steeringAngle = 0;
        this.handlebarAngle = 0;
        this.leanAngle = 0;
        this.leanVelocity = 0;
        this.crashed = false;
        this.endFall();
        this.barState = null;
        this.crashAngle = 0;
        this.isJumping = false;
        this.jumpVelocityY = 0;
        this.jumpStartHeight = 0;
        this.jumpRotation = 0;
        this.previousSpeed = 0;
        this.isWheelie = false;
        this.wheelieAngle = 0;
        this.wheelieVelocity = 0;
        this.wheelieBalance = 0;
        this.wheelieStartTime = 0;
        this.wheelieScoreAccumulated = 0;
        this.wheeliePendingScore = 0;
        this.wheelieCombo = 0;
        this.wheeliePerfectFrames = 0;
        this.wheelieLastInputTime = 0;
        this.setRouteIndex(0);
        this.segmentProgress = 0;
        this.worldGrade = 0;
        this.worldThrottle = 0;
        this.lastDemand = 0;
        this.lowsideTimerMs = 0;
        this.brushS = 0;
        this.brushLeftS = 0;
        this.brushInto = 0;
        this.brushNew = false;
        this.worldBrake = 0;
        this.slideAngle = 0;
        this.footDown = false;
        this.footT = 0; // The stop pose snaps off: a reset rides away
        this.tipTimerS = 0;
        // A reset stands the bike still: the rider's reach arms again once it moves off (footReach)
        this.footArmed = false;
        this.footStillS = 0;
        this.footHint = false;
        this.footWarnNew = false;
        this.crashCause = null;
        this.crashWhy = null;
        this.contactWobble = 0;
        this.landFastS = 0;
        this.landSteepS = 0;
        this.landAlong = 0;
        this.landSteep = 0;
        this.landCover = 0;
        this.landAcross = 0;
        this.resetHairpinAssist();
        this.wasNearEdge = false;
        this.fallingOffCliff = false;
        this.fallSide = 0; // -1 left, +1 right: the side the bike went over
        this.offRoadTime = 0; // Seconds in run-off without touching the road
        this.runoff = null; // Run-off settings of the zone the bike is in, if any
        this.hitGround = false;
        this.tumbleSpeed = 0;
        this.tumbleAngle = 0;
        this.tumbleRoll = 0;
        this.fallStartY = 0;
        this.groundHitLogged = false;
        this.crashRecoveryTime = 0;
        this.crashPenaltyApplied = false;
        this.distanceTraveled = 0;
        this.lastPosition = null;
        this.lastJumpRotation = 0;
        this.finished = false;
        // Do not blend the mesh from the old position to the new one
        this.prevRenderPos = null;
        // A model that arrived mid-ride was held back so the bike would not
        // change under the rider; a reset is where it can
        if (this.modelWaiting) {
            this.modelWaiting();
            this.modelWaiting = null;
        }
        
        const bikeColorHex = parseInt(this.bikeColor);
        this.frame.material.color.setHex(bikeColorHex);
        this.fuelTank.material.color.setHex(bikeColorHex);
        this.group.rotation.set(0, 0, 0);
        this.updateMesh();
    }
    
    // Ground height read from the same profile the world is built from,
    // for the falling bike. Never below the height where a fall ends.
    getTerrainHeightAt(x, z) {
        const environment = this.environment;
        if (!environment || !environment.route || environment.route.unitCount === 0) {
            return 0;
        }

        const range = this.getSegmentSearchRange(30);
        const loc = {};
        const ground = environment.ground.groundY(x, z, range, false, loc);
        return Math.max(ground, environment.ground.restY(loc));
    }

    // Where the bike rides: the road height of the nearest segment, lowered or
    // raised to the ground in a run-off band. On road, shoulder, wall and fall
    // zones the answer is the road height itself.
    // How far the bike must drop before it counts as over the lip of the
    // side it fell from. A low drop ends in a short lip.
    fallLip() {
        this.located.index = this.currentRoadSegment;
        const side = this.environment.ground.sideAt(this.located, this.fallSide);
        return Math.min(8, side.lipDepth ?? 8);
    }

    // Where (x, z) lies against the road, searched within `radius` segments of
    // the bike; null before the road exists
    locateNear(x, z, radius) {
        const environment = this.environment;
        if (environment.route.unitCount === 0) return null;
        return environment.ground.locate(x, z, this.getSegmentSearchRange(radius), {});
    }

    // Height of the road centreline nearest to (x, z)
    roadYAt(x, z, radius = 10) {
        const loc = this.locateNear(x, z, radius);
        return loc ? loc.roadY : this.position.y;
    }

    surfaceAt(x, z, radius = 10) {
        const loc = this.locateNear(x, z, radius);
        if (!loc) return this.position.y;
        const ground = this.environment.ground;
        let zone = ground.zoneAt(loc, ground.halfRoad(loc));
        if (this.worldPhysics) zone = this.worldZone(zone, loc);
        if (zone.kind !== 'runoff') return loc.roadY;
        return ground.heightAt(loc, false);
    }

    calculateSlopeNormal(x, z) {
        // Calculate the normal vector of the terrain slope at this position
        const epsilon = 1.0; // Sample distance
        
        // Sample heights around the current position
        const h0 = this.getTerrainHeightAt(x, z);
        const hx1 = this.getTerrainHeightAt(x + epsilon, z);
        const hx2 = this.getTerrainHeightAt(x - epsilon, z);
        const hz1 = this.getTerrainHeightAt(x, z + epsilon);
        const hz2 = this.getTerrainHeightAt(x, z - epsilon);
        
        // Calculate gradients
        const dx = (hx1 - hx2) / (2 * epsilon);
        const dz = (hz1 - hz2) / (2 * epsilon);
        
        // Normal vector (perpendicular to slope)
        const normal = new THREE.Vector3(-dx, 1, -dz);
        normal.normalize();
        
        return normal;
    }

    getSpeed() {
        return this.crashed ? 0 : this.speed * 2.237; // Convert m/s to mph
    }

    getLeanAngleDegrees() {
        return this.leanAngle * 180 / Math.PI;
    }

    getSteeringAngleDegrees() {
        return this.steeringAngle * 180 / Math.PI;
    }
    
    getDistanceTraveled() {
        return this.distanceTraveled; // in meters
    }
    
    getDistanceTraveledKm() {
        return this.distanceTraveled / 1000; // in kilometers
    }

    setWeatherSystem(weatherSystem) {
        this.weatherSystem = weatherSystem;
    }

    // Settle the projection hint on route unit `index` and the progress with it
    setRouteIndex(index) {
        this.currentRoadSegment = index;
        const route = this.environment && this.environment.route;
        this.routeS = route ? route.fromUnits(index) : 0;
    }

    getSegmentSearchRange(searchRadius = 10) {
        // Return a range of segments to search (nearby segments only)
        // This dramatically improves performance vs searching all segments

        if (!this.environment || !this.environment.route || this.environment.route.unitCount === 0) {
            return { start: 0, end: 0 };
        }

        const pathLength = this.environment.route.unitCount;
        const start = Math.max(0, this.currentRoadSegment - searchRadius);
        const end = Math.min(pathLength - 1, this.currentRoadSegment + searchRadius);

        return { start, end };
    }

    findNearestRoadSegment() {
        // One-time full scan to re-sync segment tracking after a teleport
        // (reset, checkpoint restart). The per-frame searches are windowed
        // around currentRoadSegment, so a stale index after a teleport makes
        // wall/elevation checks use a segment far from the bike.
        if (!this.environment || !this.environment.route || this.environment.route.unitCount === 0) {
            return 0;
        }

        const best = this.environment.route.project(this.position.x, this.position.z, null, this.projection).index;
        this.setRouteIndex(best);
        this.segmentProgress = 0;
        this.wasNearEdge = false;
        return best;
    }

    updateElevation() {
        // Skip elevation update when jumping
        if (this.isJumping) return;
        
        // Check if we're on a ramp before adjusting to road height
        if (this.environment && this.environment.jumpRamps) {
            for (const ramp of this.environment.jumpRamps) {
                const dx = this.position.x - ramp.position.x;
                const dz = this.position.z - ramp.position.z;
                
                // Rotate to ramp's local space
                // Inverse of the ramp mesh's rotation.y = heading
                const cos = Math.cos(ramp.rotation);
                const sin = Math.sin(ramp.rotation);
                const localX = dx * cos - dz * sin;
                const localZ = dx * sin + dz * cos;
                
                // Check if we're within ramp bounds
                const onRamp = Math.abs(localX) < ramp.width / 2 && 
                              localZ > -ramp.length / 2 && 
                              localZ < ramp.length / 2;
                
                if (onRamp) {
                    // Don't update elevation when on ramp - let the ramp detection handle it
                    return;
                }
            }
        }
        
        // Find nearest road segments and interpolate between them
        if (this.environment && this.environment.route) {
            const route = this.environment.route;
            // Nearest vertex within the search window around the bike's segment
            const closest = route.project(this.position.x, this.position.z, { index: this.currentRoadSegment }, this.projection);
            const closestIndex = closest.index;

            if (closestIndex >= 0 && closest.y !== undefined) {
                let targetY = closest.y;
                const closestY = closest.y;
                const closestDistance = closest.distance;

                // If we have adjacent segments, interpolate for smoother transitions
                if (closestIndex > 0 && closestIndex < route.unitCount - 1) {
                    const prevSegment = route.pointAtUnit(closestIndex - 1);
                    const nextSegment = route.pointAtUnit(closestIndex + 1);
                    
                    // Simple linear interpolation based on position along the road
                    const distToPrev = Math.sqrt(
                        Math.pow(this.position.x - prevSegment.x, 2) + 
                        Math.pow(this.position.z - prevSegment.z, 2)
                    );
                    const distToNext = Math.sqrt(
                        Math.pow(this.position.x - nextSegment.x, 2) + 
                        Math.pow(this.position.z - nextSegment.z, 2)
                    );
                    
                    // A bike on a ride vertex is at distance 0 from both the projection and that vertex: the weight
                    // is then 0 / 0, so a zero total keeps closestY, which is the road's height there
                    if (distToPrev < distToNext && prevSegment.y !== undefined) {
                        // Closer to previous segment - interpolate between prev and current
                        const totalDist = distToPrev + closestDistance;
                        const weight = totalDist > 0 ? closestDistance / totalDist : 0;
                        targetY = prevSegment.y * weight + closestY * (1 - weight);
                    } else if (nextSegment.y !== undefined) {
                        // Closer to next segment - interpolate between current and next
                        const totalDist = closestDistance + distToNext;
                        const weight = totalDist > 0 ? distToNext / totalDist : 1;
                        targetY = closestY * weight + nextSegment.y * (1 - weight);
                    }
                }

                // Speed-adaptive elevation smoothing
                // At low speeds: smooth (0.15) to prevent bobbing
                // At high speeds: responsive (0.40) to prevent jitter from lag
                const speedRatio = Math.min(this.speed / 30, 1.0); // Normalize to 0-1 at 30 m/s
                const lerpFactor = 0.15 + (speedRatio * 0.25); // 0.15 at low speed, 0.40 at high speed
                // Interpolation follows the road; run-off adds the ground's offset from it
                targetY += this.surfaceAt(this.position.x, this.position.z) - closestY;
                this.position.y = this.position.y * (1 - lerpFactor) + targetY * lerpFactor;
            }
        }
    }
    
    checkWallCollision(deltaTime = 0) {
        // Check if bike has gone off the road edges
        if (!this.environment) {
            console.log('ERROR: No environment set on vehicle');
            return;
        }
        const route = this.environment.route;
        if (!route) {
            console.log('ERROR: No route in environment');
            return;
        }
        if (route.unitCount === 0) {
            console.log('ERROR: Empty route');
            return;
        }

        // Project onto the route near the bike's segment (only nearby
        // segments are searched, for performance) and keep the hint
        const projection = route.project(this.position.x, this.position.z, { index: this.currentRoadSegment }, this.projection);
        if (projection.index < 0) return;
        this.setRouteIndex(projection.index);

        // Perpendicular distance from the road centre line, positive to the right
        const perpDistance = projection.lateral;
        const perpX = Math.cos(projection.heading);
        const perpZ = -Math.sin(projection.heading);
        const sign = perpDistance < 0 ? -1 : 1;
        const sideName = sign < 0 ? 'left' : 'right';
        const halfRoadWidth = projection.width / 2;
        const ground = this.environment.ground;
        const located = this.located;
        located.index = projection.index;
        located.t = projection.along;

        // Where the bike is, by the profile's bands. Hysteresis pulls the
        // edges in by half a unit once the bike has been past the road edge,
        // so it cannot oscillate between states. A wall has none (it clamps
        // the bike to its face); the run-off timer and drag read the bike's
        // true lateral and ignore it.
        const hysteresisBuffer = 0.5;
        const bias = this.wasNearEdge ? hysteresisBuffer : 0;
        const world = this.worldPhysics;
        // A world's zones are read where the bike is: rebuilt from the row and the lateral, a place on a side road 10 to
        // 30 m from the ride stood up to 7 m from the bike, off that road or over a drop
        if (world) {
            located.x = this.position.x;
            located.z = this.position.z;
        }
        located.lateral = perpDistance;
        let zone = ground.zoneAt(located, halfRoadWidth);
        if (world) zone = this.worldZone(zone, located, projection.y);
        // A bike on a side road's carriageway past the ride's band is on road where it is: the hysteresis is the ride
        // edge's, and half a unit along the ride's normal there is anywhere about the side road, off its edge too
        const onSide = !!world && zone.kind === 'road' && Math.abs(perpDistance) > halfRoadWidth;
        located.lateral = perpDistance + sign * bias;
        if (world) {
            located.x = this.position.x + sign * bias * perpX;
            located.z = this.position.z + sign * bias * perpZ;
        }
        let edgeZone = onSide ? zone : ground.zoneAt(located, halfRoadWidth);
        if (world && !onSide) edgeZone = this.worldZone(edgeZone, located, projection.y);
        // (the reads after these, a brush's, rebuild their place from the lateral they ask about)
        located.x = undefined;
        located.z = undefined;
        const reach = Math.abs(perpDistance) + bias;

        // Update hysteresis state
        this.wasNearEdge = reach > halfRoadWidth;

        if (world) {
            // The world's verge: the bench drags the bike a little, run-off has its own drag
            if (zone.kind === 'shoulder' && !this.crashed) this.speed -= world.benchDrag * this.speed * deltaTime;
        } else if (reach > halfRoadWidth && reach < halfRoadWidth + zone.side.flat && edgeZone.kind !== 'runoff') {
            // On the ledge (slow down but don't crash). Run-off has its own drag.
            this.speed *= 0.95; // Gradual speed reduction
        }

        this.runoff = zone.kind === 'runoff' ? (world ? this.worldRunoff(zone.side.runoff) : zone.side.runoff) : null;
        if (world) this.worldLand(deltaTime);
        else if (this.runoff) this.checkRunoff(deltaTime, zone);
        // The road resets the clock; a shoulder in between neither adds nor clears it
        if (zone.kind === 'road') this.offRoadTime = 0;

        // A world's wall touched by the tyres alone, at a glance, is a brush (wallTouch): the bike is held at the face
        if (world && !this.crashed) this.brushStep(deltaTime);
        const brushed = world && !this.crashed && this.brushWall(zone, projection, halfRoadWidth, deltaTime);

        // Hit a wall: crash with a bounce back toward the road
        if (zone.kind === 'wall' && !this.crashed && !brushed) {
            this.crashed = true;
            this.crashWhy = 'wall';
            // The wall's face, out of it toward the road, for how the rider meets it (Vehicle.riderCrash)
            this.hitFrom(-sign * perpX, -sign * perpZ);
            this.fallingOffCliff = false; // Not falling, we hit a wall
            this.crashAngle = sign * Math.PI / 6; // Crash leaning into the wall
            // A world's crash says what it was (a leg's crash card has its own words)
            if (world) this.crashCause = 'Hit the wall';
            console.log(`CRASHED! Hit the ${sideName} wall at`, (this.speed * 2.237).toFixed(1) + ' mph');

            // Move bike back to the wall face and apply bounce
            const adjustment = sign * zone.start - perpDistance;
            this.position.x += perpX * adjustment;
            this.position.z += perpZ * adjustment;

            // Bounce off the wall - toward road center
            const bounceDir = new THREE.Vector3(-sign * perpX, 0, -sign * perpZ);
            this.velocity = bounceDir.multiplyScalar(this.speed * 0.2);
            this.velocity.y = 0.5; // Small upward bounce
        } else if (zone.kind === 'wall' && this.crashed && !this.fallingOffCliff) {
            // A bike already sliding on its side (it hit a trunk or a rock
            // first) stops at the wall instead of sliding through it into
            // ground it can no longer be placed on
            const adjustment = sign * zone.start - perpDistance;
            this.position.x += perpX * adjustment;
            this.position.z += perpZ * adjustment;
            const outward = this.velocity.x * perpX * sign + this.velocity.z * perpZ * sign;
            if (outward > 0) {
                this.velocity.x -= outward * perpX * sign;
                this.velocity.z -= outward * perpZ * sign;
            }
        }

        // Gone off a fall edge (a bike already sliding on its side goes over too)
        if (edgeZone.kind === 'fall') {
            console.log(`=== FALLING OFF ${sideName.toUpperCase()} EDGE ===`);
            console.log(`CRASHED! Fell off the ${sideName} edge at`, (this.speed * 2.237).toFixed(1) + ' mph');
            this.crashed = true;
            this.crashWhy = 'drop';
            if (world) this.crashCause = 'Went over the edge of a drop';
            this.fallingOffCliff = true;
            this.fallSide = sign;
            this.fallStartY = this.position.y;
            this.groundHitLogged = false;
            // Tumble end-over-end down the hill, faster with speed
            this.tumbleAngle = 0;
            this.tumbleRoll = 0;
            this.tumbleSpeed = 3 + this.speed * 0.12;
            this.crashAngle = -sign * Math.PI / 4; // Fall toward the other side

            // Continue forward momentum but start falling
            this.velocity.y = -8; // Start falling downward
        }
    }

    // What a touch on a wall is: true for a brush (the tyres alone, at a glance), false for a crash. (nx, nz) is the
    // wall's normal, out of the wall toward the bike's side; `height` the wall's top over the road, undefined for a
    // wall as high as the rider. The rule and its numbers are WorldPhysics.wallBrush. Nothing is changed here
    wallTouch(nx, nz, height) {
        const rule = this.worldPhysics && this.worldPhysics.wallBrush;
        if (!rule) return false;
        const sin = Math.sin(this.yawAngle), cos = Math.cos(this.yawAngle);
        // The share of the heading that goes into the wall: 0 along it, 1 head-on
        const into = -(sin * nx + cos * nz);
        // The speed into the wall counts over the whole contact: a wall may turn a bike that grazes it, not carry it
        // round a bend
        if (this.brushInto + this.speed * Math.max(0, into) > rule.closeMax || into > Math.sin(rule.glanceDeg * Math.PI / 180)) return false;
        if (this.brushS >= rule.mostS) return false;
        // The lean away from the wall: a lean of the sign of the side the wall is on leans the bike off it
        const away = Math.asin(Math.max(-1, Math.min(1, -Math.sin(this.leanAngle) * (cos * nx - sin * nz))));
        for (const part of rule.parts) {
            const out = part.half * Math.cos(away) - part.height * Math.sin(away);
            const high = part.height * Math.cos(away) + part.half * Math.sin(away);
            if (out > rule.tyreM && !(high > height)) return false;
        }
        return true;
    }

    // A brush against a wall whose normal is (nx, nz): the bike has been put at the face. It loses the speed it had
    // into the wall, its heading is turned kickDeg off the face (a heading further off stays), and the contact
    // begins or goes on for holdS (brushStep). `brushNew` tells the game of a new contact, once
    brush(nx, nz) {
        const rule = this.worldPhysics.wallBrush;
        const sin = Math.sin(this.yawAngle), cos = Math.cos(this.yawAngle);
        const into = -(sin * nx + cos * nz);
        const kick = rule.kickDeg * Math.PI / 180;
        if (into > -Math.sin(kick)) {
            // Along the face, the way the bike travels, then kickDeg toward the road
            const tx = sin + into * nx, tz = cos + into * nz;
            const length = Math.hypot(tx, tz) || 1;
            const x = tx / length * Math.cos(kick) + nx * Math.sin(kick), z = tz / length * Math.cos(kick) + nz * Math.sin(kick);
            const turn = Math.atan2(x, z) - this.yawAngle;
            // The heading is not wrapped anywhere: the turn is the short way round
            this.yawAngle += Math.atan2(Math.sin(turn), Math.cos(turn));
            if (into > 0) {
                this.brushInto += this.speed * into;
                this.speed *= Math.sqrt(Math.max(0, 1 - into * into));
            }
        }
        if (!(this.brushLeftS > 0)) this.brushNew = true;
        this.brushLeftS = rule.holdS;
        this.brushes = (this.brushes || 0) + 1;
    }

    // The contact with a wall, once a tick: for holdS after each touch the wall scrubs speed and the time against it
    // counts (wallTouch ends a contact of mostS as a crash); after that the contact is over
    brushStep(deltaTime) {
        if (!(this.brushLeftS > 0)) {
            this.brushS = 0;
            this.brushInto = 0;
            return;
        }
        this.speed -= this.worldPhysics.wallBrush.scrub * this.speed * deltaTime;
        this.brushS += deltaTime;
        this.brushLeftS -= deltaTime;
    }

    // The wall of the ride the bike is in: true when the touch is a brush. A wall whose face is a line along the road
    // (a parapet, tunnel rock) is met a step ahead as well: at the place the bike reaches at its heading, and skinM
    // more, so a brush stops the bike before the face and it is never in that wall. A rock face of the
    // land is met only where a crash was (the zone is read on the bike's piece of the ride, and a place a step
    // ahead can be in one the bike never comes to): the bike is in it for one step, closeMax x the step at the
    // most. Nothing is looked for while the step ends on the carriageway
    brushWall(zone, projection, halfRoad, deltaTime) {
        const rule = this.worldPhysics.wallBrush;
        if (!rule) return false;
        if (zone.kind === 'wall') return this.brushZone(zone, projection, halfRoad);
        const lateral = projection.lateral;
        const sign = lateral < 0 ? -1 : 1;
        const reach = Math.abs(lateral) + this.speed * deltaTime * Math.sin(this.yawAngle - projection.heading) * sign + rule.skinM;
        if (!(reach > halfRoad) || !(reach > Math.abs(lateral) + rule.skinM)) return false;
        const located = this.located;
        located.lateral = sign * reach;
        const next = this.environment.ground.zoneAt(located, halfRoad);
        located.lateral = lateral;
        return next.kind === 'wall' && next.line === true && this.brushZone(next, projection, halfRoad);
    }

    // A wall zone met by the bike (brushWall): true when the touch is a brush, with the bike put skinM before the
    // face when it is past that. A bike found over deepM into a wall did not touch its face (the ride's projection
    // came over from another strand): the crash it was. A wall's face is along the road: the zone's own start for a
    // wall with a line, else the first place back toward the road that is no wall, looked for in steps of FACE_STEP_M
    brushZone(zone, projection, halfRoad) {
        const rule = this.worldPhysics.wallBrush;
        const ground = this.environment.ground;
        const sign = zone.sign;
        const lateral = projection.lateral;
        const reach = Math.abs(lateral);
        const perpX = Math.cos(projection.heading), perpZ = -Math.sin(projection.heading);
        const located = this.located;
        located.lateral = lateral;
        if (zone.line && reach - zone.start > rule.deepM) return false;
        if (!this.wallTouch(-sign * perpX, -sign * perpZ, zone.height)) return false;
        let free = zone.line ? zone.start - rule.skinM : -1;
        for (let d = reach - Vehicle.FACE_STEP_M; free < 0 && d > 0 && reach - d <= rule.deepM + Vehicle.FACE_STEP_M; d -= Vehicle.FACE_STEP_M) {
            located.lateral = sign * d;
            if (this.worldZone(ground.zoneAt(located, halfRoad), located, projection.y).kind !== 'wall') free = d;
        }
        located.lateral = lateral;
        if (free < 0) return false;
        if (reach > free) {
            this.position.x += perpX * sign * (free - reach);
            this.position.z += perpZ * sign * (free - reach);
        }
        this.brush(-sign * perpX, -sign * perpZ);
        return true;
    }

    // A drawn building met on the land (worldLand) at (x, z), the bike's place or the place its step reaches: true
    // when the touch is a brush, with the bike put skinM off that face of the walls `w` ({x, z, heading, along,
    // across}, solid to `margin` past them) when it is past that
    brushHouse(w, margin, x = this.position.x, z = this.position.z) {
        const rule = this.worldPhysics.wallBrush;
        if (!rule) return false;
        const cos = Math.cos(w.heading), sin = Math.sin(w.heading);
        const a = (x - w.x) * cos - (z - w.z) * sin, b = (x - w.x) * sin + (z - w.z) * cos;
        // The face nearest that place, and its normal out of the walls
        const side = w.across / 2 + margin - Math.abs(a) < w.along / 2 + margin - Math.abs(b);
        const nx = side ? Math.sign(a || 1) * cos : Math.sign(b || 1) * sin;
        const nz = side ? -Math.sign(a || 1) * sin : Math.sign(b || 1) * cos;
        const out = (this.position.x - w.x) * nx + (this.position.z - w.z) * nz;
        const push = (side ? w.across : w.along) / 2 + margin + rule.skinM - out;
        // Over deepM into the walls the bike did not touch a face: the crash it was
        if (push - rule.skinM > rule.deepM || !this.wallTouch(nx, nz, undefined)) return false;
        if (push > 0) {
            this.position.x += nx * push;
            this.position.z += nz * push;
        }
        this.brush(nx, nz);
        return true;
    }

    // Run-off: loose ground beside the road. It drags the bike down to a floor
    // speed, and a bike that stays off the road too long, or rolls into water,
    // crashes. A crashed bike gets none of this and slides as on the road.
    checkRunoff(deltaTime, zone) {
        if (this.crashed) return;

        const { drag, floorSpeed } = this.legRunoff();
        const limit = this.worldPhysics ? this.worldPhysics.offRoadLimitS : this.maxOffRoadTime;
        // Drag only ever slows the bike: one that enters below the floor keeps its speed
        const floor = Math.min(this.speed, floorSpeed);
        this.speed = Math.max(this.speed - drag * this.speed * deltaTime, floor);
        this.offRoadTime += deltaTime;

        const environment = this.environment;
        const range = this.getSegmentSearchRange();
        const loc = {};
        const ground = environment.ground.groundY(this.position.x, this.position.z, range, false, loc);
        const water = environment.ground.waterLevel(loc);
        if (water !== null && ground <= water) {
            this.crashed = true;
            this.crashWhy = 'water';
            this.crashAngle = this.leanAngle || 0.5;
            console.log('CRASHED! Rode into the water at', (this.speed * 2.237).toFixed(1) + ' mph');
        } else if (this.offRoadTime >= limit) {
            this.crashed = true;
            this.crashWhy = 'offroad';
            this.crashAngle = this.leanAngle || 0.5;
            console.log('CRASHED! Off the road for', limit.toFixed(1), 's');
        }
    }

    // The world's land settings, as this.runoff holds them: the zone's, with the world's lean grip (landGrip). The
    // drag, the throttle and the brake on the land are WorldPhysics' (worldMultipliers, updateWorldSpeed)
    worldRunoff(runoff) {
        const source = runoff || WorldGround.RUNOFF;
        if (this.worldRunoffSource !== source || !this.worldRunoffCache || this.worldRunoffCache.grip !== this.worldPhysics.landGrip) {
            this.worldRunoffSource = source;
            this.worldRunoffCache = Object.freeze({ ...source, grip: this.worldPhysics.landGrip });
        }
        return this.worldRunoffCache;
    }

    // The world's land, once a tick: the slope of the drawn ground under the bike and the land cover there (what an
    // off-road bike's pace reads: landValues), and the crashes the rider can see coming: too fast on the land for
    // landCrashS, land steeper than landSteepSlope for landSteepS (both the bike's own: an off-road bike's are higher),
    // water, a drawn building, or the end of the land the world has in detail. Off the land the timers clear. The
    // speed it costs is updateWorldSpeed's (landDrag, landTraction)
    worldLand(deltaTime) {
        const world = this.worldPhysics;
        if (!this.runoff || this.crashed) {
            this.landFastS = 0;
            this.landSteepS = 0;
            this.landAlong = 0;
            this.landAcross = 0;
            this.landSteep = 0;
            if (!this.runoff) {
                this.offRoadTime = 0;
                this.landCover = 0;
            }
            return;
        }
        this.offRoadTime += deltaTime;
        const ground = this.environment.ground;
        const range = this.getSegmentSearchRange();
        const loc = this.landLoc || (this.landLoc = {});
        const here = ground.groundY(this.position.x, this.position.z, range, false, loc);
        const water = ground.waterLevel(loc);
        if (water !== null && here <= water) {
            this.worldCrash('Rode into the water', null, 'water');
            return;
        }
        // Past the tiles the world has in detail the land is the far grid's, drawn coarse and with nothing on it
        if (typeof ground.mapped === 'function' && !ground.mapped(this.position.x, this.position.z)) {
            this.worldCrash('Rode off the edge of the mapped land', null, 'unmapped');
            return;
        }
        const scenery = this.environment.scenery;
        const house = scenery && typeof scenery.houseAt === 'function' ? scenery.houseAt(this.position.x, this.position.z, world.houseHitM || 0) : null;
        if (house) {
            // A building's face is a wall as any other: the tyres alone at a glance brush it (wallTouch)
            if (house !== true && this.brushHouse(house, world.houseHitM || 0)) return;
            // (a stopping place's props name themselves: PlaceMesh)
            this.worldCrash(house.label ? `Rode into a ${house.label}` : 'Rode into a building', null, 'building');
            return;
        }
        // And before the bike is in it: the place this step reaches, and skinM more (as brushWall)
        if (scenery && typeof scenery.houseAt === 'function' && world.wallBrush && this.speed > 0) {
            const step = this.speed * deltaTime + world.wallBrush.skinM;
            const x = this.position.x + Math.sin(this.yawAngle) * step, z = this.position.z + Math.cos(this.yawAngle) * step;
            const next = scenery.houseAt(x, z, world.houseHitM || 0);
            if (next && next !== true) this.brushHouse(next, world.houseHitM || 0, x, z);
        }
        this.landCover = typeof ground.coverAt === 'function' ? ground.coverAt(this.position.x, this.position.z) : 0;
        // The slope on the drawn ground: ahead (where the bike is going, so a drop edge counts before it is under the
        // wheels) and across, landProbeM each way
        const m = world.landProbeM;
        const sin = Math.sin(this.yawAngle), cos = Math.cos(this.yawAngle);
        const at = (dx, dz) => ground.groundY(this.position.x + dx, this.position.z + dz, range, false, this.landProbe || (this.landProbe = {}));
        const ahead = at(sin * m, cos * m);
        const one = at(cos * m, -sin * m), other = at(-cos * m, sin * m);
        this.landAlong = Number.isFinite(ahead) && Number.isFinite(here) ? (ahead - here) / m : 0;
        this.landAcross = Number.isFinite(one) && Number.isFinite(other) ? (one - other) / (2 * m) : 0;
        const steep = Math.hypot(this.landAlong, this.landAcross);
        this.landSteep = steep;
        const land = this.landValues();
        this.landSteepS = steep > land.landSteepSlope ? this.landSteepS + deltaTime : 0;
        this.landFastS = this.speed > land.landCrashSpeed ? this.landFastS + deltaTime : 0;
        if (this.landSteepS >= world.landSteepS) {
            this.worldCrash(this.landAlong < -land.landSteepSlope ? 'Went over the edge of a steep drop' : 'Rode onto a slope too steep to hold', null, this.landAlong < -land.landSteepSlope ? 'drop' : 'steep');
        } else if (this.landFastS >= world.landCrashS) {
            const cover = world.landCover ? world.landCover[this.landCover] || world.landCover[0] : null;
            this.worldCrash(`Too fast ${cover ? cover.on : 'on the grass'}`, null, 'fast');
        }
    }

    // A world zone as the bike meets it. A wall or a drop from the tile's zone layer is solid only where the land
    // at loc shows it (WorldPhysics wallRiseM, dropDepthM against the road height roadY); elsewhere it is run-off.
    // The layer is an 8 m grid read at the nearest node, so a face between stacked strands reaches up to 4 m
    // toward the road, onto flat verge. Tunnel and gallery rock, bridge parapets and the parapets of
    // retaining walls stay solid.
    worldZone(zone, loc, roadY = loc.roadY) {
        if (zone.kind !== 'wall' && zone.kind !== 'fall') return this.worldSurface(zone, loc);
        // A retaining wall's parapet (WorldGround.zoneAt) stands where it is drawn, whatever the land beyond it
        if (zone.parapet) return zone;
        const world = this.worldPhysics;
        const ground = this.environment.ground;
        const route = this.environment.route;
        if (typeof ground.heightAt !== 'function' || typeof ground.position !== 'function' || !Number.isFinite(roadY)) return zone;
        const point = route.points && route.points[Math.max(0, Math.min(route.points.length - 1, loc.index))];
        const flags = point && point.flags;
        if (flags && (flags.tunnel || flags.gallery || flags.bridge)) return zone;
        const scratch = this.worldZoneLoc || (this.worldZoneLoc = {});
        scratch.index = loc.index;
        scratch.lateral = loc.lateral;
        scratch.roadY = roadY;
        scratch.width = undefined;
        scratch.flags = flags;
        const at = ground.position(loc);
        scratch.x = at.x;
        scratch.z = at.z;
        const land = ground.heightAt(scratch);
        if (zone.kind === 'wall' ? land - roadY >= world.wallRiseM : roadY - land >= world.dropDepthM) return zone;
        const soft = this.worldSoftZone || (this.worldSoftZone = {});
        soft.kind = 'runoff';
        soft.side = ground.openSide || { flat: 0, runoff: WorldGround.RUNOFF, lipDepth: 8 };
        soft.sign = zone.sign;
        soft.start = zone.start;
        return this.worldSurface(soft, loc);
    }

    // What a soft zone (road, shoulder, run-off) is to the bike, by where it stands against the drawn road rather than
    // by the tile's 8 m zone layer, whose road and bench nodes reach several metres onto the land beside the road:
    // the carriageway (zoneAt's own road band) or a side road's is road; the drawn verge, RoadSurface.VERGE_M past the
    // edge, is the shoulder, and so is the strip of a stopping place (WorldPlaces); past it is the land (run-off).
    // Tunnel and gallery benches are left as they are.
    worldSurface(zone, loc) {
        if (zone.kind === 'road' && zone.start === 0) return zone;
        const ground = this.environment.ground;
        if (typeof ground.halfRoad !== 'function' || typeof ground.position !== 'function' || typeof RoadSurface === 'undefined') return zone;
        const route = this.environment.route;
        const point = route.points && route.points[Math.max(0, Math.min(route.points.length - 1, loc.index))];
        const flags = point && point.flags;
        if (flags && (flags.tunnel || flags.gallery)) return zone;
        if (zone.kind === 'road' && typeof ground.sideRoadY === 'function') {
            const at = ground.position(loc);
            if (ground.sideRoadY(at.x, at.z) !== null) return zone;
        }
        // (a stopping place's strip is verge too, as deep as the place: WorldGround.vergeAt, WorldPlaces)
        const width = typeof ground.vergeAt === 'function' ? ground.vergeAt(loc.index, loc.lateral, loc.t, true) : RoadSurface.VERGE_M;
        const verge = Math.abs(loc.lateral) <= ground.halfRoad(loc) + width;
        const kind = verge ? 'shoulder' : 'runoff';
        if (zone.kind === kind) return zone;
        // A new zone each time: checkWallCollision holds two at once (the bike's and the edge's)
        return { kind, side: verge ? (ground.benchSide || zone.side) : (ground.openSide || zone.side), sign: zone.sign, start: zone.start };
    }

    // A solid obstacle: hit when the bike is within `radius + 1.0` of it on
    // the ground plane and below its top. Returns true when it crashed the bike.
    hitSolid(solid) {
        const dx = this.position.x - solid.position.x;
        const dz = this.position.z - solid.position.z;
        if (dx * dx + dz * dz >= (solid.radius + 1.0) ** 2) return false;
        if (this.position.y - solid.position.y >= solid.height) return false;

        this.crashed = true;
        this.crashWhy = 'obstacle';
        this.blockRider(solid.position.x, solid.position.z, solid.radius);
        // Not left in the jump state, as the forced landing does
        this.isJumping = false;
        this.crashAngle = this.leanAngle || 0.5;

        const impactDir = new THREE.Vector3(dx, 0, dz).normalize();
        this.velocity = impactDir.multiplyScalar(this.speed * 0.5);
        this.velocity.y = 2;
        console.log(`CRASHED! Hit a ${solid.label || 'solid obstacle'} at`, (this.speed * 2.237).toFixed(1) + ' mph');
        return true;
    }

    // Small-obstacle hop: bikes with good jump stats bounce over small rocks
    // instead of crashing. Returns true if the bike hopped.
    attemptHop(obstacleRadius) {
        if (this.crashed || this.isJumping) return false;

        // What this bike can clear: scooter ~0.37m, supersport ~0.42m,
        // adventure ~0.50m, dirt bike ~0.55m
        const hopThreshold = 0.25 + 0.2 * (this.jumpPowerMult || 1);
        if (obstacleRadius > hopThreshold) return false;

        // Pop over it - bigger rocks need (and get) more lift
        this.isJumping = true;
        this.jumpStartHeight = this.position.y;
        this.jumpVelocityY = 2.2 + obstacleRadius * 3 * (this.jumpPowerMult || 1);
        this.jumpRotation = 0;
        this.jumpAngularVel = 0;
        this.jumpWheelSpin = Math.min(this.speed / 60, 0.3);

        // The impact scrubs some speed
        this.speed *= 0.88;

        console.log(`Hopped a ${obstacleRadius.toFixed(2)}m rock`);
        return true;
    }

    initiateJump(ramp) {
        this.isJumping = true;
        this.jumpStartHeight = this.position.y;
        
        // Calculate jump velocity based on speed and ramp angle
        const jumpAngle = Math.atan2(ramp.height, ramp.length * 0.6); // Approximate ramp angle
        this.jumpVelocityY = Math.sin(jumpAngle) * this.speed * 0.6; // Even higher jump force

        // Better extra lift, scaled by the character's suspension (jump stat)
        this.jumpVelocityY += 2.5;
        this.jumpVelocityY *= this.jumpPowerMult || 1;

        // In-air attitude state: pitch carries angular momentum, and the rear
        // wheel's spin (built by throttle) is what torques the bike
        this.jumpRotation = 0;
        this.jumpAngularVel = 0;
        this.jumpWheelSpin = Math.min(this.speed / 50, 0.4); // Carry some spin off the ramp
        
        console.log('JUMPING! Speed:', (this.speed * 2.237).toFixed(1) + ' mph, Launch velocity:', this.jumpVelocityY.toFixed(1));
    }
    
    updateJump(deltaTime, throttleInput, brakeInput) {
        // Apply gravity
        this.jumpVelocityY -= 9.81 * deltaTime * 2; // Double gravity for arcade feel
        
        // Update vertical position
        this.position.y += this.jumpVelocityY * deltaTime;

        // In-air attitude control via the rear wheel's angular momentum:
        // holding throttle spins the wheel up over ~half a second, and that
        // building spin torques the bike nose-UP (reaction torque) - so a blip
        // barely moves it but a held throttle gradually tips it back. Braking
        // dumps the spin and pitches the nose down.
        this.jumpWheelSpin += throttleInput * 2.2 * deltaTime;
        this.jumpWheelSpin -= brakeInput * 4.5 * deltaTime;
        this.jumpWheelSpin = Math.max(0, Math.min(this.jumpWheelSpin, 1));

        // Torque: nose-up with wheel spin (negative rotation.x is front-up),
        // nose-down under braking
        const torque = -this.jumpWheelSpin * 2.6 + brakeInput * 1.6;
        this.jumpAngularVel = (this.jumpAngularVel || 0) + torque * deltaTime;
        // Light damping so the pitch carries momentum without running away
        this.jumpAngularVel *= Math.max(0, 1 - 0.5 * deltaTime);
        this.jumpRotation += this.jumpAngularVel * deltaTime;
        
        // Check for landing
        if (this.environment && this.environment.route) {
            // Find the road height at current position (windowed search - jumps
            // travel forward, so use a wider window than the on-road checks)
            const targetRoadHeight = this.surfaceAt(this.position.x, this.position.z, 25);
            
            // Check if we've landed
            if (this.jumpVelocityY < 0 && this.position.y <= targetRoadHeight + 0.1) {
                this.land(targetRoadHeight);
            }
        }
        
        // Safety check - if we've been jumping too long, force landing
        if (this.position.y < this.jumpStartHeight - 10) {
            this.crashed = true;
            this.crashWhy = 'landing';
            this.isJumping = false;
            this.jumpRotation = 0;
            console.log('CRASHED! Bad landing from jump');
        }
    }
    
    land(groundHeight) {
        // Total rotation of this jump, for flip scoring (zeroed below)
        this.lastJumpRotation = this.jumpRotation;
        this.isJumping = false;
        this.position.y = groundHeight;
        this.jumpVelocityY = 0;
        
        // Normalize rotation to -PI to PI range
        while (this.jumpRotation > Math.PI) this.jumpRotation -= Math.PI * 2;
        while (this.jumpRotation < -Math.PI) this.jumpRotation += Math.PI * 2;
        
        // Check landing quality based on rotation angle
        const landingAngle = Math.abs(this.jumpRotation);
        const landingSpeed = Math.abs(this.jumpVelocityY);
        
        // Good landing if bike is mostly level (within 45 degrees)
        if (landingAngle < Math.PI / 4) {
            console.log('Perfect landing! Angle:', (landingAngle * 180 / Math.PI).toFixed(0) + '°');
            this.jumpRotation = 0;
        } else if (landingAngle < Math.PI / 2) {
            // Rough but recoverable landing
            console.log('Rough landing! Angle:', (landingAngle * 180 / Math.PI).toFixed(0) + '°');
            this.jumpRotation = 0;
            // Slow down a bit from the hard landing
            this.speed *= 0.7;
        } else {
            // Bad angle - crash
            this.crashed = true;
            this.crashWhy = 'landing';
            this.crashAngle = this.jumpRotation > 0 ? Math.PI/2 : -Math.PI/2;
            console.log('CRASHED! Bad landing angle:', (landingAngle * 180 / Math.PI).toFixed(0) + '°');
        }
    }
}
// The kinds of bike: the builder that makes each one from primitives, and
// how far its rider rises off the seat over a jump (motocross riders stand
// tall, a scooter rider barely lifts). `offroad` is the trait of a bike that
// is the kind itself (BIKE_MODELS `offroad`); a detailed bike keeps its own,
// whatever kind stands in for it. `engine` is the voice a kind is heard with (js/sound.js)
Vehicle.BIKES = {
    sport: { build: 'buildSportBike', engine: 'four', kg: 198, spare: 0.8, stand: 0.16, seat: { y: 1.06, z: -0.08, torsoLean: 0.72, style: 'race', hand: [0.19, -0.06, 0.68], foot: [0.21, -0.63, -0.05], elbowOut: 0.05, kneeOut: 0.06, kneeForward: 0.13 } },
    adventure: { build: 'buildAdventureBike', engine: 'parallel-twin', kg: 220, spare: 0.42, stand: 0.16, offroad: 0.6, seat: { y: 1.22, z: -0.12, torsoLean: 0.18, style: 'adv', hand: [0.24, -0.03, 0.6], foot: [0.2, -0.74, 0.06], elbowOut: 0.08, kneeOut: 0.04, kneeForward: 0.2 } },
    scooter: { build: 'buildScooter', engine: 'single', kg: 182, spare: 0, leanMaxDeg: 45, stand: 0.08, seat: { y: 1.16, z: -0.18, torsoLean: 0.08, style: 'commuter', hand: [0.21, -0.05, 0.71], foot: [0.13, -0.72, 0.42], elbowOut: 0.06, kneeOut: 0.03, kneeForward: 0.3 } },
    dirt: { build: 'buildDirtBike', engine: 'single', kg: 146, spare: 0.1, stand: 0.24, offroad: 1, seat: { y: 1.22, z: -0.02, torsoLean: 0.45, style: 'mx', hand: [0.27, -0.09, 0.53], foot: [0.19, -0.79, -0.06], elbowOut: 0.08, kneeOut: 0.05, kneeForward: 0.22 } },
    naked: { build: 'buildNakedBike', engine: 'triple', kg: 189, spare: 0.57, stand: 0.16, seat: { y: 1.12, z: -0.12, torsoLean: 0.22, style: 'road', hand: [0.3, -0.06, 0.52], foot: [0.2, -0.7, 0.0], elbowOut: 0.07, kneeOut: 0.05, kneeForward: 0.18 } }
};

// A rider's pose and colours for the modelled rider (js/bikemodels.js) from a kind's `seat` or a builder's own
// options with an outfit's kit laid over them. Gear a kit leaves out takes these colours. A scarf is worn only on
// the bikes the kit names. One rule for the rider the player rides as and for a rider of the group.
Vehicle.riderSpec = (options, character, model) => {
    const {
        y = 1.15, z = -0.1, torsoLean = 0.15,
        suitColor = 0x141418, suitAccent = 0x3a414d,
        helmetColor = 0xf0f0f0, helmetAccent = 0xffffff,
        helmetTrim = helmetAccent, helmetStyle = null,
        gloveColor = 0x101014, pantsColor = suitColor, pantsAccent = suitAccent,
        bootColor = gloveColor, bootAccent = suitAccent, backpackColor = null,
        style = 'road',
        hand = [0.19, -0.05, 0.6], foot = [0.2, -0.66, -0.05],
        elbowOut = 0.07, kneeOut = 0.05, kneeForward = 0.16,
        scarfColor = null, scarfBikes = [],
        ...gear
    } = options;
    const scarf = scarfColor !== null && scarfBikes.includes(model) ? scarfColor : null;
    return {
        ...gear, build: (character && character.build) || null,
        y, z, torsoLean, suitColor, suitAccent, helmetColor, helmetAccent,
        helmetTrim, helmetStyle, gloveColor, pantsColor, pantsAccent, bootColor, bootAccent, backpackColor,
        style, hand, foot, elbowOut, kneeOut, kneeForward, scarf
    };
};

// Mirrors a bike built with +x on the rider's right, as the procedural
// builders and the first Blender scripts write it, so that its right is on
// the rider's right in three.js, where the chase camera looking up +z sees +x
// on its left. Each part (each child of `group` but the rider, who is the
// same both sides and whose lean must not flip) moves across and is turned
// and scaled about its own pivot as its mirror image; the pose Vehicle
// animates (spin about x, steer about the steering axis) is not mirrored.
Vehicle.mirrorParts = (group, rider) => {
    for (const part of group.children) {
        if (part === rider) continue;
        part.position.x = -part.position.x;
        part.rotation.y = -part.rotation.y;
        part.rotation.z = -part.rotation.z;
        part.scale.x = -part.scale.x;
    }
};

// The rider's left in the bike's axes: Route.LEFT, the one side convention (js/world/route.js), which is +x; a test
// that loads the bike without the route gets the same
Vehicle.LEFT = typeof Route !== 'undefined' ? Route.LEFT : 1;
// The share of the steering angle the front end is drawn turned by, and the axle a wheel spins about
Vehicle.STEER_SHOWN = 0.5;
// The drawn handlebar at speed (Vehicle.shownBar): `counter` s, the bar angle against each rad/s of roll (a full roll
// rate of 1.15 rad/s shows 8 degrees), at most counterMax; at most intoMax into the turn at a held lean; the roll rate
// is smoothed over `lag` s; under directSpeed m/s the drawn bar goes over to the steering angle
// A lowside or a fall at walking pace as it is drawn (Vehicle.drawFall): downS and tipS seconds for the bike to go
// from its lean to its side; spin rad the sliding bike turns into the bend for each metre slid, at most spinMax;
// sparkS seconds between the sparks a bike sliding on the carriageway throws, over sparkSpeed m/s (Game)
Vehicle.FALL = Object.freeze({ downS: 0.45, tipS: 0.8, spin: 0.07, spinMax: 1.3, sparkS: 0.08, sparkSpeed: 4 });

// How the rider comes off, by what caused the crash. Whoever raises a crash names the class of its cause
// (this.crashWhy: the third argument of worldCrash, or set beside `crashed = true`), and this one table gives the kind
// of the rider's fall (a key of Vehicle.RIDER_FALLS). Nothing reads the words of a cause. A crash with no class, or
// one this table does not have, falls as RIDER_FALL.fallback
Vehicle.CRASH_CAUSES = Object.freeze({
    // The front or the lean let go: too much lean for the grip, on the road or on the land
    grip: 'lowside',
    // A slope too steep to hold, too long off the road, under the surface
    steep: 'lowside',
    offroad: 'lowside',
    sunk: 'lowside',
    // The rear came round and gripped again, too fast over the land, a wheelie over the back, a jump landed badly
    rear: 'highside',
    fast: 'highside',
    flip: 'highside',
    landing: 'highside',
    // Rode into something that stands: a wall, a car, a rider, a building, a rock or a machine
    wall: 'front',
    car: 'front',
    rider: 'front',
    building: 'front',
    obstacle: 'front',
    // Nothing under the bike: over an edge, into water, off the mapped land
    drop: 'drop',
    water: 'drop',
    unmapped: 'drop',
    // Too slow to stay up
    stall: 'tip',
    // Stopped on ground too steep for the rider's foot to reach (FOOT_REACH)
    foot: 'tip'
});

// The rules every kind of fall shares. A fall goes over from its row's `calm` row (the tip-over) at calmFrom m/s and
// under to its own row from calmTo m/s, a smoothstep between: no step at any speed. Its throw is nothing at walkSpeed
// m/s and the row's whole throw from the row's fullSpeed. A lean of leanFrom degrees or less is the row as it stands,
// and one of leanTo or more takes the whole of the row's `lean` multipliers. Where he leaves the bike the land's fall
// toward each side is read from bankNearM to bankFarM out (rise per metre; positive: it falls away), and the grade
// along the way he goes gradeM ahead and behind (positive: uphill). On the ground the slope pulls him downhill by
// gravity x its sine, at most slopeMost m/s2 (less than any row's scrub, so he never slides on for ever); a gradient
// over slopeGrade is an edge, which pulls nobody. gravity m/s2; a landing faster than bounceFrom m/s bounces by the row's
// `bounce`; within touchM of the ground some part of him is on it, and the slide's friction acts (he leaves the seat
// that near it). bodyM is how near his middle comes to a wall, a building or the thing the bike hit, and pushSpeed m/s
// the most he is moved out of one he starts in. nearUnits is how many pieces of the road either side of his last one
// he is looked for in (riderProject). Lying under stillSpeed m/s he sits up over upS s. `bend` is the share of a
// limb's reach a full bend takes. The radii of the points that touch the ground (riderProbes): headM, torsoM at
// torsoHalfM each way along the spine, limbM
Vehicle.RIDER_FALL = Object.freeze({
    fallback: 'lowside', calmFrom: 1.5, calmTo: 7, walkSpeed: 1.5, leanFrom: 20, leanTo: 45, bankNearM: 1, bankFarM: 4, gradeM: 2,
    slopeGrade: 0.5, slopeMost: 1, gravity: 14, bounceFrom: 3, touchM: 0.5, bodyM: 0.9, pushSpeed: 5, nearUnits: 3, stillSpeed: 0.6, upS: 0.5,
    bend: 0.5, headM: 0.15, torsoM: 0.15, torsoHalfM: 0.15, limbM: 0.07
});

// The rows of falls. A row with no `of` is a kind's own; a row with `of` is a variant of that kind, taken when the
// crash's numbers are all inside its `when` (the first such row, in this order). No code names a row.
//   when: { field: [from, under] } over the crash's numbers (Vehicle.riderCrash): speed m/s, lean degrees, closing
//   m/s (the speed into what was hit), into (the share of the heading that went into it: 0 along, 1 head-on), bank and
//   highBank (the land's fall away toward the low and the high side) and grade (RIDER_FALL)
//   calm: the row a slow crash of this one is (the tip-over); false: none, the row at every speed
//   slowS, fastS: the keys play over slowS seconds at walking pace and fastS from fullSpeed m/s (a slow crash is a
//   slow topple)
//   keep, most: the share of the bike's speed he leaves with, and the most (m/s: a rider over the bars lands near
//   what the bike hit, however fast it was); out: m/s to the low side (negative: over the high side);
//   lift, liftPerSpeed: m/s upwards, and more for each m/s of the crash. out and lift grow from nothing at walking
//   pace to the whole of them at fullSpeed
//   stop: the share of his speed into what was hit that he loses at once (0: he goes on over it); away: m/s off its
//   face (at fullSpeed)
//   topple: metres to the low side (negative: the high side) his middle goes over the keys, at any speed
//   drag, scrub: on the ground he loses drag of his speed and scrub m/s each second; bounce: the share a hard landing
//   gives back
//   lean: multipliers on out, topple, drag, scrub and T (the keys' time) at a lean of leanTo
//   withBike, off: he has no slide of his own and goes off [to the low side, up, ahead] m from the bike as it falls
//   keys: the poses, in order. `at` is the share of the time (the last is 1). `body` is [pitch, roll, twist, yaw] in
//   degrees: pitch tips the spine forward from upright (90 lies face down, head first; -90 on the back, feet
//   first; more than 180 is a forward roll), roll turns him about the line of travel toward the low side (with the
//   spine along it, a roll over and over), twist about his own spine toward the low side, yaw about the world's up
//   toward the low side. `arms` and `legs` are [the low side's, the high side's], each [swing, spread, bend]: swing
//   brings the limb forward from hanging along the spine (90 is straight ahead of the chest, 180 over the head),
//   spread takes it out to its side, bend is 0 straight to 1 folded
//   sit: the pose he sits up to once he lies still (the same fields, no `at`); none and he lies as the last key
// A row and its calm row are blended pose by pose, so the two keep their turns within a half turn of each other
const RIDER_SIT_BACK = { arms: [[-35, 25, 0.1], [-35, 25, 0.1]], legs: [[80, 12, 0.3], [70, 16, 0.5]] };
Vehicle.RIDER_FALLS = Object.freeze({
    // Off the low side onto hip and back, arms out; he slides feet first behind the bike. Leaned far over he is near
    // the ground already: a short drop and a long slide
    lowside: {
        calm: 'tip', slowS: 1.2, fastS: 0.85, fullSpeed: 12, keep: 1, most: 60, out: 1.6, lift: 0, liftPerSpeed: 0, stop: 0, away: 0, topple: 0.35,
        drag: 1.35, scrub: 1.2, bounce: 0, lean: { out: 0.35, topple: 0.5, drag: 0.8, scrub: 0.85, T: 0.8 },
        keys: [
            { at: 0.22, body: [-5, 50, 0, 0], arms: [[35, 55, 0.3], [80, 30, 0.35]], legs: [[65, 20, 0.5], [55, 30, 0.45]] },
            { at: 0.5, body: [-55, 60, 10, -10], arms: [[25, 80, 0.1], [70, 60, 0.15]], legs: [[40, 15, 0.3], [50, 28, 0.45]] },
            { at: 0.78, body: [-80, 35, 5, 10], arms: [[20, 85, 0.1], [45, 80, 0.1]], legs: [[18, 14, 0.15], [38, 22, 0.4]] },
            { at: 1, body: [-86, 12, 0, 28], arms: [[15, 75, 0.15], [30, 82, 0.15]], legs: [[8, 12, 0.05], [28, 18, 0.35]] }
        ],
        sit: { body: [-18, 0, 0, 28], ...RIDER_SIT_BACK }
    },
    // The land falls away steeply on the low side: down onto the hip, and over and over down the bank, arms in
    lowsideRoll: {
        of: 'lowside', when: { bank: [0.35, Infinity] },
        calm: 'tipRoll', slowS: 1.3, fastS: 1.1, fullSpeed: 12, keep: 1, most: 60, out: 2.2, lift: 0, liftPerSpeed: 0, stop: 0, away: 0, topple: 0.6,
        drag: 1.2, scrub: 1.4, bounce: 0,
        keys: [
            { at: 0.2, body: [-5, 50, 0, 0], arms: [[35, 55, 0.3], [80, 30, 0.35]], legs: [[65, 20, 0.5], [55, 30, 0.45]] },
            { at: 0.45, body: [-70, 120, 0, -5], arms: [[110, 25, 0.7], [110, 25, 0.7]], legs: [[15, 10, 0.15], [15, 12, 0.15]] },
            { at: 0.72, body: [-86, 235, 0, 0], arms: [[105, 20, 0.75], [105, 20, 0.75]], legs: [[10, 8, 0.1], [12, 10, 0.1]] },
            { at: 1, body: [-88, 340, 0, 8], arms: [[60, 60, 0.3], [70, 55, 0.3]], legs: [[10, 12, 0.1], [25, 16, 0.3]] }
        ],
        sit: { body: [-18, 360, 0, 20], ...RIDER_SIT_BACK }
    },
    // Fast and barely leaned: more of a fall. He comes down hard, bounces, goes over onto his front and slides face
    // down, feet first
    lowsideTumble: {
        of: 'lowside', when: { speed: [18, Infinity], lean: [0, 28] },
        calm: 'tip', slowS: 1.3, fastS: 1.1, fullSpeed: 18, keep: 1, most: 60, out: 2.4, lift: 1.4, liftPerSpeed: 0, stop: 0, away: 0, topple: 0.3,
        drag: 1.3, scrub: 1.2, bounce: 0.3,
        keys: [
            { at: 0.15, body: [-5, 55, 0, 0], arms: [[60, 70, 0.2], [110, 40, 0.2]], legs: [[50, 25, 0.4], [40, 30, 0.35]] },
            { at: 0.4, body: [-40, 115, 10, -10], arms: [[150, 50, 0.2], [120, 60, 0.3]], legs: [[30, 25, 0.3], [60, 30, 0.6]] },
            { at: 0.7, body: [-80, 170, 5, -5], arms: [[160, 45, 0.25], [150, 50, 0.25]], legs: [[15, 20, 0.15], [35, 25, 0.4]] },
            { at: 1, body: [-88, 182, 0, 6], arms: [[165, 40, 0.3], [160, 45, 0.3]], legs: [[10, 18, 0.1], [30, 22, 0.35]] }
        ],
        sit: { body: [-18, 360, 0, 20], ...RIDER_SIT_BACK }
    },
    // Thrown over the high side: up and across, a roll about the line of travel, then a slide on the back. He is
    // thrown on ahead of the sliding bike (less drag than it), where the chase view has him
    highside: {
        calm: 'tip', slowS: 1.45, fastS: 1.2, fullSpeed: 18, keep: 0.8, most: 60, out: -2.6, lift: 3.8, liftPerSpeed: 0.03, stop: 0, away: 0, topple: 0,
        drag: 1.3, scrub: 2, bounce: 0.25,
        keys: [
            { at: 0.16, body: [15, -50, 0, 0], arms: [[125, 40, 0.15], [110, 55, 0.15]], legs: [[40, 25, 0.3], [55, 32, 0.3]] },
            { at: 0.4, body: [70, -180, 0, -8], arms: [[80, 35, 0.6], [75, 35, 0.6]], legs: [[85, 15, 0.7], [80, 18, 0.7]] },
            { at: 0.68, body: [88, -360, 0, -16], arms: [[60, 70, 0.3], [130, 50, 0.2]], legs: [[45, 22, 0.45], [20, 25, 0.2]] },
            { at: 1, body: [90, -540, 0, -24], arms: [[150, 60, 0.2], [120, 75, 0.2]], legs: [[10, 14, 0.1], [28, 22, 0.35]] }
        ],
        sit: { body: [90, -540, 0, -24], arms: [[95, 35, 0.55], [150, 50, 0.3]], legs: [[5, 12, 0.05], [60, 20, 0.7]] }
    },
    // Fast, with the land falling away on the high side: thrown down the bank, and rolling on there
    highsideRoll: {
        of: 'highside', when: { speed: [14, Infinity], highBank: [0.35, Infinity] },
        calm: 'tip', slowS: 1.5, fastS: 1.45, fullSpeed: 18, keep: 0.8, most: 60, out: -3.2, lift: 3.4, liftPerSpeed: 0.03, stop: 0, away: 0, topple: -0.4,
        drag: 1.2, scrub: 1.6, bounce: 0.25,
        keys: [
            { at: 0.14, body: [15, -50, 0, 0], arms: [[125, 40, 0.15], [110, 55, 0.15]], legs: [[40, 25, 0.3], [55, 32, 0.3]] },
            { at: 0.38, body: [70, -200, 0, -8], arms: [[100, 20, 0.7], [100, 20, 0.7]], legs: [[20, 12, 0.2], [25, 14, 0.25]] },
            { at: 0.68, body: [88, -450, 0, -16], arms: [[100, 20, 0.75], [100, 20, 0.75]], legs: [[10, 10, 0.1], [15, 12, 0.15]] },
            { at: 1, body: [90, -720, 0, -24], arms: [[140, 60, 0.25], [120, 70, 0.2]], legs: [[10, 14, 0.1], [28, 22, 0.35]] }
        ]
    },
    // Under the speed of a real highside: up a little and over the high side onto the hip, then a half turn onto the
    // back and a short slide
    highsideShort: {
        of: 'highside', when: { speed: [-Infinity, 14] },
        calm: 'tip', slowS: 1.5, fastS: 1.15, fullSpeed: 14, keep: 0.8, most: 60, out: -2, lift: 2.4, liftPerSpeed: 0.03, stop: 0, away: 0, topple: -0.4,
        drag: 1.3, scrub: 2, bounce: 0.2,
        keys: [
            { at: 0.2, body: [10, -45, 0, 0], arms: [[120, 40, 0.15], [100, 55, 0.15]], legs: [[40, 25, 0.3], [55, 32, 0.3]] },
            { at: 0.5, body: [-30, -95, 10, -10], arms: [[90, 70, 0.2], [60, 80, 0.2]], legs: [[45, 20, 0.4], [30, 25, 0.3]] },
            { at: 0.78, body: [-75, -50, 5, -20], arms: [[30, 80, 0.1], [45, 80, 0.1]], legs: [[20, 14, 0.15], [35, 22, 0.4]] },
            { at: 1, body: [-86, -15, 0, -28], arms: [[15, 75, 0.15], [30, 82, 0.15]], legs: [[8, 12, 0.05], [28, 18, 0.35]] }
        ],
        sit: { body: [-18, 0, 0, -28], ...RIDER_SIT_BACK }
    },
    // Over the bars: a dive, a forward roll, onto the back feet first, and a slide or a stop against the thing. Only
    // into it fast (slump under that)
    front: {
        calm: 'tip', slowS: 1.3, fastS: 1, fullSpeed: 10, keep: 0.8, most: 11, out: 0, lift: 3.2, liftPerSpeed: 0.05, stop: 0, away: 0, topple: 0,
        drag: 1.7, scrub: 2.5, bounce: 0.2,
        keys: [
            { at: 0.18, body: [65, 0, 0, 0], arms: [[150, 20, 0.1], [150, 20, 0.1]], legs: [[5, 18, 0.2], [-10, 22, 0.3]] },
            { at: 0.45, body: [165, 8, 0, 0], arms: [[95, 30, 0.55], [90, 30, 0.55]], legs: [[80, 14, 0.65], [70, 18, 0.65]] },
            { at: 0.72, body: [255, 14, 0, 6], arms: [[60, 60, 0.3], [70, 55, 0.3]], legs: [[55, 16, 0.45], [35, 20, 0.3]] },
            { at: 1, body: [274, 18, 0, 14], arms: [[20, 80, 0.1], [35, 82, 0.12]], legs: [[8, 12, 0.05], [30, 20, 0.35]] }
        ],
        sit: { body: [342, 0, 0, 14], ...RIDER_SIT_BACK }
    },
    // A glancing hit: down on the side and on along the face of the thing, held off it, onto the back
    glance: {
        of: 'front', when: { into: [0, 0.45] },
        calm: 'tip', slowS: 1.25, fastS: 0.95, fullSpeed: 10, keep: 0.9, most: 60, out: 0, lift: 0.6, liftPerSpeed: 0, stop: 1, away: 1.2, topple: 0.3,
        drag: 1.4, scrub: 1.6, bounce: 0,
        keys: [
            { at: 0.2, body: [10, 35, 0, 0], arms: [[80, 70, 0.3], [100, 40, 0.3]], legs: [[60, 22, 0.5], [55, 30, 0.45]] },
            { at: 0.5, body: [-50, 65, 10, -5], arms: [[60, 85, 0.15], [70, 60, 0.15]], legs: [[40, 15, 0.3], [50, 28, 0.45]] },
            { at: 0.78, body: [-80, 40, 5, 5], arms: [[20, 85, 0.1], [45, 80, 0.1]], legs: [[18, 14, 0.15], [38, 22, 0.4]] },
            { at: 1, body: [-86, 15, 0, 12], arms: [[15, 75, 0.15], [30, 82, 0.15]], legs: [[8, 12, 0.05], [28, 18, 0.35]] }
        ],
        sit: { body: [-18, 0, 0, 12], ...RIDER_SIT_BACK }
    },
    // Into the thing slower than it takes to go over the bars: forward onto the tank, then off to the low side
    slump: {
        of: 'front', when: { closing: [-Infinity, 7] },
        calm: 'tip', slowS: 1.4, fastS: 1.15, fullSpeed: 7, keep: 0.75, most: 5, out: 0.8, lift: 0.3, liftPerSpeed: 0, stop: 1, away: 0.3, topple: 0.9,
        drag: 1.5, scrub: 2.2, bounce: 0,
        keys: [
            { at: 0.25, body: [55, 10, 0, 0], arms: [[70, 25, 0.6], [70, 25, 0.6]], legs: [[60, 25, 0.6], [60, 25, 0.6]] },
            { at: 0.55, body: [30, 60, 10, 10], arms: [[40, 70, 0.3], [90, 40, 0.4]], legs: [[50, 25, 0.4], [60, 25, 0.5]] },
            { at: 0.8, body: [-30, 80, 10, 20], arms: [[30, 85, 0.25], [60, 50, 0.3]], legs: [[45, 18, 0.45], [50, 25, 0.5]] },
            { at: 1, body: [-80, 22, 0, 32], arms: [[25, 70, 0.2], [35, 80, 0.15]], legs: [[15, 14, 0.15], [40, 22, 0.5]] }
        ],
        sit: { body: [-15, 0, 0, 32], ...RIDER_SIT_BACK }
    },
    // Nothing under the bike: he falls with it, limbs loose, and has no slide of his own
    drop: {
        calm: false, slowS: 1.2, fastS: 0.9, fullSpeed: 14, keep: 1, most: 60, out: 0, lift: 0, liftPerSpeed: 0, stop: 0, away: 0, topple: 0,
        drag: 0, scrub: 0, bounce: 0, withBike: true, off: [1.1, 0.5, -0.4],
        keys: [
            { at: 0.25, body: [10, -15, 0, 0], arms: [[120, 50, 0.15], [140, 40, 0.1]], legs: [[45, 25, 0.35], [30, 30, 0.3]] },
            { at: 0.6, body: [-35, 25, 15, 20], arms: [[60, 85, 0.2], [150, 55, 0.25]], legs: [[70, 20, 0.6], [15, 28, 0.2]] },
            { at: 1, body: [-75, 40, 20, 45], arms: [[110, 70, 0.3], [40, 85, 0.1]], legs: [[20, 18, 0.2], [60, 26, 0.55]] }
        ]
    },
    // Over the edge slowly: he goes down feet first beside the bike, arms up
    dropFeet: {
        of: 'drop', when: { speed: [-Infinity, 10] },
        calm: false, slowS: 1.3, fastS: 1, fullSpeed: 10, keep: 1, most: 60, out: 0, lift: 0, liftPerSpeed: 0, stop: 0, away: 0, topple: 0,
        drag: 0, scrub: 0, bounce: 0, withBike: true, off: [0.9, 0.6, -0.2],
        keys: [
            { at: 0.3, body: [-10, 10, 0, 0], arms: [[150, 45, 0.2], [150, 45, 0.2]], legs: [[25, 20, 0.3], [30, 22, 0.3]] },
            { at: 0.65, body: [-30, 20, 10, 15], arms: [[120, 70, 0.2], [140, 55, 0.25]], legs: [[45, 18, 0.5], [20, 25, 0.25]] },
            { at: 1, body: [-60, 30, 15, 30], arms: [[100, 75, 0.3], [60, 85, 0.15]], legs: [[30, 16, 0.3], [55, 24, 0.5]] }
        ]
    },
    // Too slow to stay up: down beside the bike on the low side, and a short roll onto the back. Every slow crash is
    // this row, and goes over to its own by calmTo
    tip: {
        calm: false, slowS: 1.3, fastS: 0.95, fullSpeed: 6, keep: 1, most: 60, out: 0.5, lift: 0, liftPerSpeed: 0, stop: 0, away: 0, topple: 1.2,
        drag: 1, scrub: 2, bounce: 0, lean: { topple: 0.7, T: 0.85 },
        keys: [
            { at: 0.35, body: [10, 45, 0, 0], arms: [[40, 70, 0.2], [80, 30, 0.4]], legs: [[50, 30, 0.3], [60, 25, 0.5]] },
            { at: 0.7, body: [-25, 85, 10, 15], arms: [[30, 85, 0.25], [60, 50, 0.3]], legs: [[45, 18, 0.45], [50, 25, 0.5]] },
            { at: 1, body: [-80, 20, 0, 35], arms: [[25, 70, 0.2], [35, 80, 0.15]], legs: [[15, 14, 0.15], [40, 22, 0.5]] }
        ],
        sit: { body: [-15, 0, 0, 35], ...RIDER_SIT_BACK }
    },
    // Too slow to stay up with the land falling away on the low side: down, and rolling over down the bank
    tipRoll: {
        of: 'tip', when: { bank: [0.35, Infinity] },
        calm: false, slowS: 1.45, fastS: 1.2, fullSpeed: 6, keep: 1, most: 60, out: 0.8, lift: 0, liftPerSpeed: 0, stop: 0, away: 0, topple: 1.5,
        drag: 1, scrub: 1.4, bounce: 0,
        keys: [
            { at: 0.3, body: [10, 45, 0, 0], arms: [[40, 70, 0.2], [80, 30, 0.4]], legs: [[50, 30, 0.3], [60, 25, 0.5]] },
            { at: 0.55, body: [-60, 100, 0, 15], arms: [[110, 25, 0.7], [110, 25, 0.7]], legs: [[15, 10, 0.15], [15, 12, 0.15]] },
            { at: 0.8, body: [-86, 220, 0, 20], arms: [[105, 20, 0.75], [105, 20, 0.75]], legs: [[10, 8, 0.1], [12, 10, 0.1]] },
            { at: 1, body: [-88, 335, 0, 25], arms: [[60, 60, 0.3], [70, 55, 0.3]], legs: [[10, 12, 0.1], [25, 16, 0.3]] }
        ],
        sit: { body: [-18, 360, 0, 25], ...RIDER_SIT_BACK }
    }
});

// The kind of the rider's fall for a cause class: the class's kind, or the fallback
Vehicle.riderFallKind = (why) => Vehicle.CRASH_CAUSES[why] || Vehicle.RIDER_FALL.fallback;

// The row of a kind for a crash's numbers (Vehicle.riderCrash): the first variant of the kind whose `when` holds
// them all, else the kind's own row
Vehicle.riderFallRow = (kind, crash) => {
    const falls = Vehicle.RIDER_FALLS;
    for (const name in falls) {
        const row = falls[name];
        if (row.of !== kind) continue;
        let holds = true;
        for (const field in row.when) {
            const range = row.when[field], x = crash[field];
            if (!(x >= range[0] && x < range[1])) holds = false;
        }
        if (holds) return name;
    }
    return kind;
};

// The numbers of a fall from its row `k`, its calm row and the crash's numbers, into `out`: calm (the share of the
// calm row), T (the keys' time), along, out, lift, stop, away (the throw, m/s), topple (m), drag, scrub, bounce.
// Every one is a smooth function of the speed and the lean, so two crashes that differ a little fall a little apart
Vehicle.riderFallNumbers = (k, calm, crash, out) => {
    const rule = Vehicle.RIDER_FALL, speed = crash.speed;
    const ramp = (x) => { const u = Math.max(0, Math.min(1, x)); return u * u * (3 - 2 * u); };
    const share = calm ? 1 - ramp((speed - rule.calmFrom) / (rule.calmTo - rule.calmFrom)) : 0;
    const deep = ramp((crash.lean - rule.leanFrom) / (rule.leanTo - rule.leanFrom));
    const leaned = (row, field) => (row.lean && Number.isFinite(row.lean[field]) ? 1 + (row.lean[field] - 1) * deep : 1);
    const of = (row, field) => row[field] * leaned(row, field);
    const mix = (field) => (share > 0 ? of(k, field) + (of(calm, field) - of(k, field)) * share : of(k, field));
    const full = mix('fullSpeed');
    const thrown = ramp((speed - rule.walkSpeed) / (full - rule.walkSpeed));
    const time = (row) => (row.slowS + (row.fastS - row.slowS) * thrown) * leaned(row, 'T');
    out.calm = share;
    out.T = share > 0 ? time(k) + (time(calm) - time(k)) * share : time(k);
    out.along = Math.min(mix('most'), mix('keep') * speed);
    out.out = mix('out') * thrown;
    out.lift = (mix('lift') + mix('liftPerSpeed') * speed) * thrown;
    out.stop = mix('stop');
    out.away = mix('away') * thrown;
    out.topple = mix('topple');
    out.drag = mix('drag');
    out.scrub = mix('scrub');
    out.bounce = mix('bounce');
    return out;
};

// A pose between two keys of a fall: `out` takes [pitch, roll, twist, yaw, then swing, spread, bend for the low arm,
// the high arm, the low leg and the high leg], `share` of the way from key a to key b. With no `a` the pose `out`
// holds is the start (the sit-up blends from whatever pose he lay in)
Vehicle.riderPose = (a, b, share, out) => {
    for (let i = 0; i < 16; i++) {
        const limb = i < 4 ? null : i < 10 ? 'arms' : 'legs';
        const j = i < 4 ? i : (i - 4) % 6;
        const to = limb ? b[limb][j < 3 ? 0 : 1][j % 3] : b.body[i];
        const from = !a ? out[i] : limb ? a[limb][j < 3 ? 0 : 1][j % 3] : a.body[i];
        out[i] = from + (to - from) * share;
    }
    return out;
};

// The pose of a row's keys at `u`, the share of its time gone, into `out` (as Vehicle.riderPose fills it), and
// then `up` of the way to its `sit` key. Returns how far he is from the pose he rode in toward the keys: the
// smoothstep to the first key, then 1
Vehicle.riderKeyed = (row, u, up, out) => {
    const keys = row.keys;
    let n = 0;
    while (n < keys.length - 1 && u > keys[n].at) n++;
    const before = n > 0 ? keys[n - 1].at : 0;
    const x = keys[n].at > before ? Math.max(0, Math.min(1, (u - before) / (keys[n].at - before))) : 1;
    const e = x * x * (3 - 2 * x);
    if (n === 0) Vehicle.riderPose(keys[0], keys[0], 0, out);
    else Vehicle.riderPose(keys[n - 1], keys[n], e, out);
    if (up > 0 && row.sit) Vehicle.riderPose(null, row.sit, up * up * (3 - 2 * up), out);
    return n === 0 ? e : 1;
};

// What a rider's fall keeps from frame to frame, made once for a bike: his place and velocity, the turn he left the
// seat with and the turn he is drawn with, and every vector the fall works in (nothing is made while he falls)
Vehicle.riderFallState = () => ({
    on: false, kind: null, row: null, rule: null, calmRule: null, t: 0, T: 1, up: 0, slid: 0, speed: 0, heading: 0, low: 1, lean: 0, index: 0,
    grounded: false, toppled: 0, lowX: 0, lowZ: 0, ground: 0,
    crash: { speed: 0, lean: 0, closing: 0, into: 1, bank: 0, highBank: 0, grade: 0, hit: false, nx: 0, nz: 0 },
    fall: { calm: 0, T: 1, along: 0, out: 0, lift: 0, stop: 0, away: 0, topple: 0, drag: 0, scrub: 0, bounce: 0 },
    p: new THREE.Vector3(), v: new THREE.Vector3(), at: new THREE.Vector3(), seat: new THREE.Vector3(), calmPose: new Float64Array(16),
    q0: new THREE.Quaternion(), q: new THREE.Quaternion(), turn: new THREE.Quaternion(), euler: new THREE.Euler(),
    pose: new Float64Array(16), radius: new Float64Array(11),
    from: [0, 1, 2, 3].map(() => new THREE.Vector3()), end: [0, 1, 2, 3].map(() => new THREE.Vector3()),
    probe: Array.from({ length: 11 }, () => new THREE.Vector3()),
    hint: { index: 0 }, projection: {}, located: {}, range: { start: 0, end: 0 }, loc: {}
});
// A wheelie by the bike (Vehicle.wheelieOf, popShare, liftShare), from two facts of its catalogue entry: `kg` and
// `spare`. A bike of lightKg or less is wholly light and one of heavyKg or more not at all. Up to weightFrom m/s a pop
// is lightPop of the usual on a wholly light bike and heavyPop on a heavy one, and from weightTo m/s the weight no
// longer counts: at speed it is the power that lifts. fadeSpeed (m/s) is the speed at which a bike with all the power
// to spare has half its drive left for the front; a bike with less has half left sooner. `tug` is the share of a
// pop that is the rider's pull on the bars and needs no drive. `usual` stands in for a bike that names no facts.
Vehicle.WHEELIE = Object.freeze({ lightKg: 145, heavyKg: 250, lightPop: 1.15, heavyPop: 0.8, weightFrom: 10, weightTo: 30, fadeSpeed: 68, tug: 0.1, usual: Object.freeze({ kg: 190, spare: 0.55 }) });
// The two facts of a bike as a wheelie reads them, each 0 to 1: `light` and `spare`. `bike` is a catalogue id, a
// procedural kind, or an entry itself ({ kg, spare }), so a new bike needs nothing but its two numbers. The facts are
// set for a rider of RIDER_MASS.referenceKg; `riderKg` is the real rider: the weight is the bike's and the rider's over
// the reference rider's (lightKg and heavyKg stand for those bikes with that rider), and the power to spare is for each
// kg of both (spare x the reference total over the real one). A rider of the reference weight changes nothing
Vehicle.wheelieOf = (bike, riderKg = RIDER_MASS.referenceKg) => {
    const rule = Vehicle.WHEELIE;
    const entry = (bike && typeof bike === 'object' ? bike : (BIKE_MODELS[bike] || Vehicle.BIKES[bike])) || rule.usual;
    let kg = Number.isFinite(entry.kg) ? entry.kg : rule.usual.kg;
    let spare = Number.isFinite(entry.spare) ? entry.spare : rule.usual.spare;
    const more = Number.isFinite(riderKg) ? riderKg - RIDER_MASS.referenceKg : 0;
    if (more !== 0) {
        spare *= (kg + RIDER_MASS.referenceKg) / (kg + riderKg);
        kg += more;
    }
    const unit = (x) => Math.max(0, Math.min(1, x));
    return { light: unit((rule.heavyKg - kg) / (rule.heavyKg - rule.lightKg)), spare: unit(spare) };
};
// The share of its throttle lift a bike has left at a speed, 0 to 1: the whole of it at a standstill, less the faster
// it goes, and sooner the less power it has to spare; none at any speed for a bike with none. `facts` is what
// Vehicle.wheelieOf returns
Vehicle.liftShare = (facts, speed) => {
    if (!(facts.spare > 0)) return 0;
    const pace = Math.max(0, speed) / Vehicle.WHEELIE.fadeSpeed;
    return facts.spare / (facts.spare + pace * pace);
};
// How high a pop starts against the usual pop, by the bike and the speed: the bike's weight at low speed, times the
// rider's tug and the drive the bike has to spare at this speed
Vehicle.popShare = (facts, speed) => {
    const rule = Vehicle.WHEELIE;
    const x = Math.max(0, Math.min(1, (speed - rule.weightFrom) / (rule.weightTo - rule.weightFrom)));
    const slow = 1 - x * x * (3 - 2 * x);
    const weight = 1 + (rule.heavyPop + (rule.lightPop - rule.heavyPop) * facts.light - 1) * slow;
    return weight * (rule.tug + (1 - rule.tug) * Vehicle.liftShare(facts, speed));
};
Vehicle.BAR = Object.freeze({ counter: 0.12, counterMax: 0.16, intoMax: 0.07, lag: 0.12, directSpeed: 7 });
Vehicle.AXLE = new THREE.Vector3(1, 0, 0);
// The rider's body in a turn (Vehicle.riderLean), for a rider whose bodyLean is 1: `roll` rad of the rider's own roll
// for each rad of the bike's lean, and `shift` m across the seat at a lean of `full` rad and over. `usual` is the
// bodyLean of a rider who names none (0.57 x 0.35 is the 0.2 every rider had)
Vehicle.BODY = Object.freeze({ roll: 0.35, shift: 0.16, full: 0.87, usual: 0.57 });
// The stop pose (Vehicle.updateFooting): under STOP_SPEED (m/s) the bike leans FOOT_LEAN (radians) to its left and the
// left foot goes down, FOOT_OUT (m) out from the bike's centre plane and FOOT_AHEAD (m) ahead of the peg, over FOOT_S
// A wall with no line of its own (a rock face of the land): the face is looked for back toward the road in steps of
// FACE_STEP_M, as far as WorldPhysics.wallBrush.deepM; none found is a crash
Vehicle.FACE_STEP_M = 0.05;
Vehicle.STOP_SPEED = 0.3;
Vehicle.FOOT_LEAN = 6.5 * Math.PI / 180;
Vehicle.FOOT_OUT = 0.34;
Vehicle.FOOT_AHEAD = 0.08;
Vehicle.FOOT_S = 0.4;
// The bike on a world's drawn ground (Vehicle.groundPose): the ground across the bike is read `acrossM` (m) either side
// of the middle between its wheels, and every place is located within `segments` route segments of the bike's own; a
// foot put down lies on the ground's plane read `footM` (m) ahead of it and beside it. Ground read steeper than
// `steepMost` (rise over run) from the bike's middle is a face beside it, not ground under it: steeper than the steepest
// land a bike stands on (WorldPhysics offroad.top landSteepSlope, 1.5)
Vehicle.GROUND = Object.freeze({ acrossM: 0.4, segments: 10, footM: 0.15, steepMost: 1.6 });

// The steering axis of a bike in its own axes: the line of its fork legs, in the bike's centre plane, pointing up. A
// leg turned by its own rotation (the procedural forks, stood at their rake) gives it directly. A modelled leg is
// read from its surface, sampled evenly by area (a rod's few long faces count for their length): the middle of the
// legs at each height is the median of the samples there, since a tube's surface stands evenly round its line, and
// the axis is the line through those middles over the upper part, clear of the foot, the caliper and the hose.
Vehicle.steerAxis = (group, forks) => {
    const turned = forks.find(fork => fork && !fork.isLOD && Math.abs(fork.quaternion.w) < 1 - 1e-9);
    if (turned) {
        const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(turned.quaternion).setX(0).normalize();
        return axis.y < 0 ? axis.negate() : axis;
    }
    group.updateMatrixWorld(true);
    const into = group.matrixWorld.clone().invert();
    const triangles = [];
    const m = new THREE.Matrix4();
    for (const fork of forks) {
        if (!fork) continue;
        (fork.isLOD ? fork.levels[0].object : fork).traverse((o) => {
            if (!o.isMesh) return;
            m.multiplyMatrices(into, o.matrixWorld);
            const position = o.geometry.attributes.position;
            const index = o.geometry.index;
            const count = index ? index.count : position.count;
            const at = k => new THREE.Vector3().fromBufferAttribute(position, index ? index.getX(k) : k).applyMatrix4(m);
            for (let k = 0; k < count; k += 3) triangles.push([at(k), at(k + 1), at(k + 2)]);
        });
    }
    let total = 0;
    const area = triangles.map(([a, b, c]) => {
        const s = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).length() / 2;
        total += s;
        return s;
    });
    if (!total) return new THREE.Vector3(0, 1, 0);
    // About 40,000 samples on a regular grid of each triangle
    const samples = [];
    triangles.forEach(([a, b, c], n) => {
        const grid = Math.max(1, Math.round(Math.sqrt(area[n] / total * 40000)));
        for (let i = 0; i < grid; i++) {
            for (let j = 0; i + j < grid; j++) {
                const u = (i + 1 / 3) / grid, w = (j + 1 / 3) / grid;
                samples.push([a.y + (b.y - a.y) * u + (c.y - a.y) * w, a.z + (b.z - a.z) * u + (c.z - a.z) * w]);
            }
        }
    });
    let low = Infinity, high = -Infinity;
    for (const [y] of samples) { low = Math.min(low, y); high = Math.max(high, y); }
    const SLICES = 12;
    const line = [];
    for (let n = 0; n < SLICES; n++) {
        const from = low + (high - low) * (0.4 + 0.55 * n / SLICES), to = low + (high - low) * (0.4 + 0.55 * (n + 1) / SLICES);
        const zs = samples.filter(([y]) => y >= from && y < to).map(([, z]) => z).sort((p, q) => p - q);
        if (zs.length >= 6) line.push([(from + to) / 2, zs[zs.length >> 1]]);
    }
    if (line.length < 3) return new THREE.Vector3(0, 1, 0);
    // z against y by least squares: the axis climbs dz/dy
    const my = line.reduce((s, [y]) => s + y, 0) / line.length;
    const mz = line.reduce((s, [, z]) => s + z, 0) / line.length;
    let syy = 0, syz = 0;
    for (const [y, z] of line) { syy += (y - my) ** 2; syz += (y - my) * (z - mz); }
    return new THREE.Vector3(0, 1, syz / syy).normalize();
};

// Where the elbow or knee of a two-part limb lies: the parts keep their
// lengths `a` and `b`, and the joint stands off the line between the ends
// toward `toward`. A reach longer than the limb leaves it all but straight,
// both parts stretched alike to span it.
// `out` takes the answer with nothing allocated (a rider's fall places four limbs every frame: Vehicle.drawRiderFall).
Vehicle.joint = (from, to, a, b, toward, out = null) => {
    const scratch = out && (Vehicle.jointScratch || (Vehicle.jointScratch = { line: new THREE.Vector3(), bend: new THREE.Vector3() }));
    const line = (scratch ? scratch.line : new THREE.Vector3()).subVectors(to, from);
    const reach = line.length();
    const stretch = Math.max(1, reach / ((a + b) * 0.995));
    a *= stretch;
    b *= stretch;
    line.normalize();
    const along = (a * a - b * b + reach * reach) / (2 * reach);
    const off = Math.sqrt(Math.max(0, a * a - along * along));
    const bend = (scratch ? scratch.bend.copy(toward) : toward.clone()).addScaledVector(line, -toward.dot(line)).normalize();
    return (out ? out.copy(from) : from.clone()).addScaledVector(line, along).addScaledVector(bend, off);
};

// A rider's arm or leg as rigid pieces, for the poses Vehicle draws (the hands on a steered bar, the foot down at a
// stop): the first piece turns about the root (the shoulder, the hip) and the second about the middle joint (the
// elbow, the knee), each stretched only if the end is further than the limb reaches; whatever rides on a joint (the
// knee cap, the glove, the boot and its sole) moves with it. Points are in the rider's axes. `drop` is how far
// below the end the lowest point of what the end carries is (a boot's sole under the ankle).
Vehicle.rigLimb = ({ rider, root, mid, end, pieces, carried }) => {
    const rest = { root: root.clone(), mid: mid.clone(), end: end.clone() };
    const a = root.distanceTo(mid), b = mid.distanceTo(end);
    const toward = mid.clone().sub(root.clone().add(end).multiplyScalar(0.5));
    const held = pieces.map(([object, from, to]) => ({
        object, from, to, along: rest[to].clone().sub(rest[from]), unit: rest[to].clone().sub(rest[from]).normalize(),
        quaternion: object.quaternion.clone(), scale: object.scale.y, position: object.position.clone()
    }));
    const riding = Object.entries(carried).flatMap(([at, list]) => list.map(object => ({
        object, at, offset: object.position.clone().sub(rest[at]), quaternion: object.quaternion.clone(), position: object.position.clone()
    })));
    let drop = 0;
    if (rider) {
        rider.updateMatrixWorld(true);
        const into = rider.matrixWorld.clone().invert();
        const box = new THREE.Box3();
        const m = new THREE.Matrix4();
        const v = new THREE.Vector3();
        for (const { object, at } of riding) {
            if (at !== 'end') continue;
            object.traverse((o) => {
                if (!o.isMesh) return;
                m.multiplyMatrices(into, o.matrixWorld);
                const position = o.geometry.attributes.position;
                for (let i = 0; i < position.count; i++) box.expandByPoint(v.fromBufferAttribute(position, i).applyMatrix4(m));
            });
        }
        if (!box.isEmpty()) drop = end.y - box.min.y;
    }
    const turn = new THREE.Quaternion();
    const now = { root: rest.root };
    const bent = new THREE.Vector3(), span = new THREE.Vector3(), unit = new THREE.Vector3();
    return {
        root: rest.root, end: rest.end, drop, reach: a + b,
        // What the end carries (the glove; the boot and its sole)
        ends: riding.filter(item => item.at === 'end').map(item => item.object),
        // Where the end and the middle joint are drawn now
        at: () => now.end || rest.end,
        mid: () => now.mid || rest.mid,
        // The limb exactly as it was built: every piece and what it carries, to the last bit
        rest() {
            now.end = undefined;
            now.mid = undefined;
            for (const piece of held) {
                piece.object.quaternion.copy(piece.quaternion);
                piece.object.position.copy(piece.position);
                piece.object.scale.y = piece.scale;
            }
            for (const item of riding) {
                item.object.position.copy(item.position);
                item.object.quaternion.copy(item.quaternion);
            }
        },
        // The end to `to`, what it carries turned by `endTurn` about it (the rest pose for the rest end and no turn).
        // Nothing is allocated: a fall places every limb each frame
        place(to, endTurn) {
            now.end = to;
            now.mid = Vehicle.joint(rest.root, to, a, b, toward, bent);
            for (const piece of held) {
                const along = span.copy(now[piece.to]).sub(now[piece.from]);
                turn.setFromUnitVectors(piece.unit, unit.copy(along).normalize());
                piece.object.quaternion.copy(turn).multiply(piece.quaternion);
                piece.object.position.addVectors(now[piece.from], now[piece.to]).multiplyScalar(0.5);
                piece.object.scale.y = piece.scale * along.length() / piece.along.length();
            }
            for (const item of riding) {
                const spin = item.at === 'end' && endTurn ? endTurn : null;
                item.object.position.copy(item.offset);
                if (spin) item.object.position.applyQuaternion(spin);
                item.object.position.add(now[item.at]);
                item.object.quaternion.copy(item.quaternion);
                if (spin) item.object.quaternion.premultiply(spin);
            }
        }
    };
};

// A scarf round the rider's neck, `neck` up the torso from its centre: a
// thick loop under the helmet and two ends streaming back off the shoulders
Vehicle.buildScarf = (colour, lean, neck) => {
    const material = new THREE.MeshStandardMaterial({ name: 'scarf', color: colour, roughness: 0.95, metalness: 0 });
    const up = new THREE.Vector3(0, Math.cos(lean), Math.sin(lean));
    const back = new THREE.Vector3(0, Math.sin(lean), -Math.cos(lean));
    const scarf = new THREE.Group();
    scarf.name = 'scarf';
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.04, 8, 16), material);
    loop.position.copy(up).multiplyScalar(neck);
    loop.rotation.x = lean - Math.PI / 2;
    loop.scale.set(1.12, 1, 0.85);
    scarf.add(loop);
    // Each end leaves the back of the loop and droops as it trails
    [[-0.045, 0.26, 0.22], [0.035, 0.2, -0.16]].forEach(([x, length, twist]) => {
        const end = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, length), material);
        end.position.copy(up).multiplyScalar(neck - 0.03 - length * 0.18).addScaledVector(back, 0.1 + length * 0.45).setX(x);
        end.rotation.set(lean + 0.38, twist, twist * 0.6);
        scarf.add(end);
    });
    scarf.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return scarf;
};

const knownBike = (id) => !!(BIKE_MODELS[id] || Vehicle.BIKES[id]);

// The bike a character rides by default: the first they own
Vehicle.bikeOf = (character) => {
    const first = character && Array.isArray(character.bikes) ? character.bikes[0] : null;
    return knownBike(first) ? first : 'sport';
};

// The outfit a character wears: the one with the id `outfitId` when they have
// it, else their first; null for a character with no outfits
Vehicle.outfitOf = (character, outfitId) => {
    const outfits = character && Array.isArray(character.outfits) ? character.outfits : [];
    return outfits.find((outfit) => outfit.id === outfitId) || outfits[0] || null;
};

// The bike a vehicle is: `bikeId` when the character owns it, else their first
Vehicle.modelOf = (character, bikeId) => {
    const owned = character && Array.isArray(character.bikes) ? character.bikes : [];
    return bikeId && knownBike(bikeId) && owned.includes(bikeId) ? bikeId : Vehicle.bikeOf(character);
};

// The procedural kind (Vehicle.BIKES) a bike is built as
Vehicle.kindOf = (id) => (BIKE_MODELS[id] ? BIKE_MODELS[id].kind : (Vehicle.BIKES[id] ? id : 'sport'));

// How much of an off-road bike a bike is, 0 to 1: the catalogue entry's own
// trait, so it is the same before and after the bike's file loads
Vehicle.offroadOf = (id) => {
    const bike = BIKE_MODELS[id] || Vehicle.BIKES[id];
    return Math.max(0, Math.min(1, (bike && bike.offroad) || 0));
};

// The class physics of a bike: a detailed bike's class, scaled for a light
// one; a procedural kind has none of its own
Vehicle.classOf = (id) => {
    const bike = BIKE_MODELS[id];
    if (!bike) return null;
    const base = BIKE_CLASSES[bike.cls];
    if (!bike.light) return base;
    return Object.fromEntries(Object.entries(base).map(([key, value]) => [key, value * LIGHT_BIKE[key]]));
};

// The physics multipliers of a character on a bike. The character's own are
// them on their first bike, so that bike takes them unchanged; another bike
// scales each one by its class against the first bike's.
Vehicle.physicsOf = (character, id) => {
    const physics = { ...(character && character.physics) };
    const first = Vehicle.bikeOf(character);
    const from = Vehicle.classOf(first);
    const to = Vehicle.classOf(id);
    if (id === first || !from || !to) return physics;
    for (const key of Object.keys(to)) {
        const base = physics[key] !== undefined ? physics[key] : 1;
        const [low, high] = BIKE_LIMITS[key];
        physics[key] = Math.min(high, Math.max(low, base * to[key] / from[key]));
    }
    return physics;
};

// The stars of the rider select, 1 to 5 a bar, for a character on a bike. A
// bar reads one number of Vehicle.physicsOf over `from` (1 star) to `to` (5
// stars), a range chosen so that the first bikes read as their cards did when
// the stars were written by hand; `offroad` adds that many stars for a whole
// off-road bike (BIKE_MODELS `offroad`); and `traits` names the rider's own
// part, the mean of those traits, which is RIDER_SHARE of the bar. The bike's
// class and a light bike are in the physics already.
const STAT_BARS = {
    speed: { physics: 'maxSpeed', from: 0.7, to: 1.2, traits: ['country', 'mountain'] },
    accel: { physics: 'acceleration', from: 0.65, to: 1.25 },
    // The rider's part of the handling is the pace round hairpins and the lean the rider dares (RIDER_LEAN)
    handling: { physics: 'steeringForce', from: 0.9, to: 1.15, traits: ['hairpins', 'daring'] },
    jump: { physics: 'jumpPower', from: 0.5, to: 1.6, offroad: 1.75, traits: ['daring'] },
    comfort: { physics: 'comfortShake', from: 1.4, to: 0.3 }
};
// A fifth of a bar is the rider: enough to move a star, never enough to hide the bike
const RIDER_SHARE = 0.2;
// A trait a character does not have: the middle of the scale, which moves no bar far
const TRAIT_MIDDLE = 3;

// How far a rider dares to lean: a multiplier of the bike's lean limit by one trait of the rider, on a straight line
// from `least` (the trait at 1) to `most` (at 5). The middle of the scale is the owner's tuned 1.08. No code names a
// rider: a character gets its limit from the trait alone
const RIDER_LEAN = Object.freeze({ trait: 'daring', least: 1.02, most: 1.14 });

// A character's trait, 1 to 5; the middle for a character without it
Vehicle.traitOf = (character, name) => {
    const value = character && character.traits ? character.traits[name] : undefined;
    return Number.isFinite(value) ? Math.max(1, Math.min(5, value)) : TRAIT_MIDDLE;
};

// The rider's multiplier of the bike's lean limit (RIDER_LEAN)
Vehicle.leanOf = (character) => RIDER_LEAN.least + (RIDER_LEAN.most - RIDER_LEAN.least) * (Vehicle.traitOf(character, RIDER_LEAN.trait) - 1) / 4;
Vehicle.RIDER_LEAN = RIDER_LEAN;

// The mass of the bike and its rider in the handling (.agent/system/handling.md, "The rider's weight"). The bikes'
// numbers were set for a rider of referenceKg. Each number in `power` moves by (reference / total) ^ power, where total
// is the bike's kg and the rider's (CHARACTERS `kg`) and reference the bike's kg and referenceKg. The acceleration is
// power to weight (1). The lean rate, in and out, is slower with more to roll (0.5). The brake a little: the same tyres
// hold a heavier load nearly as well, and only the lever and the pads do not grow with it (0.2). The top speed not at
// all: the air holds it, not the mass. The wheelie reads the total too (Vehicle.wheelieOf). A rider of referenceKg, and
// a character with no kg, moves nothing, to the last bit; a weight outside leastKg to mostKg is held to it
const RIDER_MASS = Object.freeze({
    referenceKg: 80, leastKg: 40, mostKg: 150,
    power: Object.freeze({ acceleration: 1, steeringForce: 0.5, brakeForce: 0.2, maxSpeed: 0 })
});
Vehicle.RIDER_MASS = RIDER_MASS;

// A character's weight in kg: their own `kg` held to the table's range, else the reference rider's
Vehicle.riderKgOf = (character) => {
    const kg = character ? character.kg : undefined;
    return Number.isFinite(kg) ? Math.max(RIDER_MASS.leastKg, Math.min(RIDER_MASS.mostKg, kg)) : RIDER_MASS.referenceKg;
};

// A bike's own kg: the catalogue entry's, or its procedural kind's, or the usual bike's (Vehicle.WHEELIE)
Vehicle.bikeKgOf = (id) => {
    const entry = BIKE_MODELS[id] || Vehicle.BIKES[id] || Vehicle.BIKES[Vehicle.kindOf(id)];
    return entry && Number.isFinite(entry.kg) ? entry.kg : Vehicle.WHEELIE.usual.kg;
};

// The reference mass over the real one for a character on a bike: 1 exactly for a rider of referenceKg
Vehicle.massShare = (character, id) => {
    const rider = Vehicle.riderKgOf(character);
    if (rider === RIDER_MASS.referenceKg) return 1;
    const bike = Vehicle.bikeKgOf(id);
    return (bike + RIDER_MASS.referenceKg) / (bike + rider);
};

// The multiplier of one number of Vehicle.physicsOf by the mass (RIDER_MASS power): 1 exactly for a field the mass
// does not move or a rider of referenceKg
Vehicle.massScale = (character, id, field) => {
    const power = RIDER_MASS.power[field] || 0;
    const share = power === 0 ? 1 : Vehicle.massShare(character, id);
    return share === 1 ? 1 : Math.pow(share, power);
};

// The multipliers of a character on a bike as the handling reads them: Vehicle.physicsOf (the rider's own, scaled by
// the bike's class) times the mass of the two (Vehicle.massScale). A field is written only where the mass moves it
Vehicle.pairOf = (character, id) => {
    const physics = Vehicle.physicsOf(character, id);
    for (const field of Object.keys(RIDER_MASS.power)) {
        const scale = Vehicle.massScale(character, id, field);
        if (scale !== 1) physics[field] = (physics[field] !== undefined ? physics[field] : 1) * scale;
    }
    return physics;
};

// The most a bike itself leans before something under it grounds (BIKE_MODELS `field`), in a world's degrees:
// no rider's daring, rider mode or tuning leans it further. `legPerWorld` turns it into a classic leg's lean, whose
// base limit (the lean at which a leg's bike falls, PI / 2.7) stands where a world's leanCapDeg (50) stands
const BIKE_LEAN = Object.freeze({ field: 'leanMaxDeg', legPerWorld: (180 / 2.7) / 50 });
Vehicle.BIKE_LEAN = BIKE_LEAN;

// A bike's own lean limit in degrees, Infinity for a bike held by the grip and the rider alone
Vehicle.leanMostOf = (id) => {
    const entry = BIKE_MODELS[id] || Vehicle.BIKES[id];
    const deg = entry ? entry[BIKE_LEAN.field] : undefined;
    return Number.isFinite(deg) && deg > 0 ? deg : Infinity;
};

// A rider who cannot put a foot down on a slope (CHARACTERS `trait`, Vehicle.footReach). Once the bike has moved off
// (over armSpeed m/s since the ride began or the last restart), a stop (under stopSpeed m/s) for stopS on ground
// steeper than the rider's angle tips the bike over to the downhill side, with `cause` and the class `foot`. Slowing
// under hintSpeed m/s on that ground the game tells the rider once (Game.sayFoot), and again only after the bike has
// been over hintSpeed + hintBand. The slope across the bike picks the side when it is more than sideShare of the
// whole; a bike that faces up or down the slope goes over to the side of the foot the rider reaches for. `leastRoll`
// (rad) gives a bike that stood upright a side to start its fall to
const FOOT_REACH = Object.freeze({
    trait: 'footSlopeDeg', armSpeed: 2, stopSpeed: 0.5, stopS: 0.5, hintSpeed: 3, hintBand: 1, sideShare: 0.1, leastRoll: 0.05,
    cause: 'Could not reach the ground on the slope'
});
Vehicle.FOOT_REACH = FOOT_REACH;

// The steepest ground a character's foot reaches at a stop, as rise over run: Infinity for a character without the trait
Vehicle.footSlopeOf = (character) => {
    const deg = character ? character[FOOT_REACH.trait] : undefined;
    return Number.isFinite(deg) && deg >= 0 && deg < 90 ? Math.tan(deg * Math.PI / 180) : Infinity;
};

// A bar reads the pair: the rider's own multipliers on this bike and the mass of the two (Vehicle.pairOf)
Vehicle.statsOf = (character, id) => {
    const ridden = id || Vehicle.bikeOf(character);
    const physics = Vehicle.pairOf(character, ridden);
    const offroad = Vehicle.offroadOf(ridden);
    const stars = {};
    for (const [name, bar] of Object.entries(STAT_BARS)) {
        const value = physics[bar.physics] !== undefined ? physics[bar.physics] : 1;
        const bike = Math.max(1, Math.min(5, 1 + 4 * (value - bar.from) / (bar.to - bar.from) + (bar.offroad || 0) * offroad));
        const rider = bar.traits ? bar.traits.reduce((sum, trait) => sum + Vehicle.traitOf(character, trait), 0) / bar.traits.length : bike;
        stars[name] = Math.max(1, Math.min(5, Math.round(bike * (1 - RIDER_SHARE) + rider * RIDER_SHARE)));
    }
    return stars;
};

// The rider-select text of a bike: its descriptive name and year
Vehicle.bikeTitle = (id) => {
    const bike = BIKE_MODELS[id];
    return bike ? `${bike.name} (${bike.year})` : id;
};
