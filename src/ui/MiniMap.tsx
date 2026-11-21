import type { HexMap } from '../state/types';
import { colParity, parse } from '../engine/map';

const S = 10, H = Math.sqrt(3) * S;

/** A small, non-interactive preview of a whole map (GM view: terrain, rivers, special sites, capital). */
export function MiniMap({ map, capital }: { map: HexMap; capital?: string }) {
  const w = S * 1.5 * map.cols + S * 0.5, h = H * (map.rows + 0.5);
  const center = (c: number, r: number): [number, number] => [S + c * 1.5 * S, H / 2 + H * (r + 0.5 * colParity(map, c))];
  const pts = (cx: number, cy: number) =>
    Array.from({ length: 6 }, (_, i) => `${cx + S * Math.cos((Math.PI / 3) * i)},${cy + S * Math.sin((Math.PI / 3) * i)}`).join(' ');
  return (
    <svg className="minimap hexmap" viewBox={`-2 -2 ${w + 4} ${h + 4}`} role="img" aria-label="Map preview">
      {Object.entries(map.hexes).map(([hk, hex]) => {
        const [cx, cy] = center(...parse(hk));
        return (
          <g key={hk}>
            <polygon points={pts(cx, cy)} className={`hx t-${hex.terrain}`} style={{ strokeWidth: 0.6 }} />
            {hex.river && <circle cx={cx} cy={cy} r={2.6} fill="var(--river)" />}
            {hex.special && <rect x={cx - 2.5} y={cy - 2.5} width={5} height={5} transform={`rotate(45 ${cx} ${cy})`} className="special" style={{ strokeWidth: 0.5 }} />}
          </g>
        );
      })}
      {capital && (() => {
        const [cx, cy] = center(...parse(capital));
        return <polygon points={pts(cx, cy)} fill="none" stroke="var(--border)" strokeWidth={2.5} />;
      })()}
    </svg>
  );
}
