export const suits = ['W', 'T', 'B'];
export const honors = ['Zhong', 'Fa', 'Bai'];
export const allTileFaces = [
    ...suits.flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `${s}${n}`)),
    ...honors,
];
const suitLabel = { W: '万', T: '条', B: '饼' };
const numLabel = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export function tileLabel(tile) {
    if (tile === 'Zhong')
        return '中';
    if (tile === 'Fa')
        return '发';
    if (tile === 'Bai')
        return '白';
    return `${numLabel[Number(tile.slice(1))]}${suitLabel[tile[0]]}`;
}
export function isNumberTile(tile) { return /^[WTB][1-9]$/.test(tile); }
export function suitOf(tile) { return isNumberTile(tile) ? tile[0] : undefined; }
export function rankOf(tile) { return isNumberTile(tile) ? Number(tile.slice(1)) : undefined; }
export function makeTile(suit, rank) { return `${suit}${rank}`; }
export function sortTiles(tiles) {
    const order = new Map(allTileFaces.map((t, i) => [t, i]));
    return [...tiles].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
}
export function countTiles(tiles) {
    const m = new Map();
    for (const t of tiles)
        m.set(t, (m.get(t) ?? 0) + 1);
    return m;
}
