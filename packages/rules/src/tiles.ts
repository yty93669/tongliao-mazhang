export type Suit = 'W' | 'T' | 'B';
export type NumberTile = `${Suit}${1|2|3|4|5|6|7|8|9}`;
export type HonorTile = 'Zhong' | 'Fa' | 'Bai';
export type TileCode = NumberTile | HonorTile;

export const suits: Suit[] = ['W', 'T', 'B'];
export const honors: HonorTile[] = ['Zhong', 'Fa', 'Bai'];
export const allTileFaces: TileCode[] = [
  ...suits.flatMap((s) => [1,2,3,4,5,6,7,8,9].map((n) => `${s}${n}` as TileCode)),
  ...honors,
];

const suitLabel: Record<Suit,string> = { W: '万', T: '条', B: '饼' };
const numLabel = ['零','一','二','三','四','五','六','七','八','九'];
export function tileLabel(tile: TileCode): string {
  if (tile === 'Zhong') return '中';
  if (tile === 'Fa') return '发';
  if (tile === 'Bai') return '白';
  return `${numLabel[Number(tile.slice(1))]}${suitLabel[tile[0] as Suit]}`;
}
export function isNumberTile(tile: TileCode): tile is NumberTile { return /^[WTB][1-9]$/.test(tile); }
export function suitOf(tile: TileCode): Suit | undefined { return isNumberTile(tile) ? tile[0] as Suit : undefined; }
export function rankOf(tile: TileCode): number | undefined { return isNumberTile(tile) ? Number(tile.slice(1)) : undefined; }
export function makeTile(suit: Suit, rank: number): TileCode { return `${suit}${rank}` as TileCode; }
export function sortTiles(tiles: TileCode[]): TileCode[] {
  const order = new Map(allTileFaces.map((t,i)=>[t,i]));
  return [...tiles].sort((a,b)=>(order.get(a)??99)-(order.get(b)??99));
}
export function countTiles(tiles: TileCode[]): Map<TileCode, number> {
  const m = new Map<TileCode, number>();
  for (const t of tiles) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}
