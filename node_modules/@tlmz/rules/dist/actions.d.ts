import { type TileCode } from './tiles.js';
import { type FishContext } from './fish.js';
export type DiscardSource = 'normal' | 'xi';
export declare function legalChiOptions(hand: TileCode[], discard: TileCode, seat: number, discarderSeat: number, source: DiscardSource, ctx?: FishContext): TileCode[][];
export declare function canPeng(hand: TileCode[], tile: TileCode): boolean;
export declare function canMingGang(hand: TileCode[], tile: TileCode): boolean;
export declare function canAnGang(hand: TileCode[], tile: TileCode): boolean;
export declare function canBuGang(melds: {
    type: string;
    tiles: TileCode[];
}[], hand: TileCode[], tile?: TileCode): boolean;
export declare function resolveWinningSeat(discarderSeat: number, winningSeats: number[]): number | undefined;
