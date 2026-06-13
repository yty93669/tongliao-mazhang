import type { GameState, Settlement } from './state.js';
import type { TileCode } from './tiles.js';
export declare function ownFishCount(game: GameState, seat: number, winningDiscard?: TileCode): number;
export declare function settleGame(game: GameState, winnerSeat: number, selfDraw: boolean, discarderSeat?: number): Settlement;
