// Race timing helpers: splits, deltas and the stored personal-best splits.
// The gate count belongs to the leg (env.checkpoints.length), so every helper
// that needs it takes it as an argument.
// Pure functions (storage is passed in) so the rules can be tested without
// the game. Time is the ranking factor; these feed the HUD timer, the
// checkpoint split popup and the finish screen.
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

    validSplits(splits, count) {
        if (!Array.isArray(splits) || splits.length !== count) return false;
        for (let i = 0; i < count; i++) {
            if (!Number.isFinite(splits[i]) || splits[i] <= 0) return false;
            if (i > 0 && splits[i] < splits[i - 1]) return false;
        }
        return true;
    },

    // Personal-best splits live beside the best time, keyed by the same
    // board id, so a leg whose course changed starts fresh splits too
    splitsKey(boardId) {
        return `motorcycleBestSplits_${boardId}`;
    },

    loadSplits(storage, key, count) {
        let raw = null;
        try {
            raw = storage.getItem(key);
        } catch (error) {
            console.warn('Best splits unreadable:', error);
            return null;
        }
        if (!raw) return null;
        try {
            const splits = JSON.parse(raw);
            if (RaceTiming.validSplits(splits, count)) return splits;
            // A table of another length is from before the course's split points moved (a world's checkpoints were
            // halved with its board kept): it compares with nothing now, so it is dropped, with no word to the rider
            if (Array.isArray(splits) && splits.length !== count) {
                try { storage.removeItem(key); } catch (error) { /* storage blocked: it is ignored on every load instead */ }
            }
            return null;
        } catch (error) {
            console.warn('Best splits corrupted, ignoring:', error);
            return null;
        }
    },

    // Only a full run that beat the best time may replace the stored splits:
    // splits from a slower run would make the comparison lie
    saveSplitsIfBest(storage, key, splits, beatBest, count) {
        if (!beatBest || !RaceTiming.validSplits(splits, count)) return false;
        try {
            storage.setItem(key, JSON.stringify(splits.slice(0, count)));
            return true;
        } catch (error) {
            console.warn('Best splits not saved:', error);
            return false;
        }
    },

    // The record to chase: the fastest entry not flagged as an anomaly.
    // checkpointTimes is null until the backend returns it.
    pickRecord(entries, count) {
        if (!Array.isArray(entries)) return null;
        const usable = entries.filter(e => e && Number.isFinite(e.totalTime) && e.totalTime > 0);
        if (usable.length === 0) return null;
        const best = usable.filter(e => !e.flagged).sort((a, b) => a.totalTime - b.totalTime)[0];
        if (!best) return null;
        return {
            playerName: String(best.playerName || ''),
            totalTime: best.totalTime,
            checkpointTimes: RaceTiming.validSplits(best.checkpointTimes, count) ? best.checkpointTimes.slice(0, count) : null
        };
    },

    // What the split popup shows when gate `index` (0-based) is passed
    split(index, elapsed, bestSplits, record) {
        const pb = bestSplits ? RaceTiming.delta(elapsed, bestSplits[index]) : null;
        const rec = record && record.checkpointTimes ? RaceTiming.delta(elapsed, record.checkpointTimes[index]) : null;
        return { index, elapsed, pbDelta: pb, recordDelta: rec };
    },

    // The finish screen headline. finishMs is the finish-line time (what the
    // personal best is kept in); boardMs is the time the online leaderboard
    // ranks by (the last gate on the shared course, the finish line on a
    // converted leg), so the record gap compares like with like.
    finish(finishMs, previousBestMs, boardMs, record) {
        const pbDelta = RaceTiming.delta(finishMs, previousBestMs);
        return {
            time: finishMs,
            pbDelta,
            isBest: !Number.isFinite(previousBestMs) || finishMs < previousBestMs,
            boardTime: Number.isFinite(boardMs) ? boardMs : null,
            recordDelta: record ? RaceTiming.delta(boardMs, record.totalTime) : null
        };
    }
};
