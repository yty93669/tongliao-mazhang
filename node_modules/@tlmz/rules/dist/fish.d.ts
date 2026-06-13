import { type TileCode } from './tiles.js';
export type FishContext = {
    fishTile: TileCode;
};
export declare function getFishTile(revealedTile: TileCode): TileCode;
export declare function normalizeFishAsOne(tile: TileCode, ctx: FishContext): TileCode;
export declare function isRealFish(tile: TileCode, ctx: FishContext): boolean;
export declare function logicalTile(tile: TileCode, ctx: FishContext): TileCode;
export declare function isFakeFish(tile: TileCode, ctx: FishContext): boolean;
export declare function matchesXiPatternToken(tile: TileCode, token: TileCode | 'Fish', ctx: FishContext): boolean;
export declare const effectiveTileForNamedXi: typeof logicalTile;
