// A switchback ladder: three straight legs joined by two 180 degree hairpins,
// so the road runs back over itself `separation` metres from its own line.
// Samples are {x, y, z, heading, width}, heading as the game has it (forward
// is (sin h, cos h), heading grows in a right turn). Pure and deterministic.
export function ladder({ separation = 25, legLength = 72, spacing = 4, width = 10 } = {}) {
    const radius = separation / 2;
    const arcLength = Math.PI * radius;
    const pieces = [
        { length: legLength, turn: 0 },
        { length: arcLength, turn: Math.PI },
        { length: legLength, turn: 0 },
        { length: arcLength, turn: -Math.PI },
        { length: legLength, turn: 0 }
    ];
    const total = pieces.reduce((sum, piece) => sum + piece.length, 0);
    const count = Math.round(total / spacing);
    const step = total / count;
    const points = [];
    let x = 0;
    let z = 0;
    let heading = Math.PI / 2;
    let into = 0;
    let index = 0;
    let climbed = 0;
    for (let n = 0; n <= count; n++) {
        points.push({ x, y: climbed, z, heading, width });
        let left = step;
        while (left > 1e-9 && index < pieces.length) {
            const piece = pieces[index];
            const run = Math.min(left, piece.length - into);
            const rate = piece.turn / piece.length;
            const mid = heading + rate * run / 2;
            x += Math.sin(mid) * run;
            z += Math.cos(mid) * run;
            heading += rate * run;
            into += run;
            left -= run;
            if (piece.length - into < 1e-9) {
                index++;
                into = 0;
            }
        }
        climbed += step * 0.08;
    }
    return points;
}
