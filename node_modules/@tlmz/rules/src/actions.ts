import { countTiles, isNumberTile, makeTile, rankOf, suitOf, type TileCode } from './tiles.js';
import { logicalTile, type FishContext } from './fish.js';

export type DiscardSource = 'normal' | 'xi';

function effectiveTileForChi(tile: TileCode, ctx?: FishContext): TileCode {
  return ctx ? logicalTile(tile, ctx) : tile;
}

function isChiSequenceTile(tile: TileCode, ctx?: FishContext): boolean {
  // 吃牌按“鱼/幺鸡互换”后的有效牌面判断：
  // - 真鱼按幺鸡(T1)算，不能当原始牌面吃；
  // - 幺鸡在鱼不是 T1 时按本场鱼的原始牌面算，可以作为“假鱼”参与对应顺子；
  // - 交换后的有效牌面如果组成合法顺子，也可以吃，例如鱼是三条时，真三条(作一条)+二条+真幺鸡(作三条)。
  const effective = effectiveTileForChi(tile, ctx);
  return isNumberTile(effective);
}

function takeMatchingTile(available: TileCode[], effectiveNeed: TileCode, ctx?: FishContext): TileCode | undefined {
  const i = available.findIndex(tile => isChiSequenceTile(tile, ctx) && effectiveTileForChi(tile, ctx) === effectiveNeed);
  if (i < 0) return undefined;
  const [tile] = available.splice(i, 1);
  return tile;
}

export function legalChiOptions(hand: TileCode[], discard: TileCode, seat: number, discarderSeat: number, source: DiscardSource, ctx?: FishContext): TileCode[][] {
  const effectiveDiscard = effectiveTileForChi(discard, ctx);
  if (source === 'xi' || seat !== ((discarderSeat + 1) % 4) || !isChiSequenceTile(discard, ctx)) return [];

  const s = suitOf(effectiveDiscard)!;
  const r = rankOf(effectiveDiscard)!;
  const out: TileCode[][] = [];

  for (const start of [r - 2, r - 1, r]) {
    if (start < 1 || start + 2 > 9) continue;
    const effectiveSeq = [makeTile(s, start), makeTile(s, start + 1), makeTile(s, start + 2)];
    const available = [...hand];
    const chosen: TileCode[] = [];
    let ok = true;
    for (const effectiveTile of effectiveSeq) {
      if (effectiveTile === effectiveDiscard && !chosen.includes(discard)) {
        chosen.push(discard);
        continue;
      }
      const actual = takeMatchingTile(available, effectiveTile, ctx);
      if (!actual) { ok = false; break; }
      chosen.push(actual);
    }
    if (ok) out.push(chosen);
  }
  return out;
}

export function canPeng(hand: TileCode[], tile: TileCode): boolean { return (countTiles(hand).get(tile) ?? 0) >= 2; }
export function canMingGang(hand: TileCode[], tile: TileCode): boolean { return (countTiles(hand).get(tile) ?? 0) >= 3; }
export function canAnGang(hand: TileCode[], tile: TileCode): boolean { return (countTiles(hand).get(tile) ?? 0) >= 4; }
export function canBuGang(melds: { type: string; tiles: TileCode[] }[], hand: TileCode[], tile?: TileCode): boolean {
  return melds.some(m => m.type === 'peng' && m.tiles.some(t => (tile ? t === tile : (countTiles(hand).get(t) ?? 0) > 0)));
}
export function resolveWinningSeat(discarderSeat: number, winningSeats: number[]): number | undefined {
  const set = new Set(winningSeats); for (let i=1;i<=3;i++) { const s=(discarderSeat+i)%4; if (set.has(s)) return s; } return undefined;
}
