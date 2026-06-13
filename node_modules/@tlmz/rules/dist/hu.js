import { countTiles, isNumberTile, makeTile, rankOf, suitOf } from './tiles.js';
import { logicalTile } from './fish.js';
function effectiveTileForHu(tile, ctx) {
    // 胡牌拆解和喜牌命名、前端排序保持同一套“鱼/幺鸡互换”语义：
    // 本场真鱼按幺鸡(T1)算；若真鱼不是 T1，则手里的幺鸡按本场鱼的原始牌面算。
    // 不能只把鱼压成 T1，否则鱼=T9 时同时有 T9 和 T1 会被合并成多张 T1，丢掉原本的九条身份。
    return logicalTile(tile, ctx);
}
function dec(m, t, n = 1) { m.set(t, (m.get(t) ?? 0) - n); if ((m.get(t) ?? 0) <= 0)
    m.delete(t); }
function inc(m, t, n = 1) { m.set(t, (m.get(t) ?? 0) + n); }
function firstTile(m) { return [...m.keys()].sort()[0]; }
function canMeldAll(m) {
    const t = firstTile(m);
    if (!t)
        return true;
    const n = m.get(t) ?? 0;
    if (n >= 3) {
        dec(m, t, 3);
        if (canMeldAll(m)) {
            inc(m, t, 3);
            return true;
        }
        inc(m, t, 3);
    }
    if (isNumberTile(t)) {
        const s = suitOf(t);
        const r = rankOf(t);
        const a = makeTile(s, r + 1), b = makeTile(s, r + 2);
        if (r <= 7 && (m.get(a) ?? 0) > 0 && (m.get(b) ?? 0) > 0) {
            dec(m, t);
            dec(m, a);
            dec(m, b);
            if (canMeldAll(m)) {
                inc(m, t);
                inc(m, a);
                inc(m, b);
                return true;
            }
            inc(m, t);
            inc(m, a);
            inc(m, b);
        }
    }
    return false;
}
export function isWinningHand(hand, ctx) {
    if (hand.length % 3 !== 2)
        return { canHu: false, reason: '张数不符合 3n+2' };
    const normalized = hand.map(t => effectiveTileForHu(t, ctx));
    const counts = countTiles(normalized);
    for (const [pair, n] of [...counts])
        if (n >= 2) {
            const m = new Map(counts);
            dec(m, pair, 2);
            if (canMeldAll(m))
                return { canHu: true };
        }
    return { canHu: false, reason: '不能拆成将+面子' };
}
function canMeldAllAfterJia(m) {
    return canMeldAll(m);
}
function isJiaSequence(seq, winningTile) {
    if (!seq.includes(winningTile))
        return false;
    const ranks = seq.map(t => rankOf(t)).sort((a, b) => a - b);
    const winRank = rankOf(winningTile);
    // 加胡只认边张/夹张：12 胡 3、89 胡 7，或中间夹一张。
    const edgeWait = (ranks[0] === 1 && ranks[1] === 2 && ranks[2] === 3 && winRank === 3)
        || (ranks[0] === 7 && ranks[1] === 8 && ranks[2] === 9 && winRank === 7);
    const closedWait = winRank === ranks[1];
    return edgeWait || closedWait;
}
export function isJiaHuWithTile(handWithoutWinningTile, winningTile, ctx) {
    const normalizedHand = handWithoutWinningTile.map(t => effectiveTileForHu(t, ctx));
    const normalizedWin = effectiveTileForHu(winningTile, ctx);
    const all = [...normalizedHand, normalizedWin];
    if (all.length % 3 !== 2)
        return { canHu: false, reason: '张数不符合 3n+2' };
    if (!isNumberTile(normalizedWin))
        return { canHu: false, reason: '加胡必须是边张或夹张' };
    const counts = countTiles(all);
    for (const [pair, n] of [...counts])
        if (n >= 2) {
            const withoutPair = new Map(counts);
            dec(withoutPair, pair, 2);
            const s = suitOf(normalizedWin);
            const r = rankOf(normalizedWin);
            for (const start of [r - 2, r - 1, r]) {
                if (start < 1 || start + 2 > 9)
                    continue;
                const seq = [makeTile(s, start), makeTile(s, start + 1), makeTile(s, start + 2)];
                if (!isJiaSequence(seq, normalizedWin))
                    continue;
                const m = new Map(withoutPair);
                let ok = true;
                for (const t of seq) {
                    if ((m.get(t) ?? 0) <= 0) {
                        ok = false;
                        break;
                    }
                    dec(m, t);
                }
                if (ok && canMeldAllAfterJia(m))
                    return { canHu: true };
            }
        }
    return { canHu: false, reason: '只能加胡：边张/夹张，不能两面、单钓或对倒' };
}
