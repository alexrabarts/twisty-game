// Race timing helpers: the time and the split deltas. Pure functions, so the
// rules can be tested without the game. These feed the HUD timer, the
// checkpoint split popup, the finish screen and the tour map's best times.
const RaceTiming = {
    // m:ss.cc - hundredths are enough to tell two close runs apart on screen
    formatTime(ms) {
        if (!Number.isFinite(ms) || ms < 0) return '-:--.--';
        const hundredths = Math.floor(ms / 10);
        const minutes = Math.floor(hundredths / 6000);
        const seconds = Math.floor(hundredths / 100) % 60;
        const cs = hundredths % 100;
        return `${minutes}:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    },

    // Signed gap: negative means ahead of the reference
    delta(current, reference) {
        if (!Number.isFinite(current) || !Number.isFinite(reference)) return null;
        return current - reference;
    },

    formatDelta(ms) {
        if (!Number.isFinite(ms)) return '';
        const sign = ms < 0 ? '-' : '+';
        const abs = Math.abs(ms);
        if (abs >= 60000) return sign + RaceTiming.formatTime(abs);
        return `${sign}${(Math.floor(abs / 10) / 100).toFixed(2)}`;
    },

    // 'ahead' (green), 'behind' (red) or 'even'; rounds to the shown hundredth
    deltaClass(ms) {
        if (!Number.isFinite(ms)) return 'none';
        const shown = Math.trunc(ms / 10);
        if (shown < 0) return 'ahead';
        if (shown > 0) return 'behind';
        return 'even';
    },

    // What the split popup shows when gate `index` (0-based) is passed
    split(index, elapsed, bestSplits, record) {
        const pb = bestSplits ? RaceTiming.delta(elapsed, bestSplits[index]) : null;
        const rec = record && record.checkpointTimes ? RaceTiming.delta(elapsed, record.checkpointTimes[index]) : null;
        return { index, elapsed, pbDelta: pb, recordDelta: rec };
    }
};
