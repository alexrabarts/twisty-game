// A small long-leg course for tests and probes: 150 segments (6 sections of 25),
// three parts, one of each join. It ships no leg: a test installs it on its own
// game instance, on top of the row named by FIXTURE_LEG, with Terrain.adopt.
//
//   A  0-50    open valley with a river
//   B  50-100  forest; the join from A is a morph over segments 40-60; a tunnel at 70-76
//   C  100-150 cliff road over a lake; the join from B is a cut at 100; roadworks at 120
//
// Built from a Terrain, because each loadGame() has its own.
export const FIXTURE_LEG = 'mountain-dawn';

export function fixtureCourse(Terrain) {
    const valley = {
        id: 'valleyOpen',
        floor: { kind: 'river', below: 3.0, side: 1, from: 35, to: 50 },
        ...Terrain.valleyFloorSides(() => 0)
    };
    const forest = Terrain.forestProfile({ elevation: () => 0, amplitude: 3, reach: 130 });
    // Not Terrain.profiles.cliffLake: that one keeps the frozen column walk of the high-pass golden
    const lakeFloor = Terrain.profiles.cliffLake.floor;
    const cliff = { id: 'cliffLake', floor: lakeFloor, ...Terrain.cliffSides() };
    return {
        id: 'fixture',
        segments: 150,
        roadWidth: 16,
        // Bends stay at 0.035 or less; every set piece, join and gate stands on a straight
        layout: [
            { segments: 30, turnRate: 0 }, { segments: 10, turnRate: 0.03 }, { segments: 20, turnRate: 0 },
            { segments: 8, turnRate: -0.03 }, { segments: 16, turnRate: 0 }, { segments: 8, turnRate: 0.035 },
            { segments: 18, turnRate: 0 }, { segments: 8, turnRate: -0.035 }, { segments: 7, turnRate: 0 },
            { segments: 10, turnRate: 0.03 }, { segments: 15, turnRate: 0 }
        ],
        elevation: { points: [[0, 20], [40, 28], [100, 40], [150, 32]], roll: 0 },
        gates: [45, 95, 148],
        roadworks: [{ at: 120, type: 'major' }],
        traffic: { oncomingEvery: 50 },
        parts: [
            {
                id: 'valley', from: 0, to: 50, profile: valley,
                look: { grassColor: 0x4a7c4a, mountainColor: 0x6b5c42, fogDensity: 0.0015 },
                render: { cullMax: 800 },
                timeOfDay: 'dawn', weather: 'clear',
                dressing: { forest: { coniferShare: 0, snowy: false, layout: { perSegment: [1, 3], offset: 6, reach: 104, exclude: [{ sign: 1, from: 33, to: 52 }] } }, outcrops: { perSegment: 0 }, rockfall: 0, backdrop: [] },
                landmark: { id: 'valley-bridge', at: 25 }
            },
            {
                id: 'forest', from: 50, to: 100, profile: forest, join: 'morph', blend: 20,
                look: { grassColor: 0x2f5a2f, mountainColor: 0x5a4c3a, fogDensity: 0.004 },
                render: { cullMax: 600 },
                timeOfDay: 'golden', weather: 'clear',
                setPieces: [{ type: 'tunnel', at: 20, length: 6 }],
                dressing: { forest: { coniferShare: 0.8, snowy: false, layout: { perSegment: [4, 6], offset: 5, reach: 77, exclude: [] } }, outcrops: { perSegment: 1 }, rockfall: 0, backdrop: [] },
                landmark: { id: 'forest-hut', at: 85 }
            },
            {
                id: 'lake', from: 100, to: 150, profile: cliff, join: 'cut', blend: 12,
                look: { grassColor: 0x3a6c3a, mountainColor: 0x8b8b8b, fogDensity: 0.002 },
                render: { cullMax: 800, shadowSpan: 200 },
                timeOfDay: 'twilight', weather: 'rain', weatherIntensity: 0.5,
                dressing: { forest: { coniferShare: 0.9, snowy: false }, outcrops: { perSegment: 2 }, rockfall: 0.25, backdrop: [] },
                landmark: { id: 'lake-pier', at: 125 }
            }
        ]
    };
}
