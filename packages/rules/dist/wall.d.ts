import { type TileCode } from './tiles.js';
export declare function buildWall(): TileCode[];
export declare function shuffleWall(wall: TileCode[], seed?: number): TileCode[];
export declare function dealInitialHands(wall: TileCode[], dealerSeat: number): {
    hands: TileCode[][];
    wall: TileCode[];
};
export declare function drawTile(wall: TileCode[]): {
    tile: TileCode;
    wall: TileCode[];
};
