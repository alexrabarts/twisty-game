// An in-memory stand-in for the Realtime Database calls the handlers make:
// ref(path).set / update / remove / push / once, and the queries
// orderByChild(...).equalTo(...) and orderByChild(...).limitToFirst(n).
// Keyed on the path, so a test can tell leaderboards/<id> from courseBoards/<id>.
function createMemoryDb(seed = {}) {
    const root = {};
    let pushCount = 0;

    const parts = path => path.split('/').filter(Boolean);

    function read(path) {
        let node = root;
        for (const part of parts(path)) {
            if (node === null || typeof node !== 'object' || !(part in node)) return null;
            node = node[part];
        }
        return node === undefined ? null : node;
    }

    function write(path, value) {
        const keys = parts(path);
        const last = keys.pop();
        let node = root;
        for (const key of keys) {
            if (node[key] === null || typeof node[key] !== 'object') node[key] = {};
            node = node[key];
        }
        if (value === null) delete node[last];
        else node[last] = JSON.parse(JSON.stringify(value));
    }

    function snapshot(value) {
        const empty = value === null || (typeof value === 'object' && Object.keys(value).length === 0);
        return { exists: () => !empty, val: () => (empty ? null : JSON.parse(JSON.stringify(value))) };
    }

    // Realtime Database order: a missing child sorts first, then by value
    function ordered(path, child, keep) {
        const rows = Object.entries(read(path) || {}).filter(([, entry]) => keep(entry && entry[child]));
        const rank = value => (value === undefined ? -Infinity : value);
        return rows.sort((a, b) => {
            const left = rank(a[1][child]);
            const right = rank(b[1][child]);
            if (left < right) return -1;
            if (left > right) return 1;
            return a[0] < b[0] ? -1 : 1;
        });
    }

    function query(path, child, keep = () => true, limit = Infinity) {
        return {
            equalTo: value => query(path, child, v => v === value, limit),
            limitToFirst: n => query(path, child, keep, n),
            once: async () => snapshot(Object.fromEntries(ordered(path, child, keep).slice(0, limit)))
        };
    }

    function ref(path) {
        return {
            key: parts(path).pop(),
            set: async value => write(path, value),
            update: async changes => {
                for (const [key, value] of Object.entries(changes)) write(`${path}/${key}`, value);
            },
            remove: async () => write(path, null),
            once: async () => snapshot(read(path)),
            push: () => ref(`${path}/-k${String(++pushCount).padStart(6, '0')}`),
            orderByChild: child => query(path, child)
        };
    }

    for (const [path, value] of Object.entries(seed)) write(path, value);

    return { ref, read };
}

module.exports = { createMemoryDb };
