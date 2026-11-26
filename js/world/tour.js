// WorldTour: the loop the owner chose (2026-11-26), Airolo round five passes and back, in twelve legs. Each leg starts
// at the stop where the leg before it ended. The one table the game and the tools read: the menu's leg list
// (WorldLegs), the data folder of a stage (WorldData.FOLDERS) and the stages the tools derive from a folder's ride
// (tools/world/tour.mjs).
//
// A leg is a stage of a data folder's ride. `stage` alone: the importer made it (a slice of tools/world/route.json).
// `base` and `dir`: the tools derive it from the base stage's ride, `dir` 1 the way the ride runs, -1 against it,
// between two stops of that folder (`start`, `end`: stop ids of its manifest). Direction is a property of the stage:
// the data is the same, and the game reads it as the stage rides it (WorldData.useStage). A row with no folder is a
// leg not built yet: it is listed, and closed.
//
// `pass` groups the menu's rows; a group is a run of rows with one pass.
const WorldTour = {
    LEGS: Object.freeze([
        { n: 1, id: 'airolo-lookout', folder: 'worlds/airolo/', pass: 'Gotthard', name: 'Airolo up the pass road to the lookout', km: 10.7, note: 'Up the modern pass road from the valley, its bridges and galleries, round the Motto Bartola bend.', from: 'The station car park at Airolo', to: 'The lookout over Airolo' },
        { n: 2, id: 'lookout-andermatt', folder: 'worlds/gotthard/', base: 'gotthard-north', dir: -1, start: 'gotthard-north-end', end: 'gotthard-north-start', pass: 'Gotthard', name: 'The lookout over the summit to Andermatt', km: 14.5, note: 'Up through the galleries to the summit, past the hospice square, and down the north side.', from: 'The lookout over Airolo', to: 'A hotel car park in Andermatt' },
        // (legs 3 and 4 meet at Göschenen, not at Wassen: the map has no car park or rest area at Wassen a rider can
        // reach, only the motorway's services, and none on the Susten road before the pass; Göschenen's station car
        // park is the last before Wassen)
        { n: 3, id: 'andermatt-goeschenen', folder: 'worlds/susten/', start: 'andermatt-goeschenen-start', end: 'andermatt-goeschenen-end', pass: 'Schöllenen', name: 'Andermatt through the Schöllenen to Göschenen', km: 6.4, note: 'Down the gorge through its tunnels and galleries and over the Devil\'s Bridge.', from: 'A hotel car park in Andermatt', to: 'The station car park at Göschenen' },
        { n: 4, id: 'goeschenen-susten', folder: 'worlds/susten/', start: 'andermatt-goeschenen-end', end: 'goeschenen-susten-end', pass: 'Susten', name: 'Göschenen down to Wassen and up to the Susten pass', km: 21.9, note: 'Down the valley to Wassen, then the long climb of the Meiental to the pass.', from: 'The station car park at Göschenen', to: 'The car park at the Susten pass' },
        { n: 5, id: 'susten-gadmen', folder: 'worlds/susten/', start: 'goeschenen-susten-end', end: 'susten-gadmen-end', pass: 'Susten', name: 'The Susten pass down to Gadmen', km: 15.8, note: 'Down the west side past the glacier and its hairpins to the village.', from: 'The car park at the Susten pass', to: 'The car park at Gadmen' },
        { n: 6, pass: 'Susten', name: 'Gadmen to Innertkirchen', km: 12.3 },
        { n: 7, pass: 'Grimsel', name: 'Innertkirchen to Guttannen', km: 8.5 },
        { n: 8, pass: 'Grimsel', name: 'Guttannen up to the Grimsel pass', km: 17.8 },
        { n: 9, pass: 'Furka', name: 'The Grimsel down to Gletsch and up to the Furka pass', km: 16.4 },
        { n: 10, pass: 'Furka', name: 'The Furka pass down to Hospental', km: 18.2 },
        { n: 11, id: 'hospental-summit', folder: 'worlds/gotthard/', base: 'gotthard-north', dir: 1, start: 'gotthard-north-via-2', end: 'gotthard-north-via-1', pass: 'Gotthard', name: 'Hospental up to the Gotthard summit', km: 8.9, note: 'The north road from the village up the open valley to the hospice square.', from: 'The car park at Hospental', to: 'The hospice square at the summit' },
        { n: 12, id: 'summit-airolo', folder: 'world/', base: 'tremola', dir: -1, start: 'tremola-end', end: 'tremola-start', pass: 'Gotthard', name: 'The summit down the Tremola to Airolo', km: 12.5, note: 'Down the old cobbled road and its stacked hairpins to the valley.', from: 'The hospice square at the summit', to: 'The station car park at Airolo' }
    ].map(Object.freeze)),

    // The legs shipped before the tour: still on the menu, with their boards, after the tour's
    EARLIER: Object.freeze([
        { id: 'gotthard-north', folder: 'worlds/gotthard/', pass: 'Earlier legs', name: 'Andermatt over the Gotthard to the lookout over Airolo', km: 14.5, note: 'A gentle run-in from the north, past the hospice square, then down the modern pass road through the galleries.', from: 'A hotel car park in Andermatt', to: 'The lookout over Airolo', open: true },
        { id: 'tremola', folder: 'world/', pass: 'Earlier legs', name: 'Tremola, Airolo to the Gotthard summit', km: 13.2, note: 'The old cobbled road and its hairpins.', from: 'Airolo', to: 'The Gotthard summit', open: true }
    ].map(Object.freeze)),

    // The tour's legs that are built (a folder holds them), in tour order
    built() { return WorldTour.LEGS.filter(leg => leg.folder); },

    // Every data folder and the stages it holds
    folders() {
        const out = {};
        for (const leg of [...WorldTour.LEGS, ...WorldTour.EARLIER]) {
            if (!leg.folder) continue;
            (out[leg.folder] = out[leg.folder] || []).push(leg.id);
        }
        return out;
    }
};
