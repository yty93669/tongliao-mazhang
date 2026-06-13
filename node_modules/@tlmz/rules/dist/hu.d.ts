import { type TileCode } from './tiles.js';
import { type FishContext } from './fish.js';
export type HuResult = {
    canHu: boolean;
    reason?: string;
};
export declare function isWinningHand(hand: TileCode[], ctx: FishContext): HuResult;
export declare function isJiaHuWithTile(handWithoutWinningTile: TileCode[], winningTile: TileCode, ctx: FishContext): HuResult;
