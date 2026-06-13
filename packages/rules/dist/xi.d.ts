import { type TileCode } from './tiles.js';
import { type FishContext } from './fish.js';
export type XiSet = {
    name: string;
    pattern: (TileCode | 'Fish')[];
    tiles: TileCode[];
};
export declare const xiDefs: {
    name: string;
    pattern: (TileCode | 'Fish')[];
}[];
export declare function findXiSets(hand: TileCode[], ctx: FishContext): XiSet[];
