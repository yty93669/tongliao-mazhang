import type { GameState } from './state.js';
import { type TileCode } from './tiles.js';
export type ClientAction = {
    type: 'DISCARD';
    seat: number;
    tile: TileCode;
} | {
    type: 'DRAW';
    seat: number;
} | {
    type: 'FENZHANG';
    seat: number;
} | {
    type: 'PASS';
    seat: number;
} | {
    type: 'HU';
    seat: number;
} | {
    type: 'DECLARE_XI';
    seat: number;
    name: string;
} | {
    type: 'END_XI';
    seat: number;
} | {
    type: 'CHI';
    seat: number;
    tiles?: TileCode[];
} | {
    type: 'PENG';
    seat: number;
} | {
    type: 'MING_GANG';
    seat: number;
} | {
    type: 'BU_GANG';
    seat: number;
    tile?: TileCode;
} | {
    type: 'AN_GANG';
    seat: number;
    tile?: TileCode;
} | {
    type: 'GUO';
    seat: number;
    tile?: TileCode;
} | {
    type: 'SET_BASE';
    seat: number;
    baseScore: number;
} | {
    type: 'SET_BET';
    seat: number;
    zha: boolean;
    buyFish: number;
} | {
    type: 'NEXT_ROUND';
    seat: number;
};
export declare function availableActions(game: GameState, seat: number): string[];
export declare function applyAction(game: GameState, action: ClientAction): GameState;
