import { allTileFaces } from './tiles.js';
export function buildWall() { return allTileFaces.flatMap((t) => [t, t, t, t]); }
function mulberry32(seed) { return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function shuffleWall(wall, seed = Date.now()) {
    const out = [...wall];
    const rnd = mulberry32(seed);
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}
export function dealInitialHands(wall, dealerSeat) {
    const hands = [[], [], [], []];
    let rest = [...wall];
    for (let seat = 0; seat < 4; seat++) {
        const n = seat === dealerSeat ? 17 : 16;
        hands[seat] = rest.slice(0, n);
        rest = rest.slice(n);
    }
    return { hands, wall: rest };
}
export function drawTile(wall) { const [tile, ...rest] = wall; return { tile, wall: rest }; }
