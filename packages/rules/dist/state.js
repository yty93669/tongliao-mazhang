import { buildWall, dealInitialHands, shuffleWall } from './wall.js';
import { getFishTile } from './fish.js';
import { sortTiles } from './tiles.js';
export function makeGame(opts = {}) {
    const dealerSeat = opts.dealerSeat ?? 0;
    const shuffled = shuffleWall(buildWall(), opts.seed ?? Date.now());
    const revealedFishTile = shuffled[0];
    const fishTile = getFishTile(revealedFishTile);
    const dealt = dealInitialHands(shuffled.slice(1), dealerSeat);
    const players = dealt.hands.map((hand, seat) => ({
        seat,
        name: opts.names?.[seat] ?? `玩家${seat + 1}`,
        hand: sortTiles(hand),
        melds: [],
        discarded: [],
        connected: opts.connected?.[seat] ?? false,
    }));
    return {
        roomId: opts.roomId ?? 'local',
        phase: opts.phase ?? 'playing',
        dealerSeat,
        currentSeat: dealerSeat,
        round: opts.round ?? 1,
        scores: opts.scores ? [...opts.scores] : [1000, 1000, 1000, 1000],
        baseScore: 1,
        bets: Array.from({ length: 4 }, () => ({ zha: false, buyFish: 0, ready: false })),
        readyNext: [false, false, false, false],
        turnDrawn: true,
        xiWindowOpen: true,
        openingXiDone: false,
        pendingXiSupplement: false,
        wall: dealt.wall,
        revealedFishTile,
        fishTile,
        players,
        log: [{ type: 'start', dealerSeat, revealedFishTile, fishTile }],
    };
}
export function publicStateFor(state, seat) {
    return {
        ...state,
        players: state.players.map(player => ({
            ...player,
            hand: seat === player.seat ? player.hand : player.hand.map(() => 'BACK'),
        })),
    };
}
