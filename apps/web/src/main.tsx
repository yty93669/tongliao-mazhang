import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

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

const labels: Record<string, string> = { Zhong: 'Red', Fa: 'Green', Bai: 'White', BACK: 'Back' };
const tileOrder = new Map<string, number>([
  ...['W', 'T', 'B'].flatMap((suit, suitIndex) =>
    Array.from({ length: 9 }, (_, i) => [`${suit}${i + 1}`, suitIndex * 9 + i] as [string, number]),
  ),
  ['Zhong', 27],
  ['Fa', 28],
  ['Bai', 29],
  ['BACK', 99],
]);

function label(tile: Tile) {
  if (labels[tile]) return labels[tile];
  const suitMap: Record<string, string> = { W: 'Wan', T: 'Tiao', B: 'Tong' };
  return `${tile[1]} ${suitMap[tile[0]]}`;
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

function legalChiOptionsClient(
  hand: Tile[],
  discard?: Tile,
  seat?: number,
  discarderSeat?: number,
  source?: 'normal' | 'xi',
  fish?: Tile,
) {
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

function seatName(player: Player | undefined, fallbackSeat: number) {
  return player?.name || `Player ${fallbackSeat + 1}`;
}

function relativeSeat(me: number, target: number) {
  return (target - me + 4) % 4;
}

function seatDirection(me: number, target: number) {
  const rel = relativeSeat(me, target);
  if (rel === 0) return 'You';
  if (rel === 1) return 'Right';
  if (rel === 2) return 'Top';
  return 'Left';
}

function phaseLabel(phase: string) {
  const map: Record<string, string> = {
    waiting: 'Waiting',
    betting: 'Round Setup',
    playing: 'Playing',
    responding: 'Response',
    fenzhang: 'Bonus Draw',
    settlement: 'Settlement',
    finished: 'Finished',
  };
  return map[phase] ?? phase;
}

function compactActions(actions: string[]) {
  const map: Record<string, string> = {
    DISCARD: 'Discard',
    DRAW: 'Draw',
    HU: 'Hu',
    CHI: 'Chi',
    PENG: 'Peng',
    MING_GANG: 'Gang',
    BU_GANG: 'Bu Gang',
    AN_GANG: 'An Gang',
    GUO: 'Guo',
    PASS: 'Pass',
    END_XI: 'End Xi',
    DECLARE_XI: 'Xi',
    FENZHANG: 'Finish',
    NEXT_ROUND: 'Next',
    SET_BASE: 'Base',
    SET_BET: 'Bet',
  };
  return actions.map(action => map[action] ?? action);
}

function App() {
  const [name, setName] = useState(`Player${Math.floor(Math.random() * 100)}`);
  const [room, setRoom] = useState('');
  const [seat, setSeat] = useState<number>();
  const [state, setState] = useState<GameState>();
  const [actionsBySeat, setActionsBySeat] = useState<Record<number, string[]>>({});
  const [connectedCount, setConnectedCount] = useState(0);
  const [canStart, setCanStart] = useState(false);
  const [msg, setMsg] = useState('Connecting...');
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
        setMsg(`Room created: ${message.roomId}`);
      }
      if (message.type === 'JOINED') {
        setSeat(message.seat);
        setRoom(message.roomId);
        setMsg(`Joined room ${message.roomId} as seat ${message.seat + 1}`);
      }
      if (message.type === 'STATE') {
        setState(message.state);
        setSeat(message.seat);
        setActionsBySeat(message.actionsBySeat ?? { [message.seat]: message.actions ?? [] });
        setConnectedCount(message.connectedCount ?? 0);
        setCanStart(!!message.canStart);
        if (message.state?.phase === 'waiting') {
          setMsg((message.connectedCount ?? 0) === 4 ? 'All 4 players are ready.' : `Waiting for players ${message.connectedCount ?? 0}/4`);
        } else {
          setMsg('');
        }
      }
      if (message.type === 'ERROR') setMsg(message.error);
    };
    socket.onopen = () => setMsg('Connected');
    socket.onclose = () => setMsg('Connection closed. Refresh to reconnect.');
    return () => socket.close();
  }, []);

  const send = (payload: unknown) => ws.current?.send(JSON.stringify(payload));
  const me = useMemo(() => (seat == null ? undefined : state?.players[seat]), [state, seat]);
  const myActions = seat == null ? [] : (actionsBySeat[seat] ?? []);

  useEffect(() => {
    if (guoMode && !myActions.includes('GUO')) setGuoMode(false);
  }, [guoMode, myActions]);

  const action = (payload: unknown) => send({ type: 'ACTION', action: payload });

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

  return (
    <div className="app">
      <div className="table-shell">
        <header className="table-topbar">
          <div className="brand-block">
            <div className="brand-kicker">Tongliao Mahjong</div>
            <div className="brand-title">Room Table</div>
          </div>
          <div className="table-meta">
            <InfoPill label="Room" value={room || '--'} />
            <InfoPill label="Players" value={`${connectedCount}/4`} />
            <InfoPill label="Phase" value={state ? phaseLabel(state.phase) : 'Lobby'} />
            <InfoPill label="Wall" value={state ? `${state.wall.length}` : '--'} />
          </div>
        </header>

        <main className="table-stage">
          {state && seat != null ? (
            <>
              <div className="table-felt">
                <div className="table-ring"></div>
                <PlayerSeat player={tablePlayers[2]} me={seat} state={state} position="top" />
                <PlayerSeat player={tablePlayers[3]} me={seat} state={state} position="left" />
                <PlayerSeat player={tablePlayers[1]} me={seat} state={state} position="right" />

                <div className="table-center">
                  <div className="center-status">
                    <div>
                      <span className="status-label">Dealer</span>
                      <strong>{seatName(state.players[state.dealerSeat], state.dealerSeat)}</strong>
                    </div>
                    <div>
                      <span className="status-label">Turn</span>
                      <strong>{seatName(state.players[state.currentSeat], state.currentSeat)}</strong>
                    </div>
                  </div>

                  <div className="center-fish">
                    <TileBadge title="Reveal" tile={state.revealedFishTile} />
                    <TileBadge title="Fish" tile={state.fishTile} highlight />
                  </div>

                  <div className="center-last">
                    {state.lastDiscard ? (
                      <>
                        <span className="status-label">Last Discard</span>
                        <div className="last-card">
                          <TileFace tile={state.lastDiscard.tile} />
                          <div>
                            <strong>{seatName(state.players[state.lastDiscard.seat], state.lastDiscard.seat)}</strong>
                            <div>{state.lastDiscard.source === 'xi' ? 'from Xi' : 'normal discard'}</div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="placeholder-copy">No discard on table yet.</div>
                    )}
                  </div>

                  <div className="center-actions-preview">
                    <span className="status-label">Available</span>
                    <div>{myActions.length ? compactActions(myActions).join(' / ') : 'Waiting'}</div>
                  </div>
                </div>

                <section className="self-zone">
                  <div className="self-rack">
                    <div className="self-summary">
                      <div>
                        <div className="brand-kicker">Seat {seat + 1}</div>
                        <h2>{me?.name}</h2>
                      </div>
                      <div className="self-score">
                        <span>Score</span>
                        <strong>{state.scores[seat]}</strong>
                      </div>
                    </div>

                    <div className="rack-fronts">
                      <MeldStrip title="Xi" melds={me?.melds.filter(meld => meld.type === 'xi') ?? []} fish={state.fishTile} />
                      <MeldStrip title="Open Sets" melds={me?.melds.filter(meld => meld.type !== 'xi') ?? []} fish={state.fishTile} />
                    </div>

                    <div className="rack-discards">
                      <div className="section-label">Your Discards</div>
                      <Tiles tiles={me?.discarded ?? []} fish={state.fishTile} compact />
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

                    <div className="hand-panel">
                      <div className="section-label">Hand {me?.hand.length ?? 0}</div>
                      <Tiles
                        tiles={me?.hand ?? []}
                        fish={state.fishTile}
                        drawn={state.drawnTile?.seat === seat ? state.drawnTile.tile : undefined}
                        sort
                        clickable={myActions.includes('DISCARD') || guoMode}
                        canClickTile={guoMode ? tile => guoTiles.has(tile) : undefined}
                        dimUnclickable={guoMode}
                        onClick={tile => (guoMode ? action({ type: 'GUO', seat, tile }) : action({ type: 'DISCARD', seat, tile }))}
                      />
                    </div>
                  </div>
                </section>
              </div>

              <aside className="side-panels">
                <StatusPanel state={state} seat={seat} msg={msg} />
                {state.phase === 'betting' && (
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
                )}
                {state.phase === 'settlement' && <SettlementPanel state={state} seat={seat} onAction={action} />}
              </aside>
            </>
          ) : (
            <div className="lobby-overlay">
              <div className="lobby-card">
                <div className="brand-kicker">Main Site Entrance</div>
                <h1>Join a Mahjong Room</h1>
                <p>Create a room, share the 6-digit code, and let four screens enter the same match.</p>

                <label className="field">
                  <span>Name</span>
                  <input value={name} onChange={event => setName(event.target.value)} placeholder="Your display name" />
                </label>

                <label className="field">
                  <span>Room Code</span>
                  <input value={room} onChange={event => setRoom(event.target.value)} placeholder="6-digit room code" />
                </label>

                <div className="lobby-actions">
                  <button onClick={() => send({ type: 'CREATE_ROOM' })}>Create Room</button>
                  <button disabled={!room.trim() || !name.trim()} onClick={() => send({ type: 'JOIN', roomId: room.trim(), name: name.trim() })}>
                    Join Room
                  </button>
                </div>

                <div className="lobby-message">{msg}</div>
              </div>
            </div>
          )}
        </main>

        {state?.phase === 'waiting' && (
          <div className="floating-start">
            <div>
              <div className="brand-kicker">Waiting Room</div>
              <strong>{connectedCount}/4 players connected</strong>
            </div>
            <button disabled={state.phase !== 'waiting' || !canStart} onClick={() => send({ type: 'START', roomId: room })}>
              Start Match
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TileBadge({ title, tile, highlight }: { title: string; tile: Tile; highlight?: boolean }) {
  return (
    <div className={`tile-badge ${highlight ? 'highlight' : ''}`}>
      <span>{title}</span>
      <TileFace tile={tile} />
    </div>
  );
}

function TileFace({ tile }: { tile: Tile }) {
  return <img className="tile-face" src={tileImage(tile)} alt={label(tile)} title={label(tile)} />;
}

function PlayerSeat({ player, me, state, position }: { player?: Player; me: number; state: GameState; position: 'top' | 'left' | 'right' }) {
  if (!player) return null;
  const current = player.seat === state.currentSeat;
  return (
    <section className={`player-seat seat-${position} ${current ? 'active' : ''}`}>
      <div className="player-head">
        <div>
          <div className="brand-kicker">{seatDirection(me, player.seat)}</div>
          <h3>{player.name}</h3>
        </div>
        <span className={`seat-light ${player.connected ? 'online' : 'offline'}`}></span>
      </div>

      <div className="player-mini-meta">
        <span>Score {state.scores[player.seat]}</span>
        <span>Hand {player.hand.length}</span>
      </div>

      <MeldStrip title="Sets" melds={player.melds} fish={state.fishTile} compact />

      <div className="seat-discards">
        <div className="section-label">Discards</div>
        <Tiles tiles={player.discarded} fish={state.fishTile} compact stack={position !== 'top'} />
      </div>

      <div className={`hidden-hand hidden-${position}`}>
        {player.hand.map((tile, index) => (
          <div key={`${tile}-${index}`} className="hidden-tile">
            <TileFace tile={tile} />
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPanel({ state, seat, msg }: { state: GameState; seat: number; msg: string }) {
  return (
    <section className="panel-card">
      <div className="panel-title-row">
        <h3>Table Status</h3>
        <span>{phaseLabel(state.phase)}</span>
      </div>
      <div className="status-grid">
        <div><span>Round</span><strong>{state.round}</strong></div>
        <div><span>Seat</span><strong>{seat + 1}</strong></div>
        <div><span>Base</span><strong>{state.baseScore}</strong></div>
        <div><span>Current</span><strong>{seatName(state.players[state.currentSeat], state.currentSeat)}</strong></div>
      </div>
      <div className="panel-note">{msg || 'Match in progress.'}</div>
    </section>
  );
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
    <section className="panel-card">
      <div className="panel-title-row">
        <h3>Round Setup</h3>
        <span>Before play</span>
      </div>

      {seat === state.dealerSeat && (
        <div className="inline-controls">
          <input type="number" min="1" value={baseInput} onChange={event => onBaseInput(Number(event.target.value) || 1)} />
          <button onClick={() => onAction({ type: 'SET_BASE', seat, baseScore: baseInput })}>Set Base</button>
        </div>
      )}

      <div className="bet-options">
        <label><input type="checkbox" checked={zhaInput} onChange={event => onZhaInput(event.target.checked)} /> Zha</label>
        <label>Buy Fish <input type="number" min="0" value={buyFishInput} onChange={event => onBuyFishInput(Math.max(0, Number(event.target.value) || 0))} /></label>
      </div>

      <button disabled={state.bets[seat]?.ready} onClick={() => onAction({ type: 'SET_BET', seat, zha: zhaInput, buyFish: buyFishInput })}>
        {state.bets[seat]?.ready ? 'Confirmed' : 'Confirm Bet'}
      </button>

      <div className="bet-list">
        {state.players.map(player => (
          <div key={player.seat} className="bet-row">
            <span>{player.name}</span>
            <strong>{state.bets[player.seat]?.ready ? 'Ready' : 'Pending'}</strong>
          </div>
        ))}
      </div>
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
}: {
  state: GameState;
  actionsBySeat: Record<number, string[]>;
  seat: number;
  actions: string[];
  chiOptions: Tile[][];
  guoMode: boolean;
  onGuoMode: (value: boolean) => void;
  onAction: (action: unknown) => void;
}) {
  const player = state.players[seat];
  const canResolve = (type: string) => canResolveResponseAction(state, actionsBySeat, seat, type);
  const waitingHigher = state.phase === 'responding' && ['HU', 'MING_GANG', 'PENG', 'CHI'].some(action => actions.includes(action) && !canResolve(action));

  return (
    <div className="action-panel">
      <div className="panel-title-row">
        <h3>Actions</h3>
        <span>{compactActions(actions).join(' / ') || 'None'}</span>
      </div>
      <div className="action-list">
        {state.phase === 'responding' && actions.includes('PASS') && <button onClick={() => onAction({ type: 'PASS', seat })}>Pass</button>}
        <button disabled={!actions.includes('HU') || !canResolve('HU')} onClick={() => onAction({ type: 'HU', seat })}>Hu</button>
        {actions.includes('CHI') && chiOptions.length > 1
          ? chiOptions.map((option, index) => (
              <button key={index} disabled={!canResolve('CHI')} onClick={() => onAction({ type: 'CHI', seat, tiles: option })}>
                Chi {option.map(label).join(' ')}
              </button>
            ))
          : <button disabled={!actions.includes('CHI') || !canResolve('CHI')} onClick={() => onAction({ type: 'CHI', seat, tiles: chiOptions[0] })}>Chi</button>}
        <button disabled={!actions.includes('PENG') || !canResolve('PENG')} onClick={() => onAction({ type: 'PENG', seat })}>Peng</button>
        <button disabled={!actions.includes('MING_GANG') || !canResolve('MING_GANG')} onClick={() => onAction({ type: 'MING_GANG', seat })}>Gang</button>
        <button disabled={!actions.includes('BU_GANG')} onClick={() => onAction({ type: 'BU_GANG', seat })}>Bu Gang</button>
        <button disabled={!actions.includes('AN_GANG')} onClick={() => onAction({ type: 'AN_GANG', seat })}>An Gang</button>
        {!guoMode && <button disabled={!actions.includes('GUO')} onClick={() => onGuoMode(true)}>Guo Mode</button>}
        {guoMode && <button onClick={() => onGuoMode(false)}>End Guo</button>}
        <button disabled={!actions.includes('END_XI')} onClick={() => onAction({ type: 'END_XI', seat })}>End Xi</button>
        <XiButtons hand={player.hand} fish={state.fishTile} enabled={actions.includes('DECLARE_XI')} onXi={name => onAction({ type: 'DECLARE_XI', seat, name })} />
        <button disabled={!actions.includes('DRAW')} onClick={() => onAction({ type: 'DRAW', seat })}>Draw</button>
        <button disabled={!actions.includes('FENZHANG')} onClick={() => onAction({ type: 'FENZHANG', seat })}>Finish Draw</button>
      </div>
      {waitingHigher && <div className="panel-note">A higher-priority response must resolve first.</div>}
      {actions.includes('DISCARD') && <div className="panel-note">Tap a tile below to discard it.</div>}
      {guoMode && <div className="panel-note">Tap one of the highlighted tiles to use Guo.</div>}
    </div>
  );
}

function SettlementPanel({ state, seat, onAction }: { state: GameState; seat: number; onAction: (action: unknown) => void }) {
  const settlement = state.settlement;
  return (
    <section className="panel-card">
      <div className="panel-title-row">
        <h3>Settlement</h3>
        <span>{settlement?.selfDraw ? 'Self Draw' : 'Win by Discard'}</span>
      </div>
      {settlement ? (
        <>
          <div className="winner-banner">
            <strong>{state.players[settlement.winnerSeat]?.name}</strong>
            <span>Base {settlement.baseScore}</span>
            <span>Fish {settlement.fishTotal}</span>
          </div>
          <table className="score-table">
            <thead>
              <tr><th>Player</th><th>Before</th><th>Delta</th><th>After</th></tr>
            </thead>
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
        </>
      ) : (
        <div className="panel-note">Waiting for settlement data.</div>
      )}
      <button disabled={state.readyNext[seat]} onClick={() => onAction({ type: 'NEXT_ROUND', seat })}>
        {state.readyNext[seat] ? 'Ready for Next Round' : 'Next Round'}
      </button>
    </section>
  );
}

function Tiles({
  tiles,
  fish,
  sort,
  drawn,
  clickable,
  onClick,
  canClickTile,
  dimUnclickable,
  compact,
  stack,
}: {
  tiles: Tile[];
  fish: Tile;
  sort?: boolean;
  drawn?: Tile;
  clickable?: boolean;
  onClick?: (tile: Tile) => void;
  canClickTile?: (tile: Tile) => boolean;
  dimUnclickable?: boolean;
  compact?: boolean;
  stack?: boolean;
}) {
  const shown = sort ? tilesForView(tiles, fish, drawn) : tiles.map(tile => ({ tile, drawn: false }));
  return (
    <div className={`tiles ${compact ? 'compact' : ''} ${stack ? 'stack' : ''}`}>
      {shown.map(({ tile, drawn: isDrawn }, index) => {
        const canClick = !!clickable && tile !== 'BACK' && (!canClickTile || canClickTile(tile));
        const dimmed = !!dimUnclickable && !canClick;
        return (
          <button
            className={`tile ${isDrawn ? 'drawn' : ''} ${tile === fish ? 'fish' : ''} ${dimmed ? 'dimmed' : ''}`}
            title={label(tile)}
            disabled={!canClick}
            key={`${tile}-${index}`}
            onClick={() => onClick?.(tile)}
          >
            {tile === fish && <span className="fish-star">*</span>}
            <img src={tileImage(tile)} alt={label(tile)} />
          </button>
        );
      })}
    </div>
  );
}

function MeldStrip({ title, melds, fish, compact }: { title: string; melds: Meld[]; fish: Tile; compact?: boolean }) {
  return (
    <div className={`meld-strip ${compact ? 'compact' : ''}`}>
      <div className="section-label">{title}</div>
      <div className="meld-strip-body">
        {melds.length ? melds.map((meld, index) => <MeldTiles key={index} meld={meld} fish={fish} compact={compact} />) : <span className="empty-copy">None</span>}
      </div>
    </div>
  );
}

function MeldTiles({ meld, fish, compact }: { meld: Meld; fish: Tile; compact?: boolean }) {
  return (
    <div className="meld-set">
      <span className="meld-name">{meld.name ?? meld.type}</span>
      <Tiles tiles={meld.tiles} fish={fish} compact={compact} />
    </div>
  );
}

const xiDefs: Array<[string, Tile[]]> = [
  ['ZFB', ['Zhong', 'Fa', 'Bai']],
  ['ZF-Fish', ['Zhong', 'Fa', 'Fish' as Tile]],
  ['ZF9', ['Zhong', 'Fa', 'T9']],
  ['Fish-ZB', ['Fish' as Tile, 'Zhong', 'Bai']],
  ['Fish-FB', ['Fish' as Tile, 'Fa', 'Bai']],
  ['Fish-Z9', ['Fish' as Tile, 'Zhong', 'T9']],
  ['Fish-F9', ['Fish' as Tile, 'Fa', 'T9']],
  ['Fish-9B', ['Fish' as Tile, 'T9', 'Bai']],
  ['Z85', ['Zhong', 'W8', 'T5']],
  ['Fish-85', ['Fish' as Tile, 'W8', 'T5']],
  ['Tiger', ['Fish' as Tile, 'W1', 'B9']],
  ['181', ['W1', 'W8', 'Bai']],
  ['127', ['W1', 'T2', 'B7']],
  ['98B', ['W9', 'T8', 'Bai']],
  ['19F', ['W1', 'T9', 'Fa']],
  ['11F', ['Fish' as Tile, 'W1', 'B1']],
  ['555', ['T5', 'W5', 'B5']],
  ['999', ['T9', 'W9', 'B9']],
  ['Z99', ['Zhong', 'W9', 'T9']],
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
  return (
    <>
      {names.map(name => (
        <button key={name} disabled={!enabled} onClick={() => onXi(name)}>
          Xi {name}
        </button>
      ))}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
