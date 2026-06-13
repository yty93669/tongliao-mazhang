import { type TileCode } from './tiles.js';
export type MeldType = 'chi' | 'peng' | 'mingGang' | 'anGang' | 'xi' | 'dingZhang';
export type Meld = {
    type: MeldType;
    tiles: TileCode[];
    fromSeat?: number;
    name?: string;
};
export type PlayerState = {
    seat: number;
    name: string;
    hand: TileCode[];
    melds: Meld[];
    discarded: TileCode[];
    connected?: boolean;
};
export type GamePhase = 'waiting' | 'betting' | 'playing' | 'responding' | 'fenzhang' | 'settlement' | 'finished';
export type GameLog = {
    type: string;
    [key: string]: unknown;
};
export type RoundBet = {
    zha: boolean;
    buyFish: number;
    ready: boolean;
};
export type ScoreDelta = {
    seat: number;
    before: number;
    delta: number;
    after: number;
    detail: string;
};
export type Settlement = {
    winnerSeat: number;
    selfDraw: boolean;
    baseScore: number;
    fishTotal: number;
    ownFish: number;
    boughtFishTotal: number;
    zhaSeats: number[];
    discarderSeat?: number;
    deltas: ScoreDelta[];
};
export type ResponseWindow = {
    discardSeat: number;
    tile: TileCode;
    source: 'normal' | 'xi';
    passed: number[];
};
export type GameState = {
    roomId: string;
    phase: GamePhase;
    dealerSeat: number;
    currentSeat: number;
    round: number;
    scores: number[];
    baseScore: number;
    bets: RoundBet[];
    readyNext: boolean[];
    settlement?: Settlement;
    turnDrawn: boolean;
    xiWindowOpen: boolean;
    openingXiDone: boolean;
    pendingXiSupplement: boolean;
    wall: TileCode[];
    revealedFishTile: TileCode;
    fishTile: TileCode;
    players: PlayerState[];
    log: GameLog[];
    lastDiscard?: {
        seat: number;
        tile: TileCode;
        source: 'normal' | 'xi';
    };
    response?: ResponseWindow;
    drawnTile?: {
        seat: number;
        tile: TileCode;
    };
    winnerSeat?: number;
};
export declare function makeGame(opts?: {
    seed?: number;
    dealerSeat?: number;
    roomId?: string;
    scores?: number[];
    round?: number;
    phase?: GamePhase;
    names?: string[];
    connected?: boolean[];
}): GameState;
export declare function publicStateFor(state: GameState, seat?: number): {
    players: {
        hand: TileCode[] | "BACK"[];
        seat: number;
        name: string;
        melds: Meld[];
        discarded: TileCode[];
        connected?: boolean;
    }[];
    roomId: string;
    phase: GamePhase;
    dealerSeat: number;
    currentSeat: number;
    round: number;
    scores: number[];
    baseScore: number;
    bets: RoundBet[];
    readyNext: boolean[];
    settlement?: Settlement;
    turnDrawn: boolean;
    xiWindowOpen: boolean;
    openingXiDone: boolean;
    pendingXiSupplement: boolean;
    wall: TileCode[];
    revealedFishTile: TileCode;
    fishTile: TileCode;
    log: GameLog[];
    lastDiscard?: {
        seat: number;
        tile: TileCode;
        source: "normal" | "xi";
    };
    response?: ResponseWindow;
    drawnTile?: {
        seat: number;
        tile: TileCode;
    };
    winnerSeat?: number;
};
