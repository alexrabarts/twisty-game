# Sequential progress

One job at a time, in the order A to H. Each entry: the job, the commit, what the check proves, what is left.

## A. The black screen (old job 6)

- Commit: `7f055f7`
- Cause: a bike put down on a ride vertex's exact `s` took a NaN height (0 / 0 in `Vehicle.updateElevation`). The NaN reached the fog density, and bloom spread it over the frame.
- Check: `tests/unit/world-finite.test.js` (5 of 9 tests fail on `925d864`, 9 pass now) and the GPU probe `node tools/terrain-check.mjs world-vertex --world tremola --gpu`. The probe fails at 17 of 28 put-downs on `925d864` (black or one flat colour) and has no failure now.
- Left: nothing.
