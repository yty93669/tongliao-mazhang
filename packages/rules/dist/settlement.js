function countTile(tiles, tile) { return tiles.filter(t => t === tile).length; }
export function ownFishCount(game, seat, winningDiscard) {
    const p = game.players[seat];
    let n = countTile(p.hand, game.fishTile);
    for (const m of p.melds) {
        n += countTile(m.tiles, game.fishTile);
        if (m.type === 'mingGang')
            n += 1;
        if (m.type === 'anGang')
            n += 2;
    }
    if (winningDiscard === game.fishTile)
        n += 1;
    return n;
}
function transfer(deltas, from, to, amount) {
    if (amount <= 0 || from === to)
        return;
    deltas[from] -= amount;
    deltas[to] += amount;
}
function pointPaoMultiplier(winnerZha, discarderZha, zhaCount) {
    if (zhaCount === 0)
        return 4;
    if (zhaCount === 3)
        return 8;
    if (zhaCount === 1)
        return winnerZha || discarderZha ? 8 : 5;
    if (zhaCount === 2)
        return winnerZha || discarderZha ? 8 : 7;
    return 4;
}
function selfDrawMultiplier(winnerZha, payerZha, zhaCount) {
    if (zhaCount === 0)
        return 2;
    if (zhaCount === 3)
        return 4;
    if (winnerZha)
        return 4;
    return payerZha ? 4 : 2;
}
export function settleGame(game, winnerSeat, selfDraw, discarderSeat) {
    const baseScore = game.baseScore || 1;
    const boughtFishTotal = game.bets.reduce((sum, b) => sum + Math.max(0, b.buyFish || 0), 0);
    const ownFish = ownFishCount(game, winnerSeat, !selfDraw ? game.lastDiscard?.tile : undefined);
    const fishTotal = ownFish + boughtFishTotal;
    const unit = (fishTotal + 1) * baseScore;
    const zhaSeats = game.bets.map((b, i) => b.zha ? i : -1).filter(i => i >= 0);
    const zhaCount = zhaSeats.length;
    const deltas = [0, 0, 0, 0];
    if (selfDraw) {
        for (let s = 0; s < 4; s++)
            if (s !== winnerSeat)
                transfer(deltas, s, winnerSeat, selfDrawMultiplier(game.bets[winnerSeat].zha, game.bets[s].zha, zhaCount) * unit);
    }
    else {
        const from = discarderSeat ?? game.lastDiscard?.seat;
        if (from == null)
            throw new Error('点炮结算缺少点炮者');
        transfer(deltas, from, winnerSeat, pointPaoMultiplier(game.bets[winnerSeat].zha, game.bets[from].zha, zhaCount) * unit);
    }
    const before = [...game.scores];
    const scoreDeltas = deltas.map((delta, seat) => ({ seat, before: before[seat], delta, after: before[seat] + delta, detail: delta === 0 ? '无输赢' : `${delta > 0 ? '赢' : '输'}${Math.abs(delta)}分` }));
    game.scores = scoreDeltas.map(d => d.after);
    return { winnerSeat, selfDraw, baseScore, fishTotal, ownFish, boughtFishTotal, zhaSeats, discarderSeat, deltas: scoreDeltas };
}
