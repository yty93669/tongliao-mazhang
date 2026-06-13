import { describe, expect, it } from 'vitest';
import {
  buildWall,
  dealInitialHands,
  findXiSets,
  getFishTile,
  isWinningHand,
  legalChiOptions,
  makeGame,
  applyAction,
  availableActions,
  resolveWinningSeat,
  runFenZhang,
  tileLabel,
  type TileCode,
} from '../src/index';

function finishOpeningXi(game: ReturnType<typeof makeGame>) {
  for (let i = 0; i < 4 && !game.openingXiDone; i++) {
    applyAction(game, { type: 'END_XI', seat: game.currentSeat });
  }
}

describe('tiles and wall', () => {
  it('builds exactly 120 tiles with four copies of each face', () => {
    const wall = buildWall();
    expect(wall).toHaveLength(120);
    const counts = new Map<TileCode, number>();
    for (const tile of wall) counts.set(tile, (counts.get(tile) ?? 0) + 1);
    expect(counts.size).toBe(30);
    expect([...counts.values()].every((n) => n === 4)).toBe(true);
  });

  it('deals 17 tiles to dealer and 16 to others', () => {
    const result = dealInitialHands(buildWall(), 2);
    expect(result.hands.map((h) => h.length)).toEqual([16, 16, 17, 16]);
    expect(result.wall).toHaveLength(55);
  });
});

describe('fish', () => {
  it('maps reveal tile to fish tile without treating fish as wildcard', () => {
    expect(getFishTile('W2')).toBe('W3');
    expect(getFishTile('T8')).toBe('T9');
    expect(getFishTile('B9')).toBe('B1');
    expect(getFishTile('T9')).toBe('T1');
    expect(getFishTile('Zhong')).toBe('T1');
    expect(tileLabel('T1')).toBe('一条');
  });
});

describe('xi sets', () => {
  it('recognizes all fixed xi sets and requires real fish for fish xi', () => {
    expect(findXiSets(['Zhong', 'Fa', 'Bai'], { fishTile: 'W3' }).map((x) => x.name)).toContain('中发白');
    expect(findXiSets(['Zhong', 'W8', 'T5'], { fishTile: 'W3' }).map((x) => x.name)).toContain('中八叉');
    expect(findXiSets(['W1', 'T2', 'B7'], { fishTile: 'W3' }).map((x) => x.name)).toContain('幺二拐');
    expect(findXiSets(['W3', 'W1', 'B9'], { fishTile: 'W3' }).map((x) => x.name)).toContain('老虎喜儿');
    expect(findXiSets(['T1', 'W1', 'B9'], { fishTile: 'W3' }).map((x) => x.name)).not.toContain('老虎喜儿');
  });

  it('uses effective fish/fake-fish identity for named tiles but real fish only for Fish placeholder', () => {
    const withRealNineWan = findXiSets(['Zhong', 'W9', 'T9'], { fishTile: 'W9' }).map((x) => x.name);
    expect(withRealNineWan).not.toContain('中九九');

    const withFakeNineWan = findXiSets(['Zhong', 'T1', 'T9'], { fishTile: 'W9' }).map((x) => x.name);
    expect(withFakeNineWan).toContain('中九九');

    const fakeTwoTiao = findXiSets(['W1', 'T1', 'B7'], { fishTile: 'T2' }).map((x) => x.name);
    expect(fakeTwoTiao).toContain('幺二拐');

    const realFishIsNotPlainTwoTiao = findXiSets(['W1', 'T2', 'B7'], { fishTile: 'T2' }).map((x) => x.name);
    expect(realFishIsNotPlainTwoTiao).not.toContain('幺二拐');

    const fishPlaceholder = findXiSets(['T1', 'W1', 'B9'], { fishTile: 'W9' }).map((x) => x.name);
    expect(fishPlaceholder).not.toContain('老虎喜儿');
  });
});

describe('actions', () => {
  it('allows chi only for next seat and never for xi discard source', () => {
    expect(legalChiOptions(['W2', 'W3', 'W5'], 'W4', 1, 0, 'normal')).toEqual([['W2', 'W3', 'W4'], ['W3', 'W4', 'W5']]);
    expect(legalChiOptions(['W2', 'W3'], 'W4', 2, 0, 'normal')).toEqual([]);
    expect(legalChiOptions(['W2', 'W3'], 'W4', 1, 0, 'xi')).toEqual([]);
  });

  it('allows ordinary 1-2-3 chi but does not let real fish act as its original face', () => {
    expect(legalChiOptions(['T1', 'T2'], 'T3', 1, 0, 'normal', { fishTile: 'T1' })).toEqual([['T1', 'T2', 'T3']]);
    expect(legalChiOptions(['B4', 'B5'], 'B3', 1, 0, 'normal', { fishTile: 'B5' })).toEqual([]);
    expect(legalChiOptions(['B4', 'B5'], 'B3', 1, 0, 'normal', { fishTile: 'W9' })).toEqual([['B3', 'B4', 'B5']]);
  });

  it('allows fake-fish 幺鸡 to chi as the fish original face but blocks real fish as its original face', () => {
    expect(legalChiOptions(['T3', 'T4', 'B8'], 'T1', 1, 0, 'normal', { fishTile: 'T5' })).toEqual([['T3', 'T4', 'T1']]);
    expect(legalChiOptions(['T4', 'T6', 'B8'], 'T1', 1, 0, 'normal', { fishTile: 'T5' })).toEqual([['T4', 'T1', 'T6']]);
    expect(legalChiOptions(['T3', 'T4'], 'T5', 1, 0, 'normal', { fishTile: 'T5' })).toEqual([]);
    expect(legalChiOptions(['T3', 'T1'], 'T2', 0, 3, 'normal', { fishTile: 'T3' })).toEqual([['T3', 'T2', 'T1']]);
  });

  it('resolves simultaneous hu by seat order after discarder', () => {
    expect(resolveWinningSeat(0, [3, 2, 1])).toBe(1);
    expect(resolveWinningSeat(2, [0, 1, 3])).toBe(3);
  });

  it('requires non-dealer turns to draw before discarding when no response action is taken', () => {
    const game = makeGame({ seed: 2, dealerSeat: 0 });
    finishOpeningXi(game);
    const dealerDiscard = game.players[0].hand[0];
    applyAction(game, { type: 'DISCARD', seat: 0, tile: dealerDiscard });

    // If someone can respond, pass all pending responses first.
    for (let seat = 1; seat <= 3 && game.phase === 'responding'; seat++) {
      if (availableActions(game, seat).includes('PASS')) applyAction(game, { type: 'PASS', seat });
    }

    expect(game.currentSeat).toBe(1);
    expect(availableActions(game, 1)).toContain('DRAW');
    expect(availableActions(game, 1)).not.toContain('DISCARD');
    expect(() => applyAction(game, { type: 'DISCARD', seat: 1, tile: game.players[1].hand[0] })).toThrow('必须先摸牌');

    applyAction(game, { type: 'DRAW', seat: 1 });
    expect(availableActions(game, 1)).toContain('DISCARD');
  });

  it('requires all seats to finish opening xi before the dealer can discard', () => {
    const game = makeGame({ seed: 2, dealerSeat: 0 });
    expect(game.players[0].hand).toHaveLength(17);
    expect(game.openingXiDone).toBe(false);
    expect(availableActions(game, 0)).toContain('END_XI');
    expect(availableActions(game, 0)).not.toContain('DISCARD');
    expect(availableActions(game, 0)).not.toContain('DRAW');
    expect(() => applyAction(game, { type: 'DISCARD', seat: 0, tile: game.players[0].hand[0] })).toThrow('所有玩家结束开局亮喜');

    applyAction(game, { type: 'END_XI', seat: 0 });
    expect(game.currentSeat).toBe(1);
    expect(game.turnDrawn).toBe(false);
    expect(availableActions(game, 1)).toContain('END_XI');
    expect(availableActions(game, 1)).not.toContain('DRAW');

    applyAction(game, { type: 'END_XI', seat: 1 });
    applyAction(game, { type: 'END_XI', seat: 2 });
    applyAction(game, { type: 'END_XI', seat: 3 });

    expect(game.openingXiDone).toBe(true);
    expect(game.currentSeat).toBe(0);
    expect(game.turnDrawn).toBe(true);
    expect(availableActions(game, 0)).toContain('DISCARD');
  });

  it('does not require supplement draw after dealer xi on the opening turn', () => {
    const game = makeGame({ seed: 2, dealerSeat: 0 });
    game.fishTile = 'W3';
    game.players[0].hand = ['Zhong','Fa','Bai','W1','W2','W3','W4','W5','W6','W7','W8','W9','T2','T3','T4','T5','T6'];

    applyAction(game, { type: 'DECLARE_XI', seat: 0, name: '中发白' });
    expect(game.pendingXiSupplement).toBe(false);
    expect(availableActions(game, 0)).toContain('END_XI');
    expect(availableActions(game, 0)).not.toContain('DISCARD');
    finishOpeningXi(game);
    expect(availableActions(game, 0)).toContain('DISCARD');
    expect(availableActions(game, 0)).not.toContain('END_XI');
  });

  it('allows repeated opening xi declarations without a supplement draw', () => {
    const game = makeGame({ seed: 3, dealerSeat: 0 });
    game.currentSeat = 1;
    game.openingXiDone = false;
    game.turnDrawn = false;
    game.drawnTile = undefined;
    game.xiWindowOpen = true;
    game.fishTile = 'W3';
    game.wall = ['T9', 'W9', 'B9', 'W1', 'W2', 'W3'];
    game.players[1].hand = ['Zhong','Fa','Bai','Zhong','W8','T5','B1','B2','B3','B4','B5','B6','B7','B8','B9','T2'];

    const wallBefore = game.wall.length;
    applyAction(game, { type: 'DECLARE_XI', seat: 1, name: '中发白' });
    expect(game.players[1].hand).toHaveLength(13);
    expect(game.wall).toHaveLength(wallBefore);
    expect(game.pendingXiSupplement).toBe(false);
    expect(availableActions(game, 1)).toEqual(expect.arrayContaining(['DECLARE_XI', 'END_XI']));
    expect(availableActions(game, 1)).not.toContain('DRAW');
    expect(availableActions(game, 1)).not.toContain('DISCARD');

    applyAction(game, { type: 'DECLARE_XI', seat: 1, name: '中八叉' });
    expect(game.players[1].hand).toHaveLength(10);
    expect(game.wall).toHaveLength(wallBefore);

    applyAction(game, { type: 'END_XI', seat: 1 });
    expect(game.players[1].hand).toHaveLength(10);
    expect(game.wall).toHaveLength(wallBefore);
    expect(game.pendingXiSupplement).toBe(false);
    expect(game.currentSeat).toBe(2);
  });

  it('allows non-dealer to declare xi during opening before their first draw', () => {
    const game = makeGame({ seed: 16, dealerSeat: 0 });
    applyAction(game, { type: 'END_XI', seat: 0 });
    game.fishTile = 'T8';
    game.players[1].discarded = [];
    game.players[1].hand = ['W2','W3','W8','W9','T2','T3','T4','T8','W1','B9','B1','B2','B3','B4','B5','B6'];

    expect(game.currentSeat).toBe(1);
    expect(game.turnDrawn).toBe(false);
    expect(availableActions(game, 1)).toContain('DECLARE_XI');
    expect(availableActions(game, 1)).not.toContain('DRAW');
    expect(() => applyAction(game, { type: 'DECLARE_XI', seat: 1, name: '老虎喜儿' })).not.toThrow();
    expect(game.pendingXiSupplement).toBe(false);
  });

  it('allows dealer to declare another opening xi after one xi without requiring a supplement', () => {
    const game = makeGame({ seed: 6, dealerSeat: 0 });
    game.currentSeat = 0;
    game.openingXiDone = false;
    game.turnDrawn = true;
    game.xiWindowOpen = true;
    game.pendingXiSupplement = false;
    game.fishTile = 'T8';
    game.players[0].hand = ['T5','W5','B5','T8','T8','W1','W1','B9','B1','W2','W3','W4','T2','T3','T4','Zhong','Fa'];

    applyAction(game, { type: 'DECLARE_XI', seat: 0, name: '五喜儿' });

    expect(game.pendingXiSupplement).toBe(false);
    expect(availableActions(game, 0)).toContain('DECLARE_XI');
    expect(() => applyAction(game, { type: 'DECLARE_XI', seat: 0, name: '老虎喜儿' })).not.toThrow();
  });

  it('allows white dragon to be passed onto any declared xi one tile at a time', () => {
    const game = makeGame({ seed: 4, dealerSeat: 0 });
    game.currentSeat = 1;
    game.openingXiDone = true;
    game.turnDrawn = true;
    game.drawnTile = { seat: 1, tile: 'Bai' };
    game.xiWindowOpen = false;
    game.pendingXiSupplement = false;
    game.fishTile = 'W3';
    game.wall = ['T9', 'W9', 'B9', 'W1', 'W2', 'W3'];
    game.players[1].hand = ['Bai', 'W1', 'W2'];
    game.players[1].discarded = ['W9'];
    game.players[1].melds = [{ type: 'xi', name: '中八叉', tiles: ['Zhong', 'W8', 'T5'] }];

    expect(availableActions(game, 1)).toContain('GUO');
    applyAction(game, { type: 'GUO', seat: 1, tile: 'Bai' });

    expect(game.players[1].melds[0].tiles).toEqual(['Zhong', 'W8', 'T5', 'Bai']);
    expect(game.players[1].hand).toHaveLength(3);
    expect(game.players[1].hand).not.toContain('Bai');
    expect(game.log.at(-2)).toMatchObject({ type: 'guo', seat: 1, tile: 'Bai' });
    expect(game.log.at(-1)).toMatchObject({ type: 'guoSupplement', seat: 1 });
  });

  it('does not let fake-fish 幺鸡 pass onto a Fish placeholder xi', () => {
    const game = makeGame({ seed: 18, dealerSeat: 0 });
    finishOpeningXi(game);
    game.currentSeat = 0;
    game.turnDrawn = true;
    game.drawnTile = { seat: 0, tile: 'W8' };
    game.xiWindowOpen = false;
    game.pendingXiSupplement = false;
    game.fishTile = 'B2';
    game.wall = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
    game.players[0].hand = ['T1', 'W8', 'W1'];
    game.players[0].melds = [{ type: 'xi', name: '鱼八叉', tiles: ['B2', 'W8', 'T5'] }];

    expect(availableActions(game, 0)).toContain('GUO');
    expect(() => applyAction(game, { type: 'GUO', seat: 0, tile: 'T1' })).toThrow('不能过这张牌');
    expect(() => applyAction(game, { type: 'GUO', seat: 0, tile: 'W8' })).not.toThrow();
    expect(game.players[0].melds[0].tiles).toContain('W8');
  });

  it('keeps true fish and fake fish separated during guo', () => {
    const game = makeGame({ seed: 19, dealerSeat: 0 });
    finishOpeningXi(game);
    game.currentSeat = 1;
    game.turnDrawn = true;
    game.drawnTile = { seat: 1, tile: 'W5' };
    game.xiWindowOpen = false;
    game.pendingXiSupplement = false;
    game.fishTile = 'T2';
    game.wall = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
    game.players[1].hand = ['B1', 'T1', 'T2', 'Fa', 'Bai', 'W5'];
    game.players[1].melds = [{ type: 'xi', name: '鱼发白', tiles: ['T2', 'Fa', 'Bai'] }];

    expect(() => applyAction(game, { type: 'GUO', seat: 1, tile: 'B1' })).toThrow('不能过这张牌');
    expect(() => applyAction(game, { type: 'GUO', seat: 1, tile: 'T1' })).toThrow('不能过这张牌');
    expect(() => applyAction(game, { type: 'GUO', seat: 1, tile: 'T2' })).not.toThrow();
    expect(game.players[1].melds[0].tiles).toEqual(['T2', 'Fa', 'Bai', 'T2']);
  });

  it('allows guo only after an actual draw/supplement, not merely the dealer opening hand', () => {
    const game = makeGame({ seed: 5, dealerSeat: 0 });
    game.currentSeat = 0;
    game.turnDrawn = true;
    game.xiWindowOpen = false;
    game.pendingXiSupplement = false;
    game.fishTile = 'W3';
    game.players[0].hand = ['Bai', 'W1', 'W2'];
    game.players[0].melds = [{ type: 'xi', name: '中八叉', tiles: ['Zhong', 'W8', 'T5'] }];

    expect(availableActions(game, 0)).not.toContain('GUO');
    expect(() => applyAction(game, { type: 'GUO', seat: 0, tile: 'Bai' })).toThrow('必须抓牌后才能过牌');

    game.drawnTile = { seat: 0, tile: 'Bai' };
    expect(availableActions(game, 0)).toContain('GUO');
  });

  it('does not reopen xi after the opening xi phase has finished', () => {
    const game = makeGame({ seed: 9, dealerSeat: 0 });
    game.currentSeat = 1;
    game.openingXiDone = true;
    game.turnDrawn = true;
    game.drawnTile = { seat: 1, tile: 'T2' };
    game.xiWindowOpen = true;
    game.pendingXiSupplement = false;
    game.fishTile = 'W3';
    game.wall = ['T9', 'W9', 'B9', 'W1', 'W2', 'W3'];
    game.players[1].hand = ['Zhong','Fa','Bai','Zhong','W8','T5','B1','B2','B3','B4','B5','B6','B7','B8','B9','T2'];

    expect(availableActions(game, 1)).not.toContain('DECLARE_XI');
    expect(() => applyAction(game, { type: 'DECLARE_XI', seat: 1, name: '中发白' })).toThrow('亮喜只能在开局摸第一张牌前进行');
  });

  it('requires discard hu to be 加胡 instead of any winning shape', () => {
    const game = makeGame({ seed: 7, dealerSeat: 0 });
    finishOpeningXi(game);
    game.currentSeat = 3;
    game.turnDrawn = false;
    game.xiWindowOpen = true;
    game.fishTile = 'T9';
    game.phase = 'responding';
    game.lastDiscard = { seat: 2, tile: 'W6', source: 'normal' };
    game.response = { discardSeat: 2, tile: 'W6', source: 'normal', passed: [] };
    game.players[2].discarded = ['W6'];
    game.players[3].hand = ['W1','W1','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Zhong','W2','W3','W4','W4','W5'];

    expect(isWinningHand([...game.players[3].hand, 'W6'], { fishTile: game.fishTile }).canHu).toBe(true);
    expect(availableActions(game, 3)).not.toContain('HU');
    expect(() => applyAction(game, { type: 'HU', seat: 3 })).toThrow('不能胡');

    game.lastDiscard = { seat: 2, tile: 'W5', source: 'normal' };
    game.response = { discardSeat: 2, tile: 'W5', source: 'normal', passed: [] };
    game.players[2].discarded = ['W5'];
    game.players[3].hand = ['W1','W1','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Zhong','W2','W3','W4','W4','W6'];
    expect(availableActions(game, 3)).toContain('HU');
  });

  it('offers bu gang when a player draws the fourth tile after an existing peng', () => {
    const game = makeGame({ seed: 8, dealerSeat: 0 });
    finishOpeningXi(game);
    game.currentSeat = 0;
    game.turnDrawn = true;
    game.xiWindowOpen = false;
    game.pendingXiSupplement = false;
    game.players[0].hand = ['Bai','W1','W2'];
    game.players[0].melds = [{ type: 'peng', tiles: ['Bai','Bai','Bai'], fromSeat: 1 }];

    expect(availableActions(game, 0)).toContain('BU_GANG');
    applyAction(game, { type: 'BU_GANG', seat: 0, tile: 'Bai' });
    expect(game.players[0].hand).not.toContain('Bai');
    expect(game.players[0].melds[0]).toMatchObject({ type: 'mingGang', tiles: ['Bai','Bai','Bai','Bai'] });
    expect(game.log.at(-2)).toMatchObject({ type: 'buGang', seat: 0, tile: 'Bai' });
  });

  it('uses a bounded response window and clears stale discards before the next draw', () => {
    const game = makeGame({ seed: 11, dealerSeat: 0 });
    finishOpeningXi(game);
    game.fishTile = 'T9';
    game.players[0].hand = ['W1','W2','W3','W4','W5','W6','W7','W8','W9','T2','T3','T4','B2','B3','B4','Zhong','Fa'];
    game.players[1].hand = ['W2','W3','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Fa','Fa','Bai','Bai','W7','W8'];
    game.players[2].hand = ['W4','W4','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Fa','Fa','Bai','Bai','W7','W8'];
    game.players[3].hand = ['W5','W5','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Fa','Fa','Bai','Bai','W7','W8'];

    applyAction(game, { type: 'DISCARD', seat: 0, tile: 'W1' });
    expect(game.phase).toBe('responding');
    expect(availableActions(game, 1)).toEqual(expect.arrayContaining(['CHI', 'PASS']));
    applyAction(game, { type: 'PASS', seat: 1 });
    expect(game.phase).toBe('playing');
    expect(game.lastDiscard).toBeUndefined();
    expect(availableActions(game, 1)).toContain('DRAW');
    expect(availableActions(game, 2)).not.toContain('PENG');
  });

  it('gives hu priority over peng/chi during discard response', () => {
    const game = makeGame({ seed: 12, dealerSeat: 0 });
    finishOpeningXi(game);
    game.currentSeat = 0;
    game.turnDrawn = true;
    game.fishTile = 'W9';
    game.players[0].hand = ['W1','W2','W3','W4','W5','W6','T2','T3','T4','B2','B3','B4','Zhong','Fa','Bai','W7','W8'];
    game.players[1].hand = ['W1','W1','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Zhong','W2','W3','W4','W4','W6'];
    game.players[2].hand = ['W5','W5','W5','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Fa','Fa','Bai','Bai','W8'];

    applyAction(game, { type: 'DISCARD', seat: 0, tile: 'W5' });
    expect(availableActions(game, 1)).toContain('HU');
    expect(availableActions(game, 2)).toContain('MING_GANG');
    expect(() => applyAction(game, { type: 'MING_GANG', seat: 2 })).toThrow('更高优先级');
    applyAction(game, { type: 'HU', seat: 1 });
    expect(game.phase).toBe('settlement');
    expect(game.winnerSeat).toBe(1);
  });

  it('rejects self draw hu and an gang outside legal current-turn timing', () => {
    const game = makeGame({ seed: 13, dealerSeat: 0 });
    finishOpeningXi(game);
    game.currentSeat = 1;
    game.turnDrawn = false;
    game.players[2].hand = ['W1','W1','W2','W3','W4','W2','W3','W4','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Zhong'];
    expect(() => applyAction(game, { type: 'HU', seat: 2 })).toThrow('只有当前玩家能自摸胡');

    game.players[1].hand = ['Bai','Bai','Bai','Bai','W1','W2','W3','T1','T2','T3','B1','B2','B3','Zhong','Zhong','Fa'];
    expect(availableActions(game, 1)).not.toContain('AN_GANG');
    expect(() => applyAction(game, { type: 'AN_GANG', seat: 1, tile: 'Bai' })).toThrow('必须先摸牌');
  });

  it('does not mutate game state when an illegal response action is rejected', () => {
    const game = makeGame({ seed: 14, dealerSeat: 0 });
    finishOpeningXi(game);
    game.phase = 'responding';
    game.lastDiscard = { seat: 0, tile: 'W9', source: 'normal' };
    game.response = { discardSeat: 0, tile: 'W9', source: 'normal', passed: [] };
    game.players[0].discarded = ['W9'];
    game.players[1].hand = ['W1','W2','W3','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Fa','Fa','Bai','Bai','W8'];
    const before = JSON.stringify(game);
    expect(() => applyAction(game, { type: 'PENG', seat: 1 })).toThrow('不能碰');
    expect(JSON.stringify(game)).toBe(before);
  });
});

describe('betting and settlement', () => {
  it('starts from betting, accepts base/zha/buy fish, then enters playing', () => {
    const game = makeGame({ seed: 7, dealerSeat: 0, phase: 'betting' });
    applyAction(game, { type: 'SET_BASE', seat: 0, baseScore: 5 });
    expect(game.baseScore).toBe(5);
    for (let seat = 0; seat < 4; seat++) applyAction(game, { type: 'SET_BET', seat, zha: seat === 1, buyFish: seat });
    expect(game.phase).toBe('playing');
    expect(game.bets[1].zha).toBe(true);
    expect(game.bets.reduce((s, b) => s + b.buyFish, 0)).toBe(6);
  });

  it('settles self draw with bought fish and keeps scores', () => {
    const game = makeGame({ seed: 8, dealerSeat: 0 });
    finishOpeningXi(game);
    game.baseScore = 2;
    game.fishTile = 'W6';
    game.bets = [
      { zha: false, buyFish: 1, ready: true },
      { zha: false, buyFish: 0, ready: true },
      { zha: false, buyFish: 2, ready: true },
      { zha: false, buyFish: 0, ready: true },
    ];
    game.currentSeat = 2;
    game.turnDrawn = true;
    game.players[2].hand = ['W1','W1','W2','W3','W4','W2','W3','W4','T2','T3','T4','B2','B3','B4','W6','W6','W6'];
    applyAction(game, { type: 'HU', seat: 2 });
    expect(game.phase).toBe('settlement');
    expect(game.settlement?.fishTotal).toBe(6);
    expect(game.settlement?.deltas[2].delta).toBe(84);
    expect(game.scores[2]).toBe(1084);
  });
});

describe('hu and fenzhang', () => {
  it('recognizes a simple pair plus five melds winning shape', () => {
    const hand: TileCode[] = ['W1','W1','W2','W3','W4','W2','W3','W4','T2','T3','T4','B2','B3','B4','Zhong','Zhong','Zhong'];
    const result = isWinningHand(hand, { fishTile: 'W9' });
    expect(result.canHu).toBe(true);
  });

  it('keeps fish and real 幺鸡 as swapped identities for hu instead of collapsing both to 幺鸡', () => {
    const hand: TileCode[] = ['W4','W5','W6','T5','T6','T7','T7','T8','T1','B8','B8','B8','T9','T9'];
    const result = isWinningHand(hand, { fishTile: 'T9' });
    expect(result.canHu).toBe(true);
  });

  it('fenzhang stops at the first seat that can self draw', () => {
    const game = makeGame({ seed: 1, dealerSeat: 0 });
    game.phase = 'fenzhang';
    game.players[0].hand = ['W1','W1','W2','W3','W4','W2','W3','W4','T2','T3','T4','B2','B3','B4','Zhong','Zhong'];
    game.players[1].hand = ['W1','W1','W2','W3','W4','W2','W3','W4','T2','T3','T4','B2','B3','B4','Fa','Fa'];
    game.wall = ['Zhong', 'Fa', 'W9', 'B9'];
    const outcome = runFenZhang(game);
    expect(outcome.winnerSeat).toBe(0);
  });
});
