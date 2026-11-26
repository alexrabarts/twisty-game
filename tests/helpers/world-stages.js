// The stages a world test rides: the legs shipped before the tour and every built leg of the tour (js/world/tour.js).
// `WORLD_STAGES=<id,id>` narrows a run to some of them.
import { loadScript } from './load-game.js';

const WorldTour = new Function(`${loadScript('world/tour.js')}\nreturn WorldTour;`)();

export const TOUR_STAGES = WorldTour.built().map(leg => leg.id);
export const ALL_STAGES = [...WorldTour.EARLIER.map(leg => leg.id), ...TOUR_STAGES];

export function stagesFor(list = ALL_STAGES) {
    const only = process.env.WORLD_STAGES ? process.env.WORLD_STAGES.split(',') : null;
    return only ? list.filter(id => only.includes(id)) : list;
}
