import { countTiles } from './tiles.js';
import { matchesXiPatternToken } from './fish.js';
export const xiDefs = [
    ['中发白', ['Zhong', 'Fa', 'Bai']], ['中发鱼', ['Zhong', 'Fa', 'Fish']], ['中发九', ['Zhong', 'Fa', 'T9']],
    ['鱼中白', ['Fish', 'Zhong', 'Bai']], ['鱼发白', ['Fish', 'Fa', 'Bai']], ['鱼中九', ['Fish', 'Zhong', 'T9']],
    ['鱼发九', ['Fish', 'Fa', 'T9']], ['鱼钩白', ['Fish', 'T9', 'Bai']], ['中八叉', ['Zhong', 'W8', 'T5']],
    ['鱼八叉', ['Fish', 'W8', 'T5']], ['老虎喜儿', ['Fish', 'W1', 'B9']], ['幺八白', ['W1', 'W8', 'Bai']],
    ['幺二拐', ['W1', 'T2', 'B7']], ['江里蹦', ['W9', 'T8', 'Bai']], ['万钩千', ['W1', 'T9', 'Fa']],
    ['幺喜儿', ['Fish', 'W1', 'B1']], ['五喜儿', ['T5', 'W5', 'B5']], ['九喜儿', ['T9', 'W9', 'B9']], ['中九九', ['Zhong', 'W9', 'T9']],
].map(([name, pattern]) => ({ name: name, pattern: pattern }));
export function findXiSets(hand, ctx) {
    const counts = countTiles(hand);
    const out = [];
    for (const def of xiDefs) {
        const remaining = new Map(counts);
        const tiles = [];
        let ok = true;
        for (const token of def.pattern) {
            if (token === 'Fish') {
                if ((remaining.get(ctx.fishTile) ?? 0) <= 0) {
                    ok = false;
                    break;
                }
                remaining.set(ctx.fishTile, (remaining.get(ctx.fishTile) ?? 0) - 1);
                tiles.push(ctx.fishTile);
                continue;
            }
            const actual = [...remaining.keys()].find((tile) => (remaining.get(tile) ?? 0) > 0 && matchesXiPatternToken(tile, token, ctx));
            if (!actual) {
                ok = false;
                break;
            }
            remaining.set(actual, (remaining.get(actual) ?? 0) - 1);
            tiles.push(actual);
        }
        if (ok)
            out.push({ name: def.name, pattern: def.pattern, tiles });
    }
    return out;
}
