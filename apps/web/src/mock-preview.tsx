import React from 'react';

type Tile = string;

function tileImage(tile: Tile) {
  if (tile === 'BACK') return '/mahjong/back.png';
  const map: Record<string, string> = { W: 'm', T: 's', B: 'p', Zhong: '7z', Fa: '6z', Bai: '5z' };
  if (tile === 'Zhong' || tile === 'Fa' || tile === 'Bai') return `/mahjong/${map[tile]}.svg`;
  return `/mahjong/${tile[1]}${map[tile[0]]}.svg`;
}

const selfHand: Tile[] = ['W7', 'W7', 'T2', 'T2', 'T5', 'T8', 'B4', 'B5', 'B7', 'B8', 'B9', 'B9', 'Xi', 'BACK', 'BACK', 'BACK'];

function PreviewTile({ tile }: { tile: Tile }) {
  const src = tile === 'Xi' ? '/mahjong/6z.svg' : tileImage(tile);
  return (
    <div className={`preview-tile ${tile === 'BACK' ? 'is-back' : ''}`}>
      <img src={src} alt={tile} />
    </div>
  );
}

function Wall({ count, vertical }: { count: number; vertical?: boolean }) {
  return (
    <div className={`mock-wall ${vertical ? 'vertical' : ''}`}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="wall-tile" />
      ))}
    </div>
  );
}

function Avatar({ name, dir, score, className }: { name: string; dir: string; score: string; className?: string }) {
  return (
    <div className={`mock-avatar ${className ?? ''}`}>
      <div className="avatar-face">{dir}</div>
      <div className="avatar-name">{name}</div>
      <div className="avatar-score">{score}</div>
    </div>
  );
}

function ActionButton({ label, tiles, emphasis }: { label: string; tiles?: number; emphasis?: boolean }) {
  return (
    <button className={`mock-action-button ${emphasis ? 'emphasis' : ''}`}>
      <span>{label}</span>
      {tiles ? (
        <div className="mock-action-tiles">
          {Array.from({ length: tiles }, (_, index) => (
            <div key={index} className="mock-action-tile" />
          ))}
        </div>
      ) : null}
    </button>
  );
}

export function MockPreview() {
  return (
    <div className="mock-page">
      <div className="mock-board">
        <div className="mock-top-left">84</div>
        <Avatar name="玩家北" dir="北" score="x0" className="left-avatar" />
        <Avatar name="玩家西" dir="西" score="x1" className="top-avatar" />
        <Avatar name="玩家我" dir="庄" score="12000" className="self-avatar" />

        <div className="mock-center-logo">∞</div>

        <div className="mock-side-toolbar">
          <div className="toolbar-chip">出</div>
          <div className="toolbar-chip">设</div>
          <div className="toolbar-chip">聊</div>
        </div>

        <div className="mock-discard top-discard">
          <PreviewTile tile="W1" />
        </div>

        <div className="mock-pin" />

        <Wall count={16} />
        <Wall count={11} vertical />
        <Wall count={11} vertical />

        <div className="mock-action-row">
          <ActionButton label="杠" tiles={3} emphasis />
          <ActionButton label="碰" tiles={3} emphasis />
          <ActionButton label="过" />
        </div>

        <div className="mock-hand-row">
          {selfHand.map((tile, index) => (
            <PreviewTile key={`${tile}-${index}`} tile={tile} />
          ))}
        </div>

        <div className="mock-bottom-info">
          <span>12000</span>
          <span>庄 x1</span>
          <span>听牌：不足挂齿</span>
        </div>
      </div>
    </div>
  );
}
