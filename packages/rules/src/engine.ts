import { canAnGang, canBuGang, canMingGang, canPeng, legalChiOptions } from './actions.js';
import { matchesXiPatternToken } from './fish.js';
import { isJiaHuWithTile, isWinningHand } from './hu.js';
import { findXiSets, xiDefs } from './xi.js';
import type { GameState, Meld } from './state.js';
import { sortTiles, type TileCode } from './tiles.js';
import { runFenZhang } from './fenzhang.js';
import { settleGame } from './settlement.js';

export type ClientAction =
  | { type:'DISCARD'; seat:number; tile:TileCode }
  | { type:'DRAW'; seat:number }
  | { type:'FENZHANG'; seat:number }
  | { type:'PASS'; seat:number }
  | { type:'HU'; seat:number }
  | { type:'DECLARE_XI'; seat:number; name:string }
  | { type:'END_XI'; seat:number }
  | { type:'CHI'; seat:number; tiles?:TileCode[] }
  | { type:'PENG'; seat:number }
  | { type:'MING_GANG'; seat:number }
  | { type:'BU_GANG'; seat:number; tile?:TileCode }
  | { type:'AN_GANG'; seat:number; tile?:TileCode }
  | { type:'GUO'; seat:number; tile?:TileCode }
  | { type:'SET_BASE'; seat:number; baseScore:number }
  | { type:'SET_BET'; seat:number; zha:boolean; buyFish:number }
  | { type:'NEXT_ROUND'; seat:number };

type ResponseAction = 'HU' | 'MING_GANG' | 'PENG' | 'CHI';
const responsePriority: Record<ResponseAction, number> = { HU: 3, MING_GANG: 2, PENG: 2, CHI: 1 };

function firstRoundXiAllowed(game: GameState, seat: number) {
  return game.players[seat].discarded.length === 0;
}

function openingXiPhase(game: GameState) {
  return game.phase === 'playing' && !game.openingXiDone && game.xiWindowOpen && game.players.every(p => p.discarded.length === 0) && !game.lastDiscard && !game.response;
}

function openingDealerTurn(game: GameState, seat: number) {
  return seat === game.dealerSeat && game.turnDrawn && !game.lastDiscard && game.players[seat].discarded.length === 0 && !game.drawnTile;
}

function firstTurnDrawnForXi(game: GameState, seat: number) {
  return game.players[seat].discarded.length === 0 && game.drawnTile?.seat === seat;
}

function xiHandCountAllowed(game: GameState, seat: number) {
  if (openingXiPhase(game)) return true;
  if (game.pendingXiSupplement && firstTurnDrawnForXi(game, seat)) return true;
  return false;
}

function finishOpeningXi(game: GameState) {
  if (!openingXiPhase(game)) return;
  game.currentSeat = game.dealerSeat;
  game.turnDrawn = true;
  game.xiWindowOpen = false;
  game.openingXiDone = true;
  game.pendingXiSupplement = false;
  game.drawnTile = undefined;
}

function xiMelds(p: GameState['players'][number]) {
  return p.melds.filter(m => m.type === 'xi');
}

function xiPatternForMeld(meld: Meld) {
  return xiDefs.find(def => def.name === meld.name)?.pattern;
}

function canGuoToMeld(game: GameState, meld: Meld, tile: TileCode) {
  if (tile === 'Bai') return true;
  const pattern = xiPatternForMeld(meld);
  if (!pattern) return false;
  const ctx = { fishTile: game.fishTile };
  return pattern.some(token => matchesXiPatternToken(tile, token, ctx));
}

function canGuoTile(game: GameState, seat: number, tile: TileCode) {
  const p = game.players[seat];
  const melds = xiMelds(p);
  if (!melds.length) return false;
  return melds.some(m => canGuoToMeld(game, m, tile));
}

function hasDrawnForGuo(game: GameState, seat: number) {
  return game.drawnTile?.seat === seat;
}

function firstGuoTile(game: GameState, seat: number) {
  if (!hasDrawnForGuo(game, seat)) return undefined;
  const p = game.players[seat];
  return p.hand.find(t => canGuoTile(game, seat, t));
}

function targetGuoMeld(game: GameState, seat: number, tile: TileCode): Meld | undefined {
  const melds = xiMelds(game.players[seat]);
  return melds.find(m => canGuoToMeld(game, m, tile));
}

function removeOne(hand: TileCode[], tile: TileCode) {
  const i = hand.indexOf(tile);
  if (i < 0) throw new Error('手里没有这张牌');
  hand.splice(i, 1);
}

function responseSeats(game: GameState): number[] {
  const d = game.response ?? (game.lastDiscard ? { discardSeat: game.lastDiscard.seat, tile: game.lastDiscard.tile, source: game.lastDiscard.source, passed: [] } : undefined);
  if (!d) return [];
  const passed = new Set(d.passed);
  const seats: number[] = [];
  for (let i = 1; i <= 3; i++) {
    const seat = (d.discardSeat + i) % 4;
    if (!passed.has(seat)) seats.push(seat);
  }
  return seats;
}

function responseActionsFor(game: GameState, seat: number): ResponseAction[] {
  const d = game.response ?? (game.lastDiscard ? { discardSeat: game.lastDiscard.seat, tile: game.lastDiscard.tile, source: game.lastDiscard.source, passed: [] } : undefined);
  if (!d || d.discardSeat === seat || d.passed.includes(seat)) return [];
  const p = game.players[seat];
  const ctx = { fishTile: game.fishTile };
  const actions: ResponseAction[] = [];
  if (isJiaHuWithTile(p.hand, d.tile, ctx).canHu) actions.push('HU');
  if (canMingGang(p.hand, d.tile)) actions.push('MING_GANG');
  if (canPeng(p.hand, d.tile)) actions.push('PENG');
  if (legalChiOptions(p.hand, d.tile, seat, d.discardSeat, d.source, ctx).length) actions.push('CHI');
  return actions;
}

function allPendingResponseChoices(game: GameState) {
  return responseSeats(game).flatMap(seat => responseActionsFor(game, seat).map(type => ({ seat, type, priority: responsePriority[type] })));
}

function seatDistanceAfter(discarderSeat: number, seat: number) {
  return (seat - discarderSeat + 4) % 4;
}

function assertResponseMayResolve(game: GameState, seat: number, type: ResponseAction) {
  if (game.phase !== 'responding' || !game.response || !game.lastDiscard) throw new Error('当前没有可响应的弃牌');
  const ownActions = responseActionsFor(game, seat);
  if (!ownActions.includes(type)) throw new Error(`不能${responseActionLabel(type)}`);

  const choices = allPendingResponseChoices(game);
  const maxPriority = Math.max(...choices.map(c => c.priority));
  const requestedPriority = responsePriority[type];
  if (requestedPriority < maxPriority) throw new Error('还有更高优先级的响应未处理');

  const samePriority = choices
    .filter(c => c.priority === requestedPriority)
    .sort((a, b) => seatDistanceAfter(game.response!.discardSeat, a.seat) - seatDistanceAfter(game.response!.discardSeat, b.seat));
  if (samePriority[0]?.seat !== seat) throw new Error('还有座次更靠前的同优先级响应未处理');
}

function responseActionLabel(type: ResponseAction) {
  if (type === 'HU') return '胡';
  if (type === 'MING_GANG') return '明杠';
  if (type === 'PENG') return '碰';
  return '吃';
}

function clearResponseAndAdvance(game: GameState) {
  const discardSeat = game.response?.discardSeat ?? game.lastDiscard?.seat;
  game.response = undefined;
  game.lastDiscard = undefined;
  game.phase = 'playing';
  if (discardSeat != null) game.currentSeat = (discardSeat + 1) % 4;
  game.turnDrawn = false;
  game.xiWindowOpen = false;
  game.pendingXiSupplement = false;
  game.drawnTile = undefined;
}

function openResponseOrAdvance(game: GameState, discarderSeat: number, tile: TileCode, source: 'normal' | 'xi') {
  game.lastDiscard = { seat: discarderSeat, tile, source };
  game.response = { discardSeat: discarderSeat, tile, source, passed: [] };
  game.phase = 'responding';
  game.currentSeat = (discarderSeat + 1) % 4;
  game.turnDrawn = false;
  game.xiWindowOpen = false;
  game.pendingXiSupplement = false;
  game.drawnTile = undefined;
  if (allPendingResponseChoices(game).length === 0) clearResponseAndAdvance(game);
}

function drawSupplement(game: GameState, seat: number, logType: string) {
  if (game.wall.length <= 4) {
    game.phase = 'fenzhang';
    game.response = undefined;
    game.lastDiscard = undefined;
    runFenZhang(game);
    return;
  }
  const tile = game.wall.shift()!;
  const p = game.players[seat];
  p.hand = [...p.hand, tile];
  game.drawnTile = { seat, tile };
  game.turnDrawn = true;
  game.xiWindowOpen = false;
  game.pendingXiSupplement = false;
  game.response = undefined;
  game.lastDiscard = undefined;
  game.phase = 'playing';
  game.log.push({ type: logType, seat, tile });
}

function removeLastDiscardFromDiscardPile(game: GameState) {
  const d = game.lastDiscard;
  if (!d) throw new Error('没有可响应的弃牌');
  const discarder = game.players[d.seat];
  const i = discarder.discarded.lastIndexOf(d.tile);
  if (i >= 0) discarder.discarded.splice(i, 1);
  return d;
}

function finishClaim(game: GameState, seat: number) {
  game.response = undefined;
  game.lastDiscard = undefined;
  game.drawnTile = undefined;
  game.phase = 'playing';
  game.currentSeat = seat;
  game.turnDrawn = true;
  game.xiWindowOpen = false;
  game.pendingXiSupplement = false;
}

export function availableActions(game: GameState, seat: number) {
  const p = game.players[seat];
  const ctx = { fishTile: game.fishTile };
  const actions: string[] = [];

  if (game.phase === 'betting') {
    if (seat === game.dealerSeat) actions.push('SET_BASE');
    if (!game.bets[seat]?.ready) actions.push('SET_BET');
    return actions;
  }

  if (game.phase === 'settlement') {
    if (!game.readyNext[seat]) actions.push('NEXT_ROUND');
    return actions;
  }

  if (game.phase === 'responding') {
    const responseActions = responseActionsFor(game, seat);
    if (responseActions.length) actions.push(...responseActions);
    if (responseSeats(game).includes(seat)) actions.push('PASS');
    return [...new Set(actions)];
  }

  if (openingXiPhase(game)) {
    if (!game.openingXiReady[seat]) {
      const xiSets = findXiSets(p.hand, ctx);
      if (xiSets.length) actions.push('DECLARE_XI');
      actions.push('END_XI');
    }
    return [...new Set(actions)];
  }

  if (game.phase === 'playing' && game.currentSeat === seat) {
    const xiSets = findXiSets(p.hand, ctx);
    if (game.pendingXiSupplement && xiSets.length) actions.push('DECLARE_XI');
    if (game.pendingXiSupplement) {
      actions.push('END_XI');
    } else if (game.turnDrawn) {
      actions.push('DISCARD');
      if (isWinningHand(p.hand, ctx).canHu) actions.push('HU');
      if (canBuGang(p.melds, p.hand)) actions.push('BU_GANG');
      for (const t of p.hand) if (canAnGang(p.hand, t)) actions.push('AN_GANG');
      if (firstGuoTile(game, seat)) actions.push('GUO');
    } else if (game.wall.length > 4) {
      actions.push('DRAW');
    } else if (game.wall.length > 0) {
      actions.push('FENZHANG');
    }
  }

  return [...new Set(actions)];
}

export function applyAction(game: GameState, action: ClientAction): GameState {
  const p = game.players[action.seat];
  if (!p) throw new Error('座位不存在');

  if (action.type === 'SET_BASE') {
    if (game.phase !== 'betting') throw new Error('当前不能设置基数');
    if (action.seat !== game.dealerSeat) throw new Error('只有庄家能设置基数');
    if (!Number.isFinite(action.baseScore) || action.baseScore <= 0) throw new Error('基数必须大于0');
    game.baseScore = Math.floor(action.baseScore);
    game.log.push({ type: 'setBase', seat: action.seat, baseScore: game.baseScore });
    return game;
  }

  if (action.type === 'SET_BET') {
    if (game.phase !== 'betting') throw new Error('当前不能扎针买鱼');
    const buyFish = Math.max(0, Math.floor(action.buyFish || 0));
    game.bets[action.seat] = { zha: !!action.zha, buyFish, ready: true };
    game.log.push({ type: 'setBet', seat: action.seat, zha: !!action.zha, buyFish });
    if (game.bets.every(b => b.ready)) {
      game.phase = 'playing';
      game.log.push({ type: 'bettingDone', baseScore: game.baseScore, bets: game.bets });
    }
    return game;
  }

  if (action.type === 'NEXT_ROUND') {
    if (game.phase !== 'settlement') throw new Error('当前不能进入下一局');
    game.readyNext[action.seat] = true;
    game.log.push({ type: 'nextRoundReady', seat: action.seat });
    return game;
  }

  if (action.type === 'PASS') {
    if (game.phase !== 'responding' || !game.response) throw new Error('当前没有可过的响应');
    if (!responseSeats(game).includes(action.seat)) throw new Error('该座位不能响应这张弃牌');
    if (!game.response.passed.includes(action.seat)) game.response.passed.push(action.seat);
    game.log.push({ type: 'pass', seat: action.seat, tile: game.response.tile });
    if (allPendingResponseChoices(game).length === 0) clearResponseAndAdvance(game);
    return game;
  }

  if (action.type === 'DISCARD') {
    if (game.phase !== 'playing') throw new Error('当前不能出牌');
    if (game.currentSeat !== action.seat) throw new Error('没轮到该玩家');
    if (openingXiPhase(game)) throw new Error('请先等所有玩家结束开局亮喜');
    if (game.pendingXiSupplement) throw new Error('请先结束亮喜并补牌');
    if (!game.turnDrawn) throw new Error('必须先摸牌再打牌');
    removeOne(p.hand, action.tile);
    p.hand = sortTiles(p.hand);
    p.discarded.push(action.tile);
    game.log.push({ type: 'discard', seat: action.seat, tile: action.tile });
    openResponseOrAdvance(game, action.seat, action.tile, 'normal');
    return game;
  }

  if (action.type === 'DRAW') {
    if (game.phase !== 'playing') throw new Error('当前不能摸牌');
    if (game.currentSeat !== action.seat) throw new Error('没轮到该玩家');
    if (openingXiPhase(game)) throw new Error('请先完成开局亮喜');
    if (game.pendingXiSupplement) throw new Error('请先结束亮喜并补牌');
    if (game.turnDrawn) throw new Error('已经摸过牌');
    game.lastDiscard = undefined;
    game.response = undefined;
    if (game.wall.length <= 4) {
      game.phase = 'fenzhang';
      runFenZhang(game);
      return game;
    }
    const tile = game.wall.shift()!;
    p.hand = [...p.hand, tile];
    game.drawnTile = { seat: action.seat, tile };
    game.turnDrawn = true;
    game.xiWindowOpen = false;
    game.log.push({ type: 'draw', seat: action.seat, tile });
    return game;
  }

  if (action.type === 'FENZHANG') {
    if (game.phase !== 'playing') throw new Error('当前不能进入分张儿');
    if (game.currentSeat !== action.seat) throw new Error('没轮到该玩家');
    if (game.pendingXiSupplement) throw new Error('请先结束亮喜并补牌');
    game.lastDiscard = undefined;
    game.response = undefined;
    game.phase = 'fenzhang';
    runFenZhang(game);
    return game;
  }

  if (action.type === 'DECLARE_XI') {
    if (game.phase !== 'playing') throw new Error('当前不能亮喜');
    const openingXi = openingXiPhase(game);
    if (!openingXi && game.currentSeat !== action.seat) throw new Error('没轮到该玩家');
    if (!firstRoundXiAllowed(game, action.seat)) throw new Error('只有第一轮可以亮喜');
    if (!game.xiWindowOpen && !game.pendingXiSupplement) throw new Error('当前不能亮喜');
    const dealerOpening = openingDealerTurn(game, action.seat);
    if (!openingXi && !game.pendingXiSupplement) throw new Error('亮喜只能在开局摸第一张牌前进行');
    if (!game.pendingXiSupplement && !xiHandCountAllowed(game, action.seat)) throw new Error('亮喜只能在开局摸第一张牌前进行');
    const xi = findXiSets(p.hand, { fishTile: game.fishTile }).find(x => x.name === action.name);
    if (!xi) throw new Error('没有这套喜');
    for (const t of xi.tiles) removeOne(p.hand, t);
    p.melds.push({ type: 'xi', tiles: xi.tiles, name: xi.name });
    game.pendingXiSupplement = !openingXi && !dealerOpening;
    game.log.push({ type: 'xi', seat: action.seat, name: xi.name, tiles: xi.tiles, supplementRequired: game.pendingXiSupplement });
    return game;
  }

  if (action.type === 'END_XI') {
    if (game.phase !== 'playing') throw new Error('当前不能结束亮喜');
    if (openingXiPhase(game)) {
      game.openingXiReady[action.seat] = true;
      game.log.push({ type: 'openingXiDone', seat: action.seat });
      if (game.openingXiReady.every(Boolean)) finishOpeningXi(game);
      return game;
    }
    if (game.currentSeat !== action.seat) throw new Error('没轮到该玩家');
    if (!game.pendingXiSupplement) throw new Error('当前没有待结束的亮喜');
    drawSupplement(game, action.seat, 'xiSupplement');
    return game;
  }

  if (action.type === 'HU') {
    if (game.phase === 'responding' && game.lastDiscard && game.response) {
      assertResponseMayResolve(game, action.seat, 'HU');
      game.phase = 'settlement';
      game.winnerSeat = action.seat;
      game.settlement = settleGame(game, action.seat, false, game.lastDiscard.seat);
      game.log.push({ type: 'hu', seat: action.seat, tile: game.lastDiscard.tile, settlement: game.settlement });
      game.response = undefined;
      game.lastDiscard = undefined;
      return game;
    }
    if (game.phase !== 'playing') throw new Error('当前不能胡');
    if (game.currentSeat !== action.seat) throw new Error('只有当前玩家能自摸胡');
    if (!game.turnDrawn || game.pendingXiSupplement) throw new Error('必须摸牌后才能自摸胡');
    if (!isWinningHand(p.hand, { fishTile: game.fishTile }).canHu) throw new Error('不能胡');
    game.phase = 'settlement';
    game.winnerSeat = action.seat;
    game.settlement = settleGame(game, action.seat, true);
    game.log.push({ type: 'hu', seat: action.seat, self: true, settlement: game.settlement });
    return game;
  }

  if (action.type === 'PENG') {
    assertResponseMayResolve(game, action.seat, 'PENG');
    const d = game.lastDiscard!;
    removeLastDiscardFromDiscardPile(game);
    removeOne(p.hand, d.tile);
    removeOne(p.hand, d.tile);
    p.melds.push({ type: 'peng', tiles: [d.tile, d.tile, d.tile], fromSeat: d.seat });
    game.log.push({ type: 'peng', seat: action.seat, tile: d.tile, fromSeat: d.seat });
    finishClaim(game, action.seat);
    return game;
  }

  if (action.type === 'MING_GANG') {
    assertResponseMayResolve(game, action.seat, 'MING_GANG');
    const d = game.lastDiscard!;
    removeLastDiscardFromDiscardPile(game);
    removeOne(p.hand, d.tile);
    removeOne(p.hand, d.tile);
    removeOne(p.hand, d.tile);
    p.melds.push({ type: 'mingGang', tiles: [d.tile, d.tile, d.tile, d.tile], fromSeat: d.seat });
    game.log.push({ type: 'mingGang', seat: action.seat, tile: d.tile, fromSeat: d.seat });
    finishClaim(game, action.seat);
    drawSupplement(game, action.seat, 'gangSupplement');
    return game;
  }

  if (action.type === 'CHI') {
    assertResponseMayResolve(game, action.seat, 'CHI');
    const d = game.lastDiscard!;
    const opts = legalChiOptions(p.hand, d.tile, action.seat, d.seat, d.source, { fishTile: game.fishTile });
    const chosen = action.tiles && opts.some(o => o.join(',') === action.tiles!.join(',')) ? action.tiles : opts[0];
    if (!chosen) throw new Error('不能吃');
    removeLastDiscardFromDiscardPile(game);
    for (const t of chosen.filter(t => t !== d.tile)) removeOne(p.hand, t);
    p.melds.push({ type: 'chi', tiles: chosen, fromSeat: d.seat });
    game.log.push({ type: 'chi', seat: action.seat, tiles: chosen, fromSeat: d.seat });
    finishClaim(game, action.seat);
    return game;
  }

  if (action.type === 'BU_GANG') {
    if (game.phase !== 'playing') throw new Error('当前不能补杠');
    if (game.currentSeat !== action.seat) throw new Error('没轮到该玩家');
    if (!game.turnDrawn) throw new Error('必须先摸牌');
    const tile = action.tile ?? p.melds.find(m => m.type === 'peng' && m.tiles.some(t => p.hand.includes(t)))?.tiles[0];
    if (!tile || !canBuGang(p.melds, p.hand, tile)) throw new Error('不能补杠');
    removeOne(p.hand, tile);
    const meld = p.melds.find(m => m.type === 'peng' && m.tiles.includes(tile));
    if (!meld) throw new Error('没有可补杠的碰');
    meld.type = 'mingGang';
    meld.tiles = [tile, tile, tile, tile];
    game.log.push({ type: 'buGang', seat: action.seat, tile });
    drawSupplement(game, action.seat, 'gangSupplement');
    return game;
  }

  if (action.type === 'AN_GANG') {
    if (game.phase !== 'playing') throw new Error('当前不能暗杠');
    if (game.currentSeat !== action.seat) throw new Error('没轮到该玩家');
    if (!game.turnDrawn) throw new Error('必须先摸牌');
    const tile = action.tile ?? p.hand.find(t => canAnGang(p.hand, t));
    if (!tile || !canAnGang(p.hand, tile)) throw new Error('不能暗杠');
    for (let i = 0; i < 4; i++) removeOne(p.hand, tile);
    p.melds.push({ type: 'anGang', tiles: [tile, tile, tile, tile] });
    game.log.push({ type: 'anGang', seat: action.seat, tile });
    drawSupplement(game, action.seat, 'gangSupplement');
    return game;
  }

  if (action.type === 'GUO') {
    if (game.phase !== 'playing') throw new Error('当前不能过牌');
    if (game.currentSeat !== action.seat) throw new Error('没轮到该玩家');
    if (!game.turnDrawn) throw new Error('必须先摸牌');
    if (!hasDrawnForGuo(game, action.seat)) throw new Error('必须抓牌后才能过牌');
    const tile = action.tile ?? firstGuoTile(game, action.seat);
    if (!tile || !canGuoTile(game, action.seat, tile)) throw new Error('不能过这张牌');
    const meld = targetGuoMeld(game, action.seat, tile);
    if (!meld) throw new Error('没有可接过的喜');
    removeOne(p.hand, tile);
    meld.tiles.push(tile);
    game.log.push({ type: 'guo', seat: action.seat, tile, xiName: meld.name });
    drawSupplement(game, action.seat, 'guoSupplement');
    return game;
  }

  return game;
}
