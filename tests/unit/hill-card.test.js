// The hill ride's end card (HillRide.showCard, js/hill/ride.js) in a page: the time, the rider's best and the board's
// top 10 only once the ride is over, a board that cannot be read said in words with the time still there, and the
// card a dialog of the one stack (js/modals.js) whose buttons R, N and Esc press.
import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { loadScript } from '../helpers/load-game.js';

const { Modals, HillLane, HillBoard, HillRide } = new Function('THREE',
    `${loadScript('modals.js')}\n${['lane', 'board', 'ride'].map(n => loadScript(`hill/${n}.js`)).join('\n')}\nreturn { Modals, HillLane, HillBoard, HillRide };`
)({});
const lane = new HillLane();
const TIME = /\d+:\d\d\.\d{3}/;

const entries = [
    { rank: 1, playerName: 'TOM', totalTime: 31250, restarts: 0, flagged: false },
    { rank: 2, playerName: 'ANN', totalTime: 36010, restarts: 1, flagged: false }
];

function makeRide({ service, session, finishMs = 41234, restarts = 1, trusted = true } = {}) {
    const game = { leaderboardService: service, showLeaderboardEntryUI: jest.fn() };
    const ride = Object.assign(Object.create(HillRide.prototype), { game, lane, board: new HillBoard(lane), session, view: 0 });
    ride.overlay();
    const board = ride.board;
    board.begin(lane.rule.startM);
    Object.assign(board, { state: 'finished', finishMs, restarts, times: [9000, 15000, 21000], trusted });
    return { ride, game };
}

const service = (fetch = async () => ({ success: true, entries })) => ({ fetchLeaderboard: jest.fn(fetch) });
const openSession = () => ({ ready: Promise.resolve(true), isActive: () => true, unsupported: false, cancel: jest.fn() });
const key = code => window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));

beforeEach(() => {
    Modals.reset();
    document.body.innerHTML = '';
    localStorage.clear();
});

describe('the end card', () => {
    test('during the ride it is hidden and the page shows no time', () => {
        const { ride } = makeRide({ service: service(), session: openSession() });
        expect(ride.endNote.style.display).toBe('none');
        expect(document.body.textContent).not.toMatch(TIME);
        expect(Modals.isOpen(ride.endNote)).toBe(false);
    });

    test('at the end: the time with its falls, the best, the top 10, and the name entry through the game\'s own dialog', async () => {
        localStorage.setItem(HillRide.BEST_KEY, '39.5');
        const { ride, game } = makeRide({ service: service(), session: openSession() });
        await ride.showCard();
        const card = ride.card;
        expect(Modals.isTop(ride.endNote)).toBe(true);
        expect(card.time.textContent).toBe('Your time 0:41.234 (1 fall, +5 s)');
        expect(card.best.textContent).toBe('Your best 0:39.500');
        expect([...card.board.querySelectorAll('tr')].map(tr => tr.textContent)).toEqual(['1.TOM0:31.250', '2.ANN0:36.010 1R']);
        expect(card.name.hidden).toBe(false);
        expect(game.leaderboardService.fetchLeaderboard).toHaveBeenCalledWith(HillBoard.ID, 10);
        key('KeyN');
        expect(game.showLeaderboardEntryUI).toHaveBeenCalledTimes(1);
        expect(card.name.hidden).toBe(true);
        // After the name, the board is read again
        game.showLeaderboardEntryUI.mock.calls[0][0]();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(game.leaderboardService.fetchLeaderboard).toHaveBeenCalledTimes(2);
    });

    test('a new best is kept on the device', async () => {
        const { ride } = makeRide({ service: service(), session: openSession(), finishMs: 30000, restarts: 0 });
        await ride.showCard();
        expect(ride.card.time.textContent).toBe('Your time 0:30.000');
        expect(ride.card.best.textContent).toBe('Your best 0:30.000 · a new best');
        expect(localStorage.getItem(HillRide.BEST_KEY)).toBe('30');
    });

    test('R rides again and Esc leaves: the card\'s own buttons, through the stack', async () => {
        const { ride } = makeRide({ service: service(), session: openSession() });
        ride.restart = jest.fn(() => ride.closeCard());
        await ride.showCard();
        expect(ride.card.leave.dataset.key).toBe('Escape');
        key('KeyR');
        expect(ride.restart).toHaveBeenCalledTimes(1);
        expect(Modals.isOpen(ride.endNote)).toBe(false);
        expect(ride.endNote.style.display).toBe('none');
    });

    test('a board that cannot be read, a server without the board, a failed session or no service: the time stays, and no name is taken', async () => {
        const failing = makeRide({ service: service(async () => ({ success: false, error: 'offline' })), session: openSession() });
        await failing.ride.showCard();
        expect(failing.ride.card.time.textContent).toMatch(TIME);
        expect(failing.ride.card.board.textContent).toBe(HillRide.BOARD_NOTES.unavailable);
        document.body.innerHTML = '';
        Modals.reset();

        const closed = makeRide({ service: service(), session: { ready: Promise.resolve({ error: 'not-submitted' }), isActive: () => false, unsupported: true, cancel() {} } });
        await closed.ride.showCard();
        expect(closed.ride.card.board.textContent).toBe(HillRide.BOARD_NOTES.notOpen);
        expect(closed.ride.card.name.hidden).toBe(true);
        document.body.innerHTML = '';
        Modals.reset();

        const failed = makeRide({ service: service(), session: { ready: Promise.resolve({ error: 'failed' }), isActive: () => false, unsupported: false, cancel() {} } });
        await failed.ride.showCard();
        expect(failed.ride.card.board.querySelectorAll('tr')).toHaveLength(2);
        expect(failed.ride.card.name.hidden).toBe(true);
        document.body.innerHTML = '';
        Modals.reset();

        const none = makeRide({ service: null, session: null });
        await none.ride.showCard();
        expect(none.ride.card.time.textContent).toMatch(TIME);
        expect(none.ride.card.board.textContent).toBe(HillRide.BOARD_NOTES.unavailable);
        expect(none.ride.card.name.hidden).toBe(true);
    });

    test('a ride that may not go to the board shows its time, says so, and reads no board', async () => {
        const read = service();
        const { ride } = makeRide({ service: read, session: null, trusted: false });
        await ride.showCard();
        expect(ride.card.time.textContent).toMatch(TIME);
        expect(ride.card.board.textContent).toBe(HillRide.BOARD_NOTES.untimed);
        expect(read.fetchLeaderboard).not.toHaveBeenCalled();
        expect(localStorage.getItem(HillRide.BEST_KEY)).toBe(null);
    });
});
