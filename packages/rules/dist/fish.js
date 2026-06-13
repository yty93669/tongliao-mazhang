import { isNumberTile, makeTile, rankOf, suitOf } from './tiles.js';
export function getFishTile(revealedTile) {
    if (!isNumberTile(revealedTile))
        return 'T1';
    const s = suitOf(revealedTile);
    const r = rankOf(revealedTile);
    if (s === 'T' && r === 9)
        return 'T1';
    return makeTile(s, r === 9 ? 1 : r + 1);
}
export function normalizeFishAsOne(tile, ctx) { return tile === ctx.fishTile ? 'T1' : tile; }
export function isRealFish(tile, ctx) { return tile === ctx.fishTile; }
export function logicalTile(tile, ctx) {
    if (tile === ctx.fishTile)
        return 'T1';
    if (tile === 'T1' && ctx.fishTile !== 'T1')
        return ctx.fishTile;
    return tile;
}
export function isFakeFish(tile, ctx) {
    return tile === 'T1' && ctx.fishTile !== 'T1';
}
export function matchesXiPatternToken(tile, token, ctx) {
    if (token === 'Fish')
        return isRealFish(tile, ctx);
    return logicalTile(tile, ctx) === token;
}
export const effectiveTileForNamedXi = logicalTile;
