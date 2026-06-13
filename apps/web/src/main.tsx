import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

type Tile = string;
type Meld = { type: string; tiles: Tile[]; fromSeat?: number; name?: string };
type Player = { seat: number; name: string; hand: Tile[]; melds: Meld[]; discarded: Tile[]; connected?: boolean };
type RoundBet = { zha: boolean; buyFish: number; ready: boolean };
type ScoreDelta = { seat: number; before: number; delta: number; after: number; detail: string };
type Settlement = { winnerSeat: number; selfDraw: boolean; baseScore: number; fishTotal: number; ownFish: number; boughtFishTotal: number; zhaSeats: number[]; discarderSeat?: number; deltas: ScoreDelta[] };
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
  log: any[];
  lastDiscard?: { seat: number; tile: Tile; source: 'normal' | 'xi' };
  drawnTile?: { seat: number; tile: Tile };
  winnerSeat?: number;
};

const labels: Record<string, string> = { Zhong: '中', Fa: '发', Bai: '白', BACK: '牌背' };
const tileOrder = new Map<string, number>([
  ...['W', 'T', 'B'].flatMap((suit, suitIndex) => Array.from({ length: 9 }, (_, i) => [`${suit}${i + 1}`, suitIndex * 9 + i] as [string, number])),
  ['Zhong', 27], ['Fa', 28], ['Bai', 29], ['BACK', 99],
]);

function label(tile: Tile) {
  if (labels[tile]) return labels[tile];
  const suitMap: Record<string, string> = { W: '万', T: '条', B: '饼' };
  const numMap: Record<string, string> = { '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六', '7': '七', '8': '八', '9': '九' };
  return `${numMap[tile[1]]}${suitMap[tile[0]]}`;
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

function xiMelds(player?: Player) {
  return player?.melds.filter(meld => meld.type === 'xi') ?? [];
}

function xiPatternForMeld(meld: Meld) {
  return xiDefs.find(([name]) => name === meld.name)?.[1];
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

function makeTile(suit: string, rank: number) {
  return `${suit}${rank}`;
}

function rankOf(tile: Tile) {
  return Number(tile.slice(1));
}

function effectiveTileForChiClient(tile: Tile, fish: Tile) {
  return logicalTile(tile, fish);
}

function isChiSequenceTileClient(tile: Tile, fish: Tile) {
  return isNumberTile(effectiveTileForChiClient(tile, fish));
}

function legalChiOptionsClient(hand: Tile[], discard?: Tile, seat?: number, discarderSeat?: number, source?: 'normal' | 'xi', fish?: Tile) {
  if (seat == null || discarderSeat == null || source !== 'normal' || !discard || !fish || seat !== ((discarderSeat + 1) % 4) || !isChiSequenceTileClient(discard, fish)) return [] as Tile[][];
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
  const pending = [0, 1, 2, 3].flatMap(currentSeat => (actionsBySeat[currentSeat] ?? [])
    .filter(action => responsePriority[action] != null)
    .map(action => ({ seat: currentSeat, type: action, priority: responsePriority[action] })));
  if (!pending.length) return true;
  const priority = responsePriority[type];
  const maxPriority = Math.max(...pending.map(item => item.priority));
  if (priority < maxPriority) return false;
  const firstSamePriority = pending
    .filter(item => item.priority === priority)
    .sort((a, b) => responseDistance(state.lastDiscard!.seat, a.seat) - responseDistance(state.lastDiscard!.seat, b.seat))[0];
  return firstSamePriority?.seat === seat;
}

function seatName(player: Player | undefined, fallbackSeat: number) {
  return player?.name || `玩家${fallbackSeat + 1}`;
}

function relativeSeat(me: number, target: number) {
  return (target - me + 4) % 4;
}

function opponentLabel(me: number, target: number) {
  const rel = relativeSeat(me, target);
  if (rel === 1) return '右家';
  if (rel === 2) return '对家';
  if (rel === 3) return '左家';
  return '自己';
}

function App() {
  const [name, setName] = useState(`玩家${Math.floor(Math.random() * 100)}`);
  const [room, setRoom] = useState('');
  const [seat, setSeat] = useState<number>();
  const [state, setState] = useState<GameState>();
  const [actionsBySeat, setActionsBySeat] = useState<Record<number, string[]>>({});
  const [connectedCount, setConnectedCount] = useState(0);
  const [canStart, setCanStart] = useState(false);
  const [msg, setMsg] = useState('未连接');
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
        setMsg(`房间已创建：${message.roomId}，把房间号发给其他玩家。`);
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
    socket.onopen = () => setMsg('已连接服务器');
    socket.onclose = () => setMsg('连接已断开，请刷新页面重连');
    return () => socket.close();
  }, []);

  const send = (payload: any) => ws.current?.send(JSON.stringify(payload));
  const me = useMemo(() => seat == null ? undefined : state?.players[seat], [state, seat]);
  const myActions = seat == null ? [] : (actionsBySeat[seat] ?? []);

  useEffect(() => {
    if (guoMode && !myActions.includes('GUO')) setGuoMode(false);
  }, [guoMode, myActions]);

  const action = (payload: any) => send({ type: 'ACTION', action: payload });

  const orderedPlayers = useMemo(() => {
    if (!state || seat == null) return [];
    return [
      state.players[(seat + 2) % 4],
      state.players[(seat + 1) % 4],
      state.players[(seat + 3) % 4],
    ];
  }, [seat, state]);

  const myChiOptions = useMemo(() => {
    if (!state || seat == null || !me) return [] as Tile[][];
    return legalChiOptionsClient(me.hand, state.lastDiscard?.tile, seat, state.lastDiscard?.seat, state.lastDiscard?.source, state.fishTile);
  }, [me, seat, state]);

  const guoTiles = useMemo(() => {
    if (!me || !state) return new Set<Tile>();
    return new Set(me.hand.filter(tile => canGuoTileClient(me, tile, state.fishTile)));
  }, [me, state]);

  return <div className="app">
    <div className="shell">
      <aside className="lobby">
        <div className="brand">
          <div className="eyebrow">Tongliao Mahjong</div>
          <h1>通辽麻将</h1>
          <p>创建房间，分享房间号，四台设备分别进入同一局。</p>
        </div>

        <div className="panel form-panel">
          <label>
            昵称
            <input value={name} onChange={event => setName(event.target.value)} placeholder="输入昵称" />
          </label>
          <label>
            房间号
            <input value={room} onChange={event => setRoom(event.target.value)} placeholder="6位房间号" />
          </label>
          <div className="form-actions">
            <button onClick={() => send({ type: 'CREATE_ROOM' })}>创建房间</button>
            <button disabled={!room.trim() || !name.trim()} onClick={() => send({ type: 'JOIN', roomId: room.trim(), name: name.trim() })}>加入房间</button>
          </div>
          <div className="status-text">{msg || ' '}</div>
        </div>

        <div className="panel room-panel">
          <div className="room-row"><span>当前房间</span><strong>{room || '-'}</strong></div>
          <div className="room-row"><span>在线人数</span><strong>{connectedCount}/4</strong></div>
          <div className="room-row"><span>你的座位</span><strong>{seat == null ? '-' : `座位 ${seat + 1}`}</strong></div>
          <button className="start-button" disabled={!state || state.phase !== 'waiting' || !canStart} onClick={() => send({ type: 'START', roomId: room })}>
            {state?.phase === 'waiting' ? '开始游戏' : '游戏进行中'}
          </button>
        </div>

        {state && <div className="panel info-panel">
          <div className="info-grid">
            <div><span>局数</span><strong>第 {state.round} 局</strong></div>
            <div><span>阶段</span><strong>{phaseLabel(state.phase)}</strong></div>
            <div><span>庄家</span><strong>{seatName(state.players[state.dealerSeat], state.dealerSeat)}</strong></div>
            <div><span>当前出牌</span><strong>{seatName(state.players[state.currentSeat], state.currentSeat)}</strong></div>
            <div><span>翻牌</span><strong><MiniTile tile={state.revealedFishTile} /></strong></div>
            <div><span>鱼牌</span><strong><MiniTile tile={state.fishTile} /></strong></div>
            <div><span>基数</span><strong>{state.baseScore}</strong></div>
            <div><span>剩余牌</span><strong>{state.wall.length}</strong></div>
          </div>
        </div>}
      </aside>

      <main className="game-area">
        {state && seat != null ? <>
          <div className="opponents">
            <PlayerEdge player={orderedPlayers[0]} position="top" me={seat} state={state} />
            <div className="side-columns">
              <PlayerEdge player={orderedPlayers[2]} position="left" me={seat} state={state} />
              <div className="table-center panel">
                <div className="center-header">
                  <div>房间 {state.roomId}</div>
                  <div>{connectedCount}/4 人</div>
                </div>
                <div className="center-discard">
                  {state.lastDiscard ? <>
                    <span>最新出牌</span>
                    <MiniTile tile={state.lastDiscard.tile} />
                    <span>{seatName(state.players[state.lastDiscard.seat], state.lastDiscard.seat)}</span>
                  </> : <span>等待本局操作</span>}
                </div>
                <div className="score-ring">
                  {state.players.map(player => <div key={player.seat} className={`score-seat score-seat-${relativeSeat(seat, player.seat)} ${player.seat === state.currentSeat ? 'active' : ''}`}>
                    <span>{opponentLabel(seat, player.seat)}</span>
                    <strong>{player.name}</strong>
                    <em>{state.scores[player.seat]}</em>
                  </div>)}
                </div>
              </div>
              <PlayerEdge player={orderedPlayers[1]} position="right" me={seat} state={state} />
            </div>
          </div>

          {state.phase === 'betting' && me && <div className="panel betting-panel">
            <h2>本局设置</h2>
            <p>庄家设置基数，每位玩家在自己的设备上确认扎针和买鱼。</p>
            {seat === state.dealerSeat && <div className="bet-controls">
              <input type="number" min="1" value={baseInput} onChange={event => setBaseInput(Number(event.target.value) || 1)} />
              <button onClick={() => action({ type: 'SET_BASE', seat, baseScore: baseInput })}>设置基数</button>
            </div>}
            <div className="bet-controls">
              <label><input type="checkbox" checked={zhaInput} onChange={event => setZhaInput(event.target.checked)} /> 扎针</label>
              <label>买鱼 <input type="number" min="0" value={buyFishInput} onChange={event => setBuyFishInput(Math.max(0, Number(event.target.value) || 0))} /></label>
              <button disabled={state.bets[seat]?.ready} onClick={() => action({ type: 'SET_BET', seat, zha: zhaInput, buyFish: buyFishInput })}>确认本局设置</button>
            </div>
            <div className="bet-list">
              {state.players.map(player => <span key={player.seat} className="bet-chip">{player.name}: {state.bets[player.seat]?.ready ? '已确认' : '未确认'}</span>)}
            </div>
          </div>}

          {state.phase === 'settlement' && <SettlementPanel state={state} seat={seat} onAction={action} />}

          <section className="panel self-panel">
            <div className="self-header">
              <div>
                <div className="eyebrow">Your Seat</div>
                <h2>{me?.name}</h2>
              </div>
              <div className="self-score">{state.scores[seat]}</div>
            </div>

            <MeldArea player={me} fish={state.fishTile} />

            <div className="discard-section">
              <div className="section-title">你的弃牌</div>
              <Tiles tiles={me?.discarded ?? []} fish={state.fishTile} />
            </div>

            <SeatActionPanel
              state={state}
              actionsBySeat={actionsBySeat}
              seat={seat}
              actions={myActions}
              chiOptions={myChiOptions}
              guoMode={guoMode}
              onGuoMode={setGuoMode}
              onAction={action}
            />

            <div className="section-title">手牌 {me?.hand.length ?? 0}</div>
            <Tiles
              tiles={me?.hand ?? []}
              fish={state.fishTile}
              drawn={state.drawnTile?.seat === seat ? state.drawnTile.tile : undefined}
              sort
              clickable={myActions.includes('DISCARD') || guoMode}
              canClickTile={guoMode ? (tile => guoTiles.has(tile)) : undefined}
              dimUnclickable={guoMode}
              onClick={tile => guoMode ? action({ type: 'GUO', seat, tile }) : action({ type: 'DISCARD', seat, tile })}
            />
          </section>
        </> : <div className="empty-state panel">
          <h2>先进入房间</h2>
          <p>一个人创建房间，把 6 位房间号发给另外三个人。每个人用自己的设备进入同一房间后，房主点击“开始游戏”。</p>
        </div>}
      </main>
    </div>
  </div>;
}

function phaseLabel(phase: string) {
  const map: Record<string, string> = {
    waiting: '等待玩家',
    betting: '本局设置',
    playing: '进行中',
    responding: '响应中',
    fenzhang: '分张',
    settlement: '结算',
    finished: '结束',
  };
  return map[phase] ?? phase;
}

function MiniTile({ tile }: { tile: Tile }) {
  return <span className="mini-tile"><img src={tileImage(tile)} alt={label(tile)} />{label(tile)}</span>;
}

function PlayerEdge({ player, position, me, state }: { player?: Player; position: 'top' | 'left' | 'right'; me: number; state: GameState }) {
  if (!player) return null;
  const isCurrent = player.seat === state.currentSeat;
  const className = `edge-player edge-${position} ${isCurrent ? 'active' : ''}`;
  const handCount = player.hand.length;
  return <section className={className}>
    <div className="edge-head">
      <div>
        <div className="edge-role">{opponentLabel(me, player.seat)}</div>
        <h3>{player.name}</h3>
      </div>
      <div className={`online-dot ${player.connected ? 'on' : 'off'}`}></div>
    </div>
    <div className="edge-score">积分 {state.scores[player.seat]}</div>
    <div className="section-title">门前牌</div>
    <MeldArea player={player} fish={state.fishTile} compact />
    <div className="section-title">弃牌</div>
    <Tiles tiles={player.discarded} fish={state.fishTile} compact />
    <div className="section-title">手牌 {handCount}</div>
    <Tiles tiles={player.hand} fish={state.fishTile} compact />
  </section>;
}

function SeatActionPanel({ state, actionsBySeat, seat, actions, chiOptions, guoMode, onGuoMode, onAction }: { state: GameState; actionsBySeat: Record<number, string[]>; seat: number; actions: string[]; chiOptions: Tile[][]; guoMode: boolean; onGuoMode: (value: boolean) => void; onAction: (action: any) => void }) {
  const player = state.players[seat];
  const canResolve = (type: string) => canResolveResponseAction(state, actionsBySeat, seat, type);
  const waitingHigher = state.phase === 'responding' && ['HU', 'MING_GANG', 'PENG', 'CHI'].some(action => actions.includes(action) && !canResolve(action));

  return <div className="seat-actions">
    <div className="section-title">可操作项</div>
    <div className="action-list">
      {state.phase === 'responding' && actions.includes('PASS') && <button onClick={() => onAction({ type: 'PASS', seat })}>过响应</button>}
      <button disabled={!actions.includes('HU') || !canResolve('HU')} onClick={() => onAction({ type: 'HU', seat })}>胡</button>
      {actions.includes('CHI') && chiOptions.length > 1
        ? chiOptions.map((option, index) => <button key={index} disabled={!canResolve('CHI')} onClick={() => onAction({ type: 'CHI', seat, tiles: option })}>吃 {option.map(label).join(' ')}</button>)
        : <button disabled={!actions.includes('CHI') || !canResolve('CHI')} onClick={() => onAction({ type: 'CHI', seat, tiles: chiOptions[0] })}>吃</button>}
      <button disabled={!actions.includes('PENG') || !canResolve('PENG')} onClick={() => onAction({ type: 'PENG', seat })}>碰</button>
      <button disabled={!actions.includes('MING_GANG') || !canResolve('MING_GANG')} onClick={() => onAction({ type: 'MING_GANG', seat })}>明杠</button>
      <button disabled={!actions.includes('BU_GANG')} onClick={() => onAction({ type: 'BU_GANG', seat })}>补杠</button>
      <button disabled={!actions.includes('AN_GANG')} onClick={() => onAction({ type: 'AN_GANG', seat })}>暗杠</button>
      {!guoMode && <button disabled={!actions.includes('GUO')} onClick={() => onGuoMode(true)}>过牌</button>}
      {guoMode && <button onClick={() => onGuoMode(false)}>结束过牌</button>}
      <button disabled={!actions.includes('END_XI')} onClick={() => onAction({ type: 'END_XI', seat })}>结束喜牌</button>
      <XiButtons hand={player.hand} fish={state.fishTile} enabled={actions.includes('DECLARE_XI')} onXi={name => onAction({ type: 'DECLARE_XI', seat, name })} />
      <button disabled={!actions.includes('DRAW')} onClick={() => onAction({ type: 'DRAW', seat })}>摸牌</button>
      <button disabled={!actions.includes('FENZHANG')} onClick={() => onAction({ type: 'FENZHANG', seat })}>分张</button>
    </div>
    {waitingHigher && <div className="hint">当前有更高优先级响应，需等待前位玩家先过。</div>}
    {actions.includes('DISCARD') && <div className="hint">点击下方手牌即可出牌。</div>}
  </div>;
}

function SettlementPanel({ state, seat, onAction }: { state: GameState; seat: number; onAction: (action: any) => void }) {
  const settlement = state.settlement;
  return <div className="panel settlement">
    <h2>本局结算</h2>
    {settlement ? <>
      <div className="settlement-summary">
        <span>赢家：{state.players[settlement.winnerSeat]?.name}</span>
        <span>{settlement.selfDraw ? '自摸' : `点炮：${state.players[settlement.discarderSeat ?? 0]?.name}`}</span>
        <span>基数：{settlement.baseScore}</span>
        <span>总鱼：{settlement.fishTotal}</span>
      </div>
      <table>
        <thead>
          <tr><th>玩家</th><th>原积分</th><th>本局</th><th>现积分</th></tr>
        </thead>
        <tbody>
          {settlement.deltas.map(delta => <tr key={delta.seat}>
            <td>{state.players[delta.seat]?.name}</td>
            <td>{delta.before}</td>
            <td className={delta.delta >= 0 ? 'plus' : 'minus'}>{delta.delta > 0 ? '+' : ''}{delta.delta}</td>
            <td>{delta.after}</td>
          </tr>)}
        </tbody>
      </table>
    </> : <div>等待结算数据</div>}
    <button disabled={state.readyNext[seat]} onClick={() => onAction({ type: 'NEXT_ROUND', seat })}>{state.readyNext[seat] ? '已准备下一局' : '下一局'}</button>
  </div>;
}

function Tiles({ tiles, fish, sort, drawn, clickable, onClick, canClickTile, dimUnclickable, compact }: { tiles: Tile[]; fish: Tile; sort?: boolean; drawn?: Tile; clickable?: boolean; onClick?: (tile: Tile) => void; canClickTile?: (tile: Tile) => boolean; dimUnclickable?: boolean; compact?: boolean }) {
  const shown = sort ? tilesForView(tiles, fish, drawn) : tiles.map(tile => ({ tile, drawn: false }));
  return <div className={`tiles ${compact ? 'compact' : ''}`}>{shown.map(({ tile, drawn: isDrawn }, index) => {
    const canClick = !!clickable && tile !== 'BACK' && (!canClickTile || canClickTile(tile));
    const dimmed = !!dimUnclickable && !canClick;
    return <button className={`tile ${isDrawn ? 'drawn' : ''} ${tile === fish ? 'fish' : ''} ${dimmed ? 'dimmed' : ''}`} title={label(tile)} disabled={!canClick} key={`${tile}-${index}`} onClick={() => onClick?.(tile)}>
      {tile === fish && <span className="fish-star">*</span>}
      <img src={tileImage(tile)} alt={label(tile)} />
    </button>;
  })}</div>;
}

function MeldArea({ player, fish, compact }: { player?: Player; fish: Tile; compact?: boolean }) {
  const xi = player?.melds.filter(meld => meld.type === 'xi') ?? [];
  const other = player?.melds.filter(meld => meld.type !== 'xi') ?? [];
  return <div className={`front-area ${compact ? 'compact' : ''}`}>
    <div className="front-pile">
      <div className="section-title">喜牌</div>
      {xi.length ? xi.map((meld, index) => <MeldTiles key={index} meld={meld} fish={fish} compact={compact} />) : <span className="empty">暂无</span>}
    </div>
    <div className="front-pile">
      <div className="section-title">吃碰杠</div>
      {other.length ? other.map((meld, index) => <MeldTiles key={index} meld={meld} fish={fish} compact={compact} />) : <span className="empty">暂无</span>}
    </div>
  </div>;
}

function MeldTiles({ meld, fish, compact }: { meld: Meld; fish: Tile; compact?: boolean }) {
  return <div className="meld-set"><span className="meld-name">{meld.name ?? meld.type}</span><Tiles tiles={meld.tiles} fish={fish} compact={compact} /></div>;
}

const xiDefs: Array<[string, Tile[]]> = [
  ['中发白', ['Zhong', 'Fa', 'Bai']],
  ['中发鱼', ['Zhong', 'Fa', 'Fish' as Tile]],
  ['中发九', ['Zhong', 'Fa', 'T9']],
  ['鱼中白', ['Fish' as Tile, 'Zhong', 'Bai']],
  ['鱼发白', ['Fish' as Tile, 'Fa', 'Bai']],
  ['鱼中九', ['Fish' as Tile, 'Zhong', 'T9']],
  ['鱼发九', ['Fish' as Tile, 'Fa', 'T9']],
  ['鱼钩白', ['Fish' as Tile, 'T9', 'Bai']],
  ['中八五', ['Zhong', 'W8', 'T5']],
  ['鱼八五', ['Fish' as Tile, 'W8', 'T5']],
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

function XiButtons({ hand, fish, enabled, onXi }: { hand: Tile[]; fish: Tile; enabled: boolean; onXi: (name: string) => void }) {
  const names = findXiNamesForButtons(hand, fish);
  return <>{names.map(name => <button key={name} disabled={!enabled} onClick={() => onXi(name)}>亮喜 {name}</button>)}</>;
}

createRoot(document.getElementById('root')!).render(<App />);
