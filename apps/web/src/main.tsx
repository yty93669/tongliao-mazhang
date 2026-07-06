import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
import { MockPreview } from './mock-preview';

type Tile = string;
type Meld = { type: string; tiles: Tile[]; fromSeat?: number; name?: string };
type Player = { seat: number; name: string; hand: Tile[]; melds: Meld[]; discarded: Tile[]; connected?: boolean };
type RoundBet = { zha: boolean; buyFish: number; ready: boolean };
type ScoreDelta = { seat: number; before: number; delta: number; after: number; detail: string };
type Settlement = {
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
type GameState = {
  roomId: string;
  phase: string;
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
  pendingXiSupplement: boolean;
  wall: Tile[];
  revealedFishTile: Tile;
  fishTile: Tile;
  players: Player[];
  log: unknown[];
  lastDiscard?: { seat: number; tile: Tile; source: 'normal' | 'xi' };
  drawnTile?: { seat: number; tile: Tile };
  winnerSeat?: number;
};

const labels: Record<string, string> = { Zhong: '中', Fa: '发', Bai: '白', BACK: '牌背' };
const phaseLabels: Record<string, string> = {
  waiting: '等待玩家',
  betting: '本局设置',
  playing: '进行中',
  responding: '响应中',
  fenzhang: '分张',
  settlement: '结算',
  finished: '结束',
};
const windLabels = ['东', '南', '西', '北'];
const actionLabels: Record<string, string> = {
  DISCARD: '出牌',
  DRAW: '摸牌',
  HU: '胡',
  CHI: '吃',
  PENG: '碰',
  MING_GANG: '明杠',
  BU_GANG: '补杠',
  AN_GANG: '暗杠',
  GUO: '过牌',
  PASS: '过',
  END_XI: '结束亮喜',
  DECLARE_XI: '亮喜',
  FENZHANG: '分张',
  NEXT_ROUND: '下一局',
  SET_BASE: '基础分',
  SET_BET: '扎针买鱼',
};
const directionLabels = ['自己', '下家', '对家', '上家'];
const tileOrder = new Map<string, number>([
  ...['W', 'T', 'B'].flatMap((suit, suitIndex) =>
    Array.from({ length: 9 }, (_, index) => [`${suit}${index + 1}`, suitIndex * 9 + index] as [string, number]),
  ),
  ['Zhong', 27],
  ['Fa', 28],
  ['Bai', 29],
  ['BACK', 99],
]);
const xiDefs: Array<[string, Tile[]]> = [
  ['中发白', ['Zhong', 'Fa', 'Bai']],
  ['中发鱼', ['Zhong', 'Fa', 'Fish' as Tile]],
  ['中发九', ['Zhong', 'Fa', 'T9']],
  ['鱼中白', ['Fish' as Tile, 'Zhong', 'Bai']],
  ['鱼发白', ['Fish' as Tile, 'Fa', 'Bai']],
  ['鱼中九', ['Fish' as Tile, 'Zhong', 'T9']],
  ['鱼发九', ['Fish' as Tile, 'Fa', 'T9']],
  ['鱼钩白', ['Fish' as Tile, 'T9', 'Bai']],
  ['中八叉', ['Zhong', 'W8', 'T5']],
  ['鱼八叉', ['Fish' as Tile, 'W8', 'T5']],
  ['老虎喜儿', ['Fish' as Tile, 'W1', 'B9']],
  ['幺八白', ['W1', 'W8', 'Bai']],
  ['幺二拐', ['W1', 'T2', 'B7']],
  ['江里漂', ['W9', 'T8', 'Bai']],
  ['万钩吊', ['W1', 'T9', 'Fa']],
  ['幺喜儿', ['Fish' as Tile, 'W1', 'B1']],
  ['五喜儿', ['T5', 'W5', 'B5']],
  ['九喜儿', ['T9', 'W9', 'B9']],
  ['中九九', ['Zhong', 'W9', 'T9']],
];

function label(tile: Tile) {
  if (labels[tile]) return labels[tile];
  const suitMap: Record<string, string> = { W: '万', T: '条', B: '筒' };
  const numMap: Record<string, string> = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '七', '8': '八', '9': '九' };
  return `${numMap[tile[1]]}${suitMap[tile[0]]}`;
}

function phaseLabel(phase: string) {
  return phaseLabels[phase] ?? phase;
}

function tileImage(tile: Tile) {
  if (tile === 'BACK') return '/mahjong/back.png';
  const map: Record<string, string> = { W: 'm', T: 's', B: 'p', Zhong: '7z', Fa: '6z', Bai: '5z' };
  if (tile === 'Zhong' || tile === 'Fa' || tile === 'Bai') return `/mahjong/${map[tile]}.svg`;
  return `/mahjong/${tile[1]}${map[tile[0]]}.svg`;
}

function wsUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/ws`;
}

function relativeSeat(me: number, target: number) {
  return (target - me + 4) % 4;
}

function seatDirection(me: number, target: number) {
  return directionLabels[relativeSeat(me, target)];
}

function seatName(player: Player | undefined, fallbackSeat: number) {
  return player?.name || `玩家${fallbackSeat + 1}`;
}

function orderKey(tile: Tile, fish: Tile) {
  if (tile === fish) return tileOrder.get('T1') ?? 999;
  if (tile === 'T1' && fish !== 'T1') return tileOrder.get(fish) ?? 999;
  return tileOrder.get(tile) ?? 999;
}

function sortTilesForView(tiles: Tile[], fish: Tile) {
  return [...tiles].sort((a, b) => orderKey(a, fish) - orderKey(b, fish));
}

function tilesForView(tiles: Tile[], fish: Tile, drawn?: Tile) {
  if (!drawn) return sortTilesForView(tiles, fish).map(tile => ({ tile, drawn: false }));
  const base = [...tiles];
  const index = base.lastIndexOf(drawn);
  if (index >= 0) base.splice(index, 1);
  return [...sortTilesForView(base, fish).map(tile => ({ tile, drawn: false })), { tile: drawn, drawn: true }];
}

function logicalTile(tile: Tile, fish: Tile): Tile {
  if (tile === fish) return 'T1';
  if (tile === 'T1' && fish !== 'T1') return fish;
  return tile;
}

function matchesXiPatternTokenClient(tile: Tile, token: Tile, fish: Tile) {
  if (token === 'Fish') return tile === fish;
  return logicalTile(tile, fish) === token;
}

function xiMelds(player?: Player) {
  return player?.melds.filter(meld => meld.type === 'xi') ?? [];
}

function xiPatternForMeld(meld: Meld) {
  return xiDefs.find(([name]) => name === meld.name)?.[1];
}

function canGuoToMeldClient(meld: Meld, tile: Tile, fish: Tile) {
  if (tile === 'Bai') return true;
  const pattern = xiPatternForMeld(meld);
  return !!pattern?.some(token => matchesXiPatternTokenClient(tile, token, fish));
}

function canGuoTileClient(player: Player | undefined, tile: Tile, fish: Tile) {
  const melds = xiMelds(player);
  if (!melds.length) return false;
  return melds.some(meld => canGuoToMeldClient(meld, tile, fish));
}

function isNumberTile(tile: Tile) {
  return /^[WTB][1-9]$/.test(tile);
}

function rankOf(tile: Tile) {
  return Number(tile.slice(1));
}

function makeTile(suit: string, rank: number) {
  return `${suit}${rank}`;
}

function effectiveTileForChiClient(tile: Tile, fish: Tile) {
  return logicalTile(tile, fish);
}

function isChiSequenceTileClient(tile: Tile, fish: Tile) {
  return isNumberTile(effectiveTileForChiClient(tile, fish));
}

function legalChiOptionsClient(hand: Tile[], discard?: Tile, seat?: number, discarderSeat?: number, source?: 'normal' | 'xi', fish?: Tile) {
  if (seat == null || discarderSeat == null || source !== 'normal' || !discard || !fish || seat !== ((discarderSeat + 1) % 4) || !isChiSequenceTileClient(discard, fish)) {
    return [] as Tile[][];
  }
  const effectiveDiscard = effectiveTileForChiClient(discard, fish);
  const suit = effectiveDiscard[0];
  const rank = rankOf(effectiveDiscard);
  const out: Tile[][] = [];
  for (const start of [rank - 2, rank - 1, rank]) {
    if (start < 1 || start + 2 > 9) continue;
    const effectiveSeq = [makeTile(suit, start), makeTile(suit, start + 1), makeTile(suit, start + 2)];
    const available = [...hand];
    const chosen: Tile[] = [];
    let ok = true;
    for (const effectiveTile of effectiveSeq) {
      if (effectiveTile === effectiveDiscard && !chosen.includes(discard)) {
        chosen.push(discard);
        continue;
      }
      const idx = available.findIndex(tile => isChiSequenceTileClient(tile, fish) && effectiveTileForChiClient(tile, fish) === effectiveTile);
      if (idx < 0) {
        ok = false;
        break;
      }
      chosen.push(available.splice(idx, 1)[0]);
    }
    if (ok) out.push(chosen);
  }
  return out;
}

const responsePriority: Record<string, number> = { HU: 3, MING_GANG: 2, PENG: 2, CHI: 1 };

function responseDistance(discarderSeat: number, seat: number) {
  return (seat - discarderSeat + 4) % 4;
}

function canResolveResponseAction(state: GameState, actionsBySeat: Record<number, string[]>, seat: number, type: string) {
  if (state.phase !== 'responding' || !state.lastDiscard || responsePriority[type] == null) return true;
  const pending = [0, 1, 2, 3].flatMap(currentSeat =>
    (actionsBySeat[currentSeat] ?? [])
      .filter(action => responsePriority[action] != null)
      .map(action => ({ seat: currentSeat, type: action, priority: responsePriority[action] })),
  );
  if (!pending.length) return true;
  const priority = responsePriority[type];
  const maxPriority = Math.max(...pending.map(item => item.priority));
  if (priority < maxPriority) return false;
  const firstSamePriority = pending
    .filter(item => item.priority === priority)
    .sort((a, b) => responseDistance(state.lastDiscard!.seat, a.seat) - responseDistance(state.lastDiscard!.seat, b.seat))[0];
  return firstSamePriority?.seat === seat;
}

function findXiNamesForButtons(hand: Tile[], fish: Tile) {
  const baseCounts = new Map<Tile, number>();
  for (const tile of hand) baseCounts.set(tile, (baseCounts.get(tile) ?? 0) + 1);
  const names: string[] = [];
  for (const [name, pattern] of xiDefs) {
    const remaining = new Map(baseCounts);
    let ok = true;
    for (const token of pattern) {
      if (token === 'Fish') {
        if ((remaining.get(fish) ?? 0) <= 0) {
          ok = false;
          break;
        }
        remaining.set(fish, (remaining.get(fish) ?? 0) - 1);
        continue;
      }
      const actual = Array.from(remaining.keys()).find(tile => (remaining.get(tile) ?? 0) > 0 && matchesXiPatternTokenClient(tile, token, fish));
      if (!actual) {
        ok = false;
        break;
      }
      remaining.set(actual, (remaining.get(actual) ?? 0) - 1);
    }
    if (ok) names.push(name);
  }
  return names;
}

function availableBuGangTiles(player: Player | undefined) {
  if (!player) return [];
  return player.melds
    .filter(meld => meld.type === 'peng')
    .map(meld => meld.tiles[0])
    .filter((tile, index, list) => player.hand.includes(tile) && list.indexOf(tile) === index);
}

function availableAnGangTiles(player: Player | undefined) {
  if (!player) return [];
  const counts = new Map<Tile, number>();
  for (const tile of player.hand) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  return Array.from(counts.entries()).filter(([, count]) => count >= 4).map(([tile]) => tile);
}

function compactActions(actions: string[]) {
  return actions.map(action => actionLabels[action] ?? action);
}

function App() {
  const [name, setName] = useState(`玩家${Math.floor(Math.random() * 100)}`);
  const [room, setRoom] = useState('');
  const [seat, setSeat] = useState<number>();
  const [state, setState] = useState<GameState>();
  const [actionsBySeat, setActionsBySeat] = useState<Record<number, string[]>>({});
  const [connectedCount, setConnectedCount] = useState(0);
  const [canStart, setCanStart] = useState(false);
  const [msg, setMsg] = useState('连接中...');
  const [guoMode, setGuoMode] = useState(false);
  const [baseInput, setBaseInput] = useState(1);
  const [zhaInput, setZhaInput] = useState(false);
  const [buyFishInput, setBuyFishInput] = useState(0);
  const ws = useRef<WebSocket>();

  useEffect(() => {
    const socket = new WebSocket(wsUrl());
    ws.current = socket;
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.type === 'ROOM_CREATED') {
        setRoom(message.roomId);
        setMsg(`房间已创建：${message.roomId}`);
      }
      if (message.type === 'JOINED') {
        setSeat(message.seat);
        setRoom(message.roomId);
        setMsg(`已加入房间 ${message.roomId}，座位 ${message.seat + 1}`);
      }
      if (message.type === 'STATE') {
        setState(message.state);
        setSeat(message.seat);
        setActionsBySeat(message.actionsBySeat ?? { [message.seat]: message.actions ?? [] });
        setConnectedCount(message.connectedCount ?? 0);
        setCanStart(!!message.canStart);
        if (message.state?.phase === 'waiting') {
          setMsg((message.connectedCount ?? 0) === 4 ? '四人已到齐，可以开始。' : `等待玩家加入 ${message.connectedCount ?? 0}/4`);
        } else {
          setMsg('');
        }
      }
      if (message.type === 'ERROR') setMsg(message.error);
    };
    socket.onopen = () => setMsg('已连接');
    socket.onclose = () => setMsg('连接已断开，请刷新页面重连');
    return () => socket.close();
  }, []);

  const send = (payload: unknown) => ws.current?.send(JSON.stringify(payload));
  const action = (payload: unknown) => send({ type: 'ACTION', action: payload });
  const me = useMemo(() => (seat == null ? undefined : state?.players[seat]), [seat, state]);
  const myActions = seat == null ? [] : (actionsBySeat[seat] ?? []);

  useEffect(() => {
    if (guoMode && !myActions.includes('GUO')) setGuoMode(false);
  }, [guoMode, myActions]);

  const myChiOptions = useMemo(() => {
    if (!state || seat == null || !me) return [] as Tile[][];
    return legalChiOptionsClient(me.hand, state.lastDiscard?.tile, seat, state.lastDiscard?.seat, state.lastDiscard?.source, state.fishTile);
  }, [me, seat, state]);

  const guoTiles = useMemo(() => {
    if (!me || !state) return new Set<Tile>();
    return new Set(me.hand.filter(tile => canGuoTileClient(me, tile, state.fishTile)));
  }, [me, state]);

  const tablePlayers = useMemo(() => {
    if (!state || seat == null) return [];
    return [0, 1, 2, 3].map(offset => state.players[(seat + offset) % 4]);
  }, [seat, state]);

  const buGangTiles = useMemo(() => availableBuGangTiles(me), [me]);
  const anGangTiles = useMemo(() => availableAnGangTiles(me), [me]);

  if (!state || seat == null || !me) {
    return (
      <div className="page-shell">
        <div className="lobby-card">
          <div className="brand-kicker">房间入口</div>
          <h1>进入麻将房间</h1>
          <p>一人创建房间，把 6 位房间号发给其他玩家，四个页面进入同一局。</p>
          <label className="field">
            <span>昵称</span>
            <input value={name} onChange={event => setName(event.target.value)} placeholder="输入你的昵称" />
          </label>
          <label className="field">
            <span>房间号</span>
            <input value={room} onChange={event => setRoom(event.target.value)} placeholder="输入 6 位房间号" />
          </label>
          <div className="lobby-actions">
            <button onClick={() => send({ type: 'CREATE_ROOM' })}>创建房间</button>
            <button disabled={!room.trim() || !name.trim()} onClick={() => send({ type: 'JOIN', roomId: room.trim(), name: name.trim() })}>加入房间</button>
          </div>
          <div className="lobby-message">{msg}</div>
        </div>
      </div>
    );
  }

  const topPlayer = tablePlayers[2];
  const leftPlayer = tablePlayers[3];
  const rightPlayer = tablePlayers[1];
  const roundSetupDone = state.phase !== 'betting';
  const currentSeatName = seatName(state.players[state.currentSeat], state.currentSeat);
  const currentStatus = state.phase === 'betting'
    ? '请先完成本局设置'
    : state.phase === 'responding' && state.lastDiscard
      ? `等待响应 ${label(state.lastDiscard.tile)}`
      : `轮到 ${currentSeatName}`;

  return (
    <div className="page-shell">
      <div className="board">
        <div className="topbar">
          <div className="box fish-box">
            <div className="fish-title">本局鱼牌</div>
            {roundSetupDone ? <Tile size="small" tile={state.fishTile} /> : <div className="hidden-fish-tile" />}
            <div className="fish-name">{roundSetupDone ? label(state.fishTile) : '本局设置后显示'}</div>
          </div>

          <div className="box info-bar">
            <div className="brand-block">
              <div className="brand-kicker">TONGLIAO MAHJONG</div>
              <div className="brand-title">通辽麻将 第 {state.round} 局</div>
            </div>
            <div className="meta-list">
              <div className="meta-pill">房号 {room}</div>
              <div className="meta-pill">{windLabels[(state.round - 1) % 4] ?? '东'}一局</div>
              <div className="meta-pill">{connectedCount} / 4 人</div>
            </div>
          </div>
        </div>

        <TopSeat player={topPlayer} me={seat} state={state} revealed={roundSetupDone} />

        <section className="table-row">
          <SideSeat player={leftPlayer} me={seat} state={state} side="left" revealed={roundSetupDone} />

          <main className="side-center">
            <div className="center-band center-band-top">
              <MeldArea player={topPlayer} fish={state.fishTile} size="mid" revealed={roundSetupDone} />
              <DiscardArea tiles={topPlayer.discarded} fish={state.fishTile} className="top-river" size="mid" limit={18} revealed={roundSetupDone} />
            </div>

            <div className="center-column left">
              <SideLaneRows player={leftPlayer} fish={state.fishTile} kind="melds" revealed={roundSetupDone} />
              <SideLaneRows player={leftPlayer} fish={state.fishTile} kind="discards" revealed={roundSetupDone} />
            </div>

            <div className="center-core">
              <div className="turn-pill">{currentStatus}</div>
              <div className="center-winds">
                <div className="winds-inner">
                  <div className="wind-east">东</div>
                  <div className="wind-south">南</div>
                  <div className="wind-west">西</div>
                  <div className="wind-north">北</div>
                  <div className="dealer-mark">庄</div>
                </div>
              </div>
              <div className="stat-row">
                <div className="box stat-card">
                  <div className="stat-label">剩余张数</div>
                  <div className="stat-value">{state.wall.length}</div>
                </div>
                <div className="box stat-card">
                  <div className="stat-label">当前鱼牌</div>
                  <div className="stat-value">{roundSetupDone ? label(state.fishTile) : '--'}</div>
                </div>
              </div>
            </div>

            <div className="center-column right">
              <SideLaneRows player={rightPlayer} fish={state.fishTile} kind="discards" revealed={roundSetupDone} />
              <SideLaneRows player={rightPlayer} fish={state.fishTile} kind="melds" revealed={roundSetupDone} />
            </div>

            <div className="center-band center-band-bottom">
              <DiscardArea tiles={me.discarded} fish={state.fishTile} className="bottom-river" size="small" limit={24} revealed={roundSetupDone} />
              <MeldArea player={me} fish={state.fishTile} size="mid" revealed={roundSetupDone} />
            </div>
          </main>

          <SideSeat player={rightPlayer} me={seat} state={state} side="right" revealed={roundSetupDone} />
        </section>

        <BottomSeat
          player={me}
          seat={seat}
          state={state}
          actions={myActions}
          guoMode={guoMode}
          guoTiles={guoTiles}
          revealed={roundSetupDone}
          onTileClick={tile => (guoMode ? action({ type: 'GUO', seat, tile }) : action({ type: 'DISCARD', seat, tile }))}
        />
      </div>

      <div className="table-aux">
        <StatusBox state={state} seat={seat} msg={msg} canStart={canStart} connectedCount={connectedCount} room={room} onStart={() => send({ type: 'START', roomId: room })} />
        {(hasVisibleAction(myActions) || state.phase === 'betting' || state.phase === 'settlement') && (
          <section className="box aux-panel">
            {state.phase === 'betting' ? (
              <BettingPanel
                state={state}
                seat={seat}
                baseInput={baseInput}
                zhaInput={zhaInput}
                buyFishInput={buyFishInput}
                onBaseInput={setBaseInput}
                onZhaInput={setZhaInput}
                onBuyFishInput={setBuyFishInput}
                onAction={action}
              />
            ) : state.phase === 'settlement' ? (
              <SettlementPanel state={state} seat={seat} onAction={action} />
            ) : (
              <SeatActionPanel
                state={state}
                actionsBySeat={actionsBySeat}
                seat={seat}
                actions={myActions}
                chiOptions={myChiOptions}
                guoMode={guoMode}
                onGuoMode={setGuoMode}
                onAction={action}
                buGangTiles={buGangTiles}
                anGangTiles={anGangTiles}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function hasVisibleAction(actions: string[]) {
  return actions.some(action => ['PASS', 'HU', 'CHI', 'PENG', 'MING_GANG', 'BU_GANG', 'AN_GANG', 'GUO', 'END_XI', 'DECLARE_XI', 'DRAW', 'FENZHANG', 'DISCARD'].includes(action));
}

function Tile({ tile, size, className }: { tile: Tile; size: 'small' | 'mid' | 'big'; className?: string }) {
  return (
    <div className={`tile ${size} ${className ?? ''}`}>
      <img src={tileImage(tile)} alt={label(tile)} />
    </div>
  );
}

function TileList({ tiles, fish, size, drawn, clickable, canClickTile, onClick }: { tiles: Tile[]; fish: Tile; size: 'small' | 'mid' | 'big'; drawn?: Tile; clickable?: boolean; canClickTile?: (tile: Tile) => boolean; onClick?: (tile: Tile) => void }) {
  const shown = size === 'big' ? tilesForView(tiles, fish, drawn) : tiles.map(tile => ({ tile, drawn: false }));
  return (
    <>
      {shown.map(({ tile, drawn: isDrawn }, index) => {
        const active = !!clickable && (!canClickTile || canClickTile(tile));
        return (
          <button
            key={`${tile}-${index}`}
            className={`plain-tile-button ${active ? 'active' : ''} ${isDrawn ? 'drawn-gap' : ''}`}
            disabled={!active}
            onClick={() => onClick?.(tile)}
            title={label(tile)}
          >
            <Tile tile={tile} size={size} />
          </button>
        );
      })}
    </>
  );
}

function PlayerCard({ player, me, state, badge, status }: { player: Player; me: number; state: GameState; badge: string; status: string }) {
  return (
    <div className="box player-card">
      <div className="player-head">
        <div className="avatar-badge">{badge}</div>
        <div className="player-meta">
          <div className="player-name">{player.name}</div>
          <div className="player-score">{state.scores[player.seat]} 分</div>
        </div>
      </div>
      <div className="player-status">{status || seatDirection(me, player.seat)}</div>
    </div>
  );
}

function TopSeat({ player, me, state, revealed }: { player: Player; me: number; state: GameState; revealed: boolean }) {
  return (
    <section className="top-seat">
      <div className="top-main">
        <div className="seat-caption">上家手牌</div>
        <div className="top-hand">
          <BackRow count={player.hand.length} vertical={false} />
        </div>
      </div>
      <PlayerCard player={player} me={me} state={state} badge="对" status={revealed && player.seat === state.currentSeat ? '等待出牌' : seatDirection(me, player.seat)} />
    </section>
  );
}

function SideSeat({ player, me, state, side, revealed }: { player: Player; me: number; state: GameState; side: 'left' | 'right'; revealed: boolean }) {
  const badge = side === 'left' ? '上' : '下';
  return (
    <aside className={`side-seat ${side === 'right' ? 'right' : ''}`}>
      {side === 'left' && (
        <div className="side-meta">
          <PlayerCard player={player} me={me} state={state} badge={badge} status={revealed ? seatDirection(me, player.seat) : '等待设置'} />
        </div>
      )}
      <div className="side-stack">
        <div className="seat-caption" style={side === 'right' ? { textAlign: 'right' } : undefined}>{side === 'left' ? '左家手牌' : '右家手牌'}</div>
        <div className="side-block">
          <div className="stack-v">
            <BackRow count={player.hand.length} vertical />
          </div>
        </div>
      </div>
      {side === 'right' && (
        <div className="side-meta">
          <PlayerCard player={player} me={me} state={state} badge={badge} status={revealed ? seatDirection(me, player.seat) : '等待设置'} />
        </div>
      )}
    </aside>
  );
}

function BackRow({ count, vertical }: { count: number; vertical?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={vertical ? 'back-v' : 'back-h'} />
      ))}
    </>
  );
}

function BackBigRow({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <Tile key={index} tile="BACK" size="big" />
      ))}
    </>
  );
}

function MeldArea({ player, fish, size, revealed }: { player: Player; fish: Tile; size: 'small' | 'mid'; revealed: boolean }) {
  return (
    <div className="meld-strip">
      <div className="meld-line">
        {!revealed ? <div className="action-note">设置后显示</div> : player.melds.length ? player.melds.map((meld, index) => <MeldSet key={index} meld={meld} fish={fish} size={size} />) : <div className="action-note">暂无</div>}
      </div>
    </div>
  );
}

function MeldSet({ meld, fish, size }: { meld: Meld; fish: Tile; size: 'small' | 'mid' }) {
  return (
    <div className="meld-set">
      {meld.tiles.map((tile, index) => <Tile key={`${tile}-${index}`} tile={tile} size={size} />)}
      <div className="action-note">{meld.name ?? actionLabels[meld.type] ?? meld.type}</div>
    </div>
  );
}

function DiscardArea({ tiles, fish, className, size, limit, revealed }: { tiles: Tile[]; fish: Tile; className: string; size: 'small' | 'mid'; limit: number; revealed: boolean }) {
  return (
    <div className={className}>
      {revealed ? tiles.slice(-limit).map((tile, index) => <Tile key={`${tile}-${index}`} tile={tile} size={size} />) : <div className="action-note">暂无</div>}
    </div>
  );
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

function SideLaneRows({ player, fish, kind, revealed }: { player: Player; fish: Tile; kind: 'melds' | 'discards'; revealed: boolean }) {
  if (!revealed) {
    return <div className="side-lane"><div className="side-row"><div className="action-note">设置后显示</div></div></div>;
  }
  if (kind === 'melds') {
    const rows = chunk(player.melds, 2);
    return (
      <div className="side-lane">
        {rows.length ? rows.map((row, rowIndex) => (
          <div key={rowIndex} className="side-row">
            {row.map((meld, index) => <MeldSet key={index} meld={meld} fish={fish} size="small" />)}
          </div>
        )) : <div className="side-row"><div className="action-note">暂无</div></div>}
      </div>
    );
  }

  const rows = chunk(player.discarded.slice(-16), 4);
  return (
    <div className="side-lane">
      {rows.length ? rows.map((row, rowIndex) => (
        <div key={rowIndex} className="side-row">
          {row.map((tile, index) => <Tile key={`${tile}-${index}`} tile={tile} size="mid" />)}
        </div>
      )) : <div className="side-row"><div className="action-note">暂无</div></div>}
    </div>
  );
}

function BottomSeat({
  player,
  seat,
  state,
  actions,
  guoMode,
  guoTiles,
  revealed,
  onTileClick,
}: {
  player: Player;
  seat: number;
  state: GameState;
  actions: string[];
  guoMode: boolean;
  guoTiles: Set<Tile>;
  revealed: boolean;
  onTileClick: (tile: Tile) => void;
}) {
  return (
    <section className="bottom-seat">
      <div className="bottom-main">
        <div className="seat-caption">我的手牌</div>
        <div className="bottom-hand">
          {revealed ? (
            <TileList
              tiles={player.hand}
              fish={state.fishTile}
              size="big"
              drawn={state.drawnTile?.seat === seat ? state.drawnTile.tile : undefined}
              clickable={actions.includes('DISCARD') || guoMode}
              canClickTile={guoMode ? tile => guoTiles.has(tile) : undefined}
              onClick={onTileClick}
            />
          ) : (
            <BackBigRow count={player.hand.length} />
          )}
        </div>
      </div>

      <div className="box player-card self-card">
        <div className="player-head">
          <div className="avatar-badge">我</div>
          <div className="player-meta">
            <div className="player-name">{player.name}</div>
            <div className="player-score">{state.scores[player.seat]} 分</div>
          </div>
        </div>
        <div className="player-status">{player.seat === state.currentSeat ? '当前出牌' : '等待轮到'}</div>
      </div>
    </section>
  );
}

function StatusBox({ state, seat, msg, canStart, connectedCount, room, onStart }: { state: GameState; seat: number; msg: string; canStart: boolean; connectedCount: number; room: string; onStart: () => void }) {
  return (
    <section className="box aux-panel">
      <div className="aux-title-row">
        <strong>牌桌状态</strong>
        <span>{phaseLabel(state.phase)}</span>
      </div>
      <div className="aux-meta-grid">
        <div>座位 {seat + 1}</div>
        <div>基础分 {state.baseScore}</div>
        <div>房号 {room}</div>
        <div>人数 {connectedCount}/4</div>
      </div>
      <div className="aux-note">{msg || `当前轮到 ${seatName(state.players[state.currentSeat], state.currentSeat)}`}</div>
      {state.phase === 'waiting' && <button disabled={!canStart} onClick={onStart}>开始游戏</button>}
    </section>
  );
}

function SeatActionPanel({
  state,
  actionsBySeat,
  seat,
  actions,
  chiOptions,
  guoMode,
  onGuoMode,
  onAction,
  buGangTiles,
  anGangTiles,
}: {
  state: GameState;
  actionsBySeat: Record<number, string[]>;
  seat: number;
  actions: string[];
  chiOptions: Tile[][];
  guoMode: boolean;
  onGuoMode: (value: boolean) => void;
  onAction: (action: unknown) => void;
  buGangTiles: Tile[];
  anGangTiles: Tile[];
}) {
  const player = state.players[seat];
  const canResolve = (type: string) => canResolveResponseAction(state, actionsBySeat, seat, type);
  const waitingHigher = state.phase === 'responding' && ['HU', 'MING_GANG', 'PENG', 'CHI'].some(action => actions.includes(action) && !canResolve(action));
  const hasRespondPass = state.phase === 'responding' && actions.includes('PASS');

  return (
    <div>
      <div className="aux-title-row">
        <strong>当前操作</strong>
        <span>{compactActions(actions).join(' / ') || '暂无'}</span>
      </div>
      <div className="action-list">
        {hasRespondPass && <button onClick={() => onAction({ type: 'PASS', seat })}>过</button>}
        <button disabled={!actions.includes('HU') || !canResolve('HU')} onClick={() => onAction({ type: 'HU', seat })}>胡</button>
        {actions.includes('CHI') && chiOptions.length > 1
          ? chiOptions.map((option, index) => <button key={index} disabled={!canResolve('CHI')} onClick={() => onAction({ type: 'CHI', seat, tiles: option })}>吃 {option.map(label).join('')}</button>)
          : <button disabled={!actions.includes('CHI') || !canResolve('CHI')} onClick={() => onAction({ type: 'CHI', seat, tiles: chiOptions[0] })}>吃</button>}
        <button disabled={!actions.includes('PENG') || !canResolve('PENG')} onClick={() => onAction({ type: 'PENG', seat })}>碰</button>
        <button disabled={!actions.includes('MING_GANG') || !canResolve('MING_GANG')} onClick={() => onAction({ type: 'MING_GANG', seat })}>明杠</button>
        {actions.includes('BU_GANG') && buGangTiles.length > 1
          ? buGangTiles.map(tile => <button key={tile} onClick={() => onAction({ type: 'BU_GANG', seat, tile })}>补杠 {label(tile)}</button>)
          : <button disabled={!actions.includes('BU_GANG')} onClick={() => onAction({ type: 'BU_GANG', seat, tile: buGangTiles[0] })}>补杠</button>}
        {actions.includes('AN_GANG') && anGangTiles.length > 1
          ? anGangTiles.map(tile => <button key={tile} onClick={() => onAction({ type: 'AN_GANG', seat, tile })}>暗杠 {label(tile)}</button>)
          : <button disabled={!actions.includes('AN_GANG')} onClick={() => onAction({ type: 'AN_GANG', seat, tile: anGangTiles[0] })}>暗杠</button>}
        {!guoMode && <button disabled={!actions.includes('GUO')} onClick={() => onGuoMode(true)}>过牌</button>}
        {guoMode && <button onClick={() => onGuoMode(false)}>结束过牌</button>}
        <button disabled={!actions.includes('END_XI')} onClick={() => onAction({ type: 'END_XI', seat })}>结束亮喜</button>
        <XiButtons hand={player.hand} fish={state.fishTile} enabled={actions.includes('DECLARE_XI')} onXi={name => onAction({ type: 'DECLARE_XI', seat, name })} />
        <button disabled={!actions.includes('DRAW')} onClick={() => onAction({ type: 'DRAW', seat })}>摸牌</button>
        <button disabled={!actions.includes('FENZHANG')} onClick={() => onAction({ type: 'FENZHANG', seat })}>分张</button>
      </div>
      {waitingHigher && <div className="aux-note">还有更高优先级响应，需等待前位玩家先处理。</div>}
      {guoMode && <div className="aux-note">点击手牌中的可用牌执行过牌。</div>}
    </div>
  );
}

function XiButtons({ hand, fish, enabled, onXi }: { hand: Tile[]; fish: Tile; enabled: boolean; onXi: (name: string) => void }) {
  const names = findXiNamesForButtons(hand, fish);
  return <>{names.map(name => <button key={name} disabled={!enabled} onClick={() => onXi(name)}>亮喜 {name}</button>)}</>;
}

function BettingPanel({
  state,
  seat,
  baseInput,
  zhaInput,
  buyFishInput,
  onBaseInput,
  onZhaInput,
  onBuyFishInput,
  onAction,
}: {
  state: GameState;
  seat: number;
  baseInput: number;
  zhaInput: boolean;
  buyFishInput: number;
  onBaseInput: (value: number) => void;
  onZhaInput: (value: boolean) => void;
  onBuyFishInput: (value: number) => void;
  onAction: (payload: unknown) => void;
}) {
  return (
    <div>
      <div className="aux-title-row">
        <strong>本局设置</strong>
        <span>开局前</span>
      </div>
      {seat === state.dealerSeat && (
        <div className="inline-controls">
          <input type="number" min="1" value={baseInput} onChange={event => onBaseInput(Number(event.target.value) || 1)} />
          <button onClick={() => onAction({ type: 'SET_BASE', seat, baseScore: baseInput })}>设置基础分</button>
        </div>
      )}
      <div className="bet-options">
        <label><input type="checkbox" checked={zhaInput} onChange={event => onZhaInput(event.target.checked)} /> 扎针</label>
        <label>买鱼 <input type="number" min="0" value={buyFishInput} onChange={event => onBuyFishInput(Math.max(0, Number(event.target.value) || 0))} /></label>
      </div>
      <button disabled={state.bets[seat]?.ready} onClick={() => onAction({ type: 'SET_BET', seat, zha: zhaInput, buyFish: buyFishInput })}>{state.bets[seat]?.ready ? '已确认' : '确认本局设置'}</button>
    </div>
  );
}

function SettlementPanel({ state, seat, onAction }: { state: GameState; seat: number; onAction: (action: unknown) => void }) {
  const settlement = state.settlement;
  return (
    <div>
      <div className="aux-title-row">
        <strong>结算</strong>
        <span>{settlement?.selfDraw ? '自摸' : '点炮胡'}</span>
      </div>
      {settlement && (
        <table className="score-table">
          <thead><tr><th>玩家</th><th>原积分</th><th>本局</th><th>现积分</th></tr></thead>
          <tbody>
            {settlement.deltas.map(delta => (
              <tr key={delta.seat}>
                <td>{state.players[delta.seat]?.name}</td>
                <td>{delta.before}</td>
                <td className={delta.delta >= 0 ? 'plus' : 'minus'}>{delta.delta > 0 ? '+' : ''}{delta.delta}</td>
                <td>{delta.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button disabled={state.readyNext[seat]} onClick={() => onAction({ type: 'NEXT_ROUND', seat })}>{state.readyNext[seat] ? '已准备下一局' : '下一局'}</button>
    </div>
  );
}

const params = new URLSearchParams(window.location.search);

createRoot(document.getElementById('root')!).render(params.get('mock') === '1' ? <MockPreview /> : <App />);
