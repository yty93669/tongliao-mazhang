import type { GameState } from './state.js';
import { isWinningHand } from './hu.js';
import { settleGame } from './settlement.js';
export function runFenZhang(game: GameState): { winnerSeat?: number; game: GameState } {
  const ctx={fishTile:game.fishTile};
  for (let i=0; i<4 && game.wall.length>0; i++) {
    const seat=(game.currentSeat+i)%4; const tile=game.wall.shift()!; game.players[seat].hand.push(tile); game.log.push({type:'fenzhangDraw', seat, tile});
    if (isWinningHand(game.players[seat].hand, ctx).canHu) { game.phase='settlement'; game.winnerSeat=seat; game.settlement=settleGame(game, seat, true); game.log.push({type:'hu', seat, via:'fenzhang', settlement: game.settlement}); return {winnerSeat:seat, game}; }
  }
  game.phase='finished'; return { game };
}
