import { isNumberTile, makeTile, rankOf, suitOf, type TileCode } from './tiles.js';
export type FishContext = { fishTile: TileCode };
export function getFishTile(revealedTile: TileCode): TileCode {
  if (!isNumberTile(revealedTile)) return 'T1';
  const s = suitOf(revealedTile)!; const r = rankOf(revealedTile)!;
  if (s === 'T' && r === 9) return 'T1';
  return makeTile(s, r === 9 ? 1 : r + 1);
}
export function normalizeFishAsOne(tile: TileCode, ctx: FishContext): TileCode { return tile === ctx.fishTile ? 'T1' : tile; }
export function isRealFish(tile: TileCode, ctx: FishContext): boolean { return tile === ctx.fishTile; }
export function logicalTile(tile: TileCode, ctx: FishContext): TileCode {
  if (tile === ctx.fishTile) return 'T1';
  if (tile === 'T1' && ctx.fishTile !== 'T1') return ctx.fishTile;
  return tile;
}

export function isFakeFish(tile: TileCode, ctx: FishContext): boolean {
  return tile === 'T1' && ctx.fishTile !== 'T1';
}

export function matchesXiPatternToken(tile: TileCode, token: TileCode | 'Fish', ctx: FishContext): boolean {
  if (token === 'Fish') return isRealFish(tile, ctx);
  return logicalTile(tile, ctx) === token;
}

export const effectiveTileForNamedXi = logicalTile;
