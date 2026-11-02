import {AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {C, FONT} from '../theme';
import {Sheet} from '../ui/Sheet';
import {Scene1Tree} from './Scene1Tree';
import type {Scene1Data} from './Scene1Tree';
import {Tower3D} from './Tower3D';
import {V7} from './story-v7-cues.js';
import {FIELD, GlassCard, GlassRow, LiveSlot, TypeCard, clamp01, ease, easeOut, fmt1, lerp, money, over} from './v7-ui';
import type {LiveClips} from './v7-ui';

/**
 * Film v7, Part 1 (0:00–1:30, 1920 × 1080 at 60 fps; demo/SCRIPT-V7.md): the problem, as a film. One 3D building
 * that falls apart into paper (Tower3D), the four problems a reviewer meets — sheets that disagree (the typical plate
 * × 4 and the tower bill's row), a tree that is not a tree (hook 1 v3), a bill that drifts (the paper desk), the
 * building code (the gauge and the pit) — what a developer told us (the real L-1, T-10 clouded), the promise, the two
 * Meta models, and the hand-off to the recorded product. Every number is read from the runs by story-v7-prepare.mjs
 * into public/data/story-v7.json; the type and glass cards follow the Rules; the live slots take Eric's clips.
 */
export type StoryV7Data = {
  greenfield: {
    run_id: string;
    package: string;
    file_count: number;
    camphor: {row: number; bill_text: string; bill_unit: string; bill_qty: number; unit_price: number; unit_price_usd: number; drawn_qty: number; over_usd: number};
    hedge: {row: number; bill_text: string; bill_unit: string; bill_qty: number; drawn_qty: number; rows: number; row_length_m: number; spacing_m: number; count: number; label: string; label_at: number[]; segments: number[][][]};
    pavers: {row: number; bill_text: string; bill_qty: number; drawn_qty: number; bill_price_usd: number; list_high_usd: number; over_usd: number};
    queried_usd: number;
    greening: {required: number; provided: number; before_pit_rule: number; plus2: {label: string; value: number} | null; fixes: {id: string; label: string; value: number; passes: boolean}[]};
    pit: {w: number; l: number; soil: number; on_slab: string; downgraded: number};
    offsite: {title: string; why: string; centre: number[]; outline: number[][]};
    boundary: number[][];
    row: {id: string; centre: number[]; r: number}[];
    svg: {offset_x: number; flip_y: number};
  };
  tower: {
    run_id: string;
    package: string;
    typical: {sheet: string; title: string; floors: string[]; per_floor: number; total: number};
    bill: {row: number; bill_text: string; bill_unit: string; bill_qty: number; drawn_qty: number; unit_price: number; unit_price_usd: number; amount_usd: number; bill_cell: string};
  };
  sheets: {id: string; title: string; package: string; png: string}[];
  lc1: string;
  audio: {voice: Record<string, number | null>; mix: string | null};
};
export type StoryV7Props = {story?: StoryV7Data; scene1?: Scene1Data; live?: LiveClips; audio?: 'mix' | 'lines' | 'none'};

const PAPER = '#f4f1ea';
const INK = '#1d2026';

// ---------------------------------------------------------------- the tower beats' overlays (0:15–0:22)
const BillRow: React.FC<{t: number; d: StoryV7Data['tower']}> = ({t, d}) => {
  const a = over(t, V7.tower.bill.rowIn, V7.tower.bill.rowIn + 0.5, easeOut);
  const out = 1 - over(t, V7.tower.fade.out - 0.3, V7.tower.fade.out);
  const circle = over(t, V7.tower.bill.circle, V7.tower.bill.circle + 0.6);
  if (a <= 0) return null;
  const b = d.bill;
  return (
    <div style={{position: 'absolute', left: 1010 + (1 - a) * 80, top: 150, width: 860, opacity: a * out, fontFamily: FONT.mono, color: INK}}>
      <div style={{background: PAPER, boxShadow: '0 20px 60px rgba(0,0,0,0.45)', padding: '18px 26px', borderLeft: `6px solid ${C.amber}`}}>
        <div style={{fontSize: 18, color: C.mute, letterSpacing: 1, textTransform: 'uppercase'}}>BOQ · Tower Landscape · row {b.row} · {b.bill_cell}</div>
        <div style={{display: 'flex', alignItems: 'baseline', gap: 26, marginTop: 10, fontSize: 30, whiteSpace: 'nowrap'}}>
          <span style={{color: C.mute}}>{b.row}</span>
          <span style={{position: 'relative', fontWeight: 600}}>
            {b.bill_text.replace(/ x 1$/, ' ')}
            <span style={{position: 'relative', display: 'inline-block', padding: '0 6px'}}>
              x 1
              <svg width={110} height={70} viewBox="0 0 110 70" style={{position: 'absolute', left: -26, top: -18, overflow: 'visible'}}>
                <ellipse cx={55} cy={36} rx={48} ry={28} fill="none" stroke={C.red} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - circle} transform="rotate(-8 55 36)" strokeLinecap="round" />
              </svg>
            </span>
          </span>
          <span style={{color: C.mute}}>{b.bill_unit}</span>
          <span>{b.bill_qty}</span>
          <span style={{color: C.mute}}>{b.unit_price.toLocaleString('en-US')}</span>
        </div>
        <div style={{marginTop: 10, fontSize: 20, color: C.graphite, fontFamily: FONT.sans}}>
          bill {b.bill_qty} {b.bill_unit} · drawing {b.drawn_qty} {b.bill_unit} on {d.typical.floors.length} floors · {money(b.unit_price_usd)}/{b.bill_unit}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- the paper desk (0:36–0:52)
/** The real L-1 Rev B placed so that sheet point `at` (svg units) lands on screen point `to`, at `ppu` px per unit. */
const SheetView: React.FC<{s1: Scene1Data; at: number[]; to: number[]; ppu: number; a?: number; children?: React.ReactNode; dim?: number}> = ({s1, at, to, ppu, a = 1, children, dim = 0}) => {
  const [, , vw] = s1.sheet.viewBox;
  const width = vw * ppu;
  const left = to[0] - at[0] * ppu;
  const top = to[1] - at[1] * ppu;
  return (
    <AbsoluteFill style={{opacity: a, overflow: 'hidden'}}>
      <Sheet svg={s1.sheet.svg} viewBox={s1.sheet.viewBox} width={width} style={{position: 'absolute', left, top, boxShadow: '0 30px 80px rgba(0,0,0,0.5)'}} drawingStyle={{opacity: 1 - dim}}>
        {children}
      </Sheet>
    </AbsoluteFill>
  );
};

const BillPaper: React.FC<{g: StoryV7Data['greenfield']; t: number; hi: 'camphor' | 'hedge' | 'pavers' | null; x: number; y: number; a: number}> = ({g, t, hi, x, y, a}) => {
  const rows: {key: 'camphor' | 'hedge' | 'pavers'; row: number; text: string; unit: string; qty: number; price: number}[] = [
    {key: 'camphor', row: g.camphor.row, text: g.camphor.bill_text, unit: g.camphor.bill_unit, qty: g.camphor.bill_qty, price: g.camphor.unit_price},
    {key: 'hedge', row: g.hedge.row, text: g.hedge.bill_text, unit: g.hedge.bill_unit, qty: g.hedge.bill_qty, price: 950},
    {key: 'pavers', row: g.pavers.row, text: g.pavers.bill_text, unit: 'm²', qty: g.pavers.bill_qty, price: 3800},
  ];
  void t;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 800, opacity: a, background: '#fbfaf6', boxShadow: '0 24px 70px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2)', padding: '26px 30px', fontFamily: FONT.mono, color: INK}}>
      <div style={{fontFamily: FONT.sans, fontSize: 18, color: C.mute, letterSpacing: 1.2, textTransform: 'uppercase'}}>Landscape BOQ rev3 (paving update).xlsx · governs</div>
      <div style={{display: 'grid', gridTemplateColumns: '40px 1fr 56px 60px 90px', gap: '0 12px', marginTop: 14, fontSize: 17, color: C.mute}}>
        <span>#</span>
        <span>Item</span>
        <span>Unit</span>
        <span style={{textAlign: 'right'}}>Qty</span>
        <span style={{textAlign: 'right'}}>NT$</span>
      </div>
      {rows.map((r) => {
        const on = hi === r.key;
        return (
          <div key={r.key} style={{display: 'grid', gridTemplateColumns: '40px 1fr 56px 60px 90px', gap: '0 12px', padding: '12px 0', borderTop: '1px solid #e2ded5', fontSize: 21, background: on ? 'rgba(240,165,0,0.16)' : 'transparent', outline: on ? `3px solid ${C.amber}` : 'none', outlineOffset: -3, transition: 'none'}}>
            <span style={{color: C.mute}}>{r.row}</span>
            <span style={{fontWeight: on ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{r.text}</span>
            <span style={{color: on && r.key === 'hedge' ? C.red : C.mute, fontWeight: on && r.key === 'hedge' ? 700 : 400, outline: on && r.key === 'hedge' ? `3px solid ${C.red}` : 'none', outlineOffset: 2, width: 'fit-content', padding: '0 6px'}}>{r.unit}</span>
            <span style={{textAlign: 'right', fontWeight: on && r.key !== 'pavers' ? 700 : 500, color: on && r.key === 'camphor' ? C.red : INK}}>{r.qty}</span>
            <span style={{textAlign: 'right', color: on && r.key === 'pavers' ? C.red : INK, fontWeight: on && r.key === 'pavers' ? 700 : 400}}>{r.price.toLocaleString('en-US')}</span>
          </div>
        );
      })}
    </div>
  );
};

const Desk: React.FC<{t: number; d: StoryV7Data; s1: Scene1Data}> = ({t, d, s1}) => {
  const g = d.greenfield;
  const D = V7.desk;
  const SX = (X: number) => X + g.svg.offset_x;
  const SY = (Y: number) => g.svg.flip_y - Y;
  const inA = over(t, D.start, D.start + 0.4);
  const phase: 'camphor' | 'hedge' | 'pavers' | 'total' = t < D.hedge.start ? 'camphor' : t < D.pavers.start ? 'hedge' : t < D.total.start ? 'pavers' : 'total';
  // the drawing's view: the frontage row, then a pan to the hedge, then a pull back under the pavers line
  const rowC = [SX(19), SY(2.5)];
  const hedgeC = [SX(48.8), SY(15)];
  const u1 = over(t, D.hedge.start, D.hedge.start + 0.9);
  const u2 = over(t, D.pavers.start, D.pavers.start + 0.9);
  const at = [lerp(lerp(rowC[0], hedgeC[0], u1), SX(40), u2), lerp(lerp(rowC[1], hedgeC[1], u1), SY(15), u2)];
  const ppu = lerp(lerp(27, 24, u1), 13, u2);
  const to = [lerp(lerp(1480, 1380, u1), 1400, u2), lerp(lerp(600, 400, u1), 470, u2)];
  const billA = over(t, D.billRow, D.billRow + 0.4, easeOut);
  // the canopies counting 1…8 (the row's order west → east)
  const row = [...g.row].sort((p, q) => p.centre[0] - q.centre[0]);
  const counted = row.filter((_, i) => t >= D.canopies.start + i * D.canopies.step).length;
  // the tape 0.0 → 27.0 m along H-01's first row
  const seg = g.hedge.segments[0];
  const tape = over(t, D.hedge.tape.from, D.hedge.tape.to, (u) => u);
  const tapeLen = g.hedge.row_length_m * tape;
  const plantsA = over(t, D.hedge.plants, D.hedge.plants + 0.3);
  const paversA = over(t, D.pavers.line, D.pavers.line + 0.5, easeOut);
  const totalA = over(t, D.total.stack, D.total.stack + 0.4, easeOut);
  const sumA = over(t, D.total.sum, D.total.sum + 0.4, easeOut);
  const darken = over(t, D.total.start, D.total.start + 0.6);
  return (
    <AbsoluteFill style={{background: `linear-gradient(160deg, #3b3127 0%, #241d16 60%, #17120d 100%)`, opacity: inA}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 30% 20%, rgba(255,200,130,0.16) 0%, rgba(255,180,100,0) 55%)'}} />
      {/* the drawing, right */}
      <SheetView s1={s1} at={at} to={to} ppu={ppu} dim={0.7 * darken}>
        {/* the eight canopies counting */}
        {row.map((r, i) => {
          const on = i < counted;
          const k = on ? clamp01((t - (D.canopies.start + i * D.canopies.step)) / 0.2) : 0;
          return (
            <g key={r.id} opacity={on ? 1 : 0}>
              <circle cx={SX(r.centre[0])} cy={SY(r.centre[1])} r={r.r + 0.35} fill="none" stroke={i === 7 ? C.red : C.cobalt} strokeWidth={0.12 + (1 - k) * 0.2} />
              <text x={SX(r.centre[0])} y={SY(r.centre[1]) + 0.35} fontSize={1.3} fontWeight={700} textAnchor="middle" fill={i === 7 ? C.red : C.cobalt} fontFamily="Inter">{i + 1}</text>
            </g>
          );
        })}
        {/* the hedge: a cobalt tape along the row, the readout rides its end */}
        {phase !== 'camphor' && tape > 0 ? (
          <g>
            <line x1={SX(seg[0][0])} y1={SY(seg[0][1])} x2={SX(seg[0][0])} y2={SY(seg[0][1] + tapeLen)} stroke={C.cobalt} strokeWidth={0.5} strokeLinecap="butt" opacity={0.85} />
            <line x1={SX(seg[0][0]) - 0.6} y1={SY(seg[0][1])} x2={SX(seg[0][0]) + 0.6} y2={SY(seg[0][1])} stroke={C.cobalt} strokeWidth={0.12} />
            <line x1={SX(seg[0][0]) - 0.6} y1={SY(seg[0][1] + tapeLen)} x2={SX(seg[0][0]) + 0.6} y2={SY(seg[0][1] + tapeLen)} stroke={C.cobalt} strokeWidth={0.12} />
            <text x={SX(seg[0][0]) + 1.0} y={SY(seg[0][1] + tapeLen) + 0.5} fontSize={1.5} fontWeight={700} fill={C.cobalt} fontFamily="JetBrains Mono, monospace">{fmt1(tapeLen)} m</text>
          </g>
        ) : null}
        {/* the hedge note on the sheet, boxed */}
        {phase === 'hedge' ? <rect x={g.hedge.label_at[0] - 0.3} y={g.hedge.label_at[1] - 0.8} width={11.4} height={1.3} fill="none" stroke={C.amber} strokeWidth={0.12} opacity={over(t, D.hedge.start + 0.6, D.hedge.start + 0.9)} /> : null}
      </SheetView>

      {/* the bill, left */}
      <BillPaper g={g} t={t} hi={phase === 'total' ? null : phase} x={60} y={120} a={billA * (1 - darken)} />

      {/* the hedge note and the plant count */}
      {phase === 'hedge' ? (
        <div style={{position: 'absolute', left: 60, top: 450, padding: '26px 30px', borderRadius: 28, background: 'rgba(20,22,26,0.82)', backdropFilter: 'blur(24px)', border: '1.5px solid rgba(255,255,255,0.22)', fontFamily: FONT.mono, color: C.white, opacity: over(t, D.hedge.start + 0.4, D.hedge.start + 0.7)}}>
          <div style={{fontSize: 22, color: C.soft, opacity: over(t, D.hedge.start + 0.5, D.hedge.start + 0.8)}}>the drawing's note</div>
          <div style={{fontSize: 34, fontWeight: 600, marginTop: 6, color: C.amber, opacity: over(t, D.hedge.start + 0.6, D.hedge.start + 0.9)}}>{g.hedge.label}</div>
          <div style={{fontSize: 30, marginTop: 22, opacity: plantsA, transform: `translateY(${(1 - plantsA) * 10}px)`}}>
            {g.hedge.row_length_m.toFixed(1)} m ÷ {g.hedge.spacing_m} m + 1 = {Math.floor(g.hedge.row_length_m / g.hedge.spacing_m) + 1} · × {g.hedge.rows} rows = <span style={{color: C.cobaltLt, fontWeight: 700}}>{g.hedge.count} plants</span>
          </div>
          <div style={{fontSize: 24, marginTop: 14, color: C.soft, opacity: plantsA}}>
            the bill: row {g.hedge.row} · {g.hedge.bill_qty} <span style={{color: C.red, fontWeight: 700}}>{g.hedge.bill_unit}</span> — one row's length
          </div>
        </div>
      ) : null}

      {/* the pavers line */}
      {phase === 'pavers' ? (
        <div style={{position: 'absolute', left: 60, top: 540, padding: '26px 30px', borderRadius: 28, background: 'rgba(20,22,26,0.82)', backdropFilter: 'blur(24px)', border: '1.5px solid rgba(255,255,255,0.22)', fontFamily: FONT.sans, color: C.white, opacity: paversA, transform: `translateY(${(1 - paversA) * 12}px)`}}>
          <div style={{fontSize: 22, color: C.soft, fontFamily: FONT.mono}}>row {g.pavers.row} · {g.pavers.bill_text}</div>
          <div style={{fontSize: 46, fontWeight: 600, marginTop: 8, letterSpacing: -0.6}}>
            <span style={{color: C.red}}>{money(g.pavers.bill_price_usd)}/m²</span> billed · your list: up to <span style={{color: C.greenLt}}>{money(g.pavers.list_high_usd)}</span>
          </div>
          <div style={{fontSize: 24, marginTop: 10, color: C.soft, fontFamily: FONT.mono}}>
            {g.pavers.bill_qty} m² × ({money(g.pavers.bill_price_usd)} − {money(g.pavers.list_high_usd)}) = {money(g.pavers.over_usd)}
          </div>
        </div>
      ) : null}

      {/* the three lines stack into the Statement's total */}
      {phase === 'total' ? (
        <div style={{position: 'absolute', left: 60, top: 120, width: 900, padding: '30px 40px', borderRadius: 28, background: 'rgba(20,22,26,0.82)', backdropFilter: 'blur(24px)', border: '1.5px solid rgba(255,255,255,0.22)', fontFamily: FONT.sans, color: C.white, opacity: totalA}}>
          {[
            [`${g.camphor.bill_text}: billed ${g.camphor.bill_qty}, drawn ${g.camphor.drawn_qty}`, money(g.camphor.over_usd)],
            [`${g.pavers.bill_text}: over your list`, money(g.pavers.over_usd)],
            [`${g.hedge.bill_text}: priced by the metre, ${g.hedge.count} plants`, `${g.hedge.bill_qty} ${g.hedge.bill_unit}`],
          ].map(([l, r], i) => {
            const a = over(t, D.total.stack + i * 0.18, D.total.stack + i * 0.18 + 0.3, easeOut);
            return (
              <div key={l} style={{display: 'flex', justifyContent: 'space-between', fontSize: 30, padding: '16px 0', borderBottom: '1px solid rgba(255,255,255,0.14)', opacity: a, transform: `translateY(${(1 - a) * 10}px)`}}>
                <span style={{opacity: 0.85}}>{l}</span>
                <span style={{fontVariantNumeric: 'tabular-nums', fontWeight: 600}}>{r}</span>
              </div>
            );
          })}
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 30, padding: '16px 0', opacity: totalA * 0.6}}>
            <span>+ the rest of the bill's rows</span>
            <span>…</span>
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 18, borderTop: `3px solid ${C.white}`, opacity: sumA, transform: `translateY(${(1 - sumA) * 10}px)`}}>
            <span style={{fontSize: 30}}>Queried, this bill</span>
            <span style={{fontSize: 64, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: -1}}>{money(g.queried_usd)}</span>
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the gauge and the pit (0:52–1:06)
const Gauge: React.FC<{t: number; d: StoryV7Data; s1: Scene1Data}> = ({t, d, s1}) => {
  const g = d.greenfield.greening;
  const G = V7.gauge;
  const inA = over(t, G.start, G.start + 0.4);
  const outA = 1 - over(t, G.end - 0.3, G.end);
  const max = 360;
  const W = 1500;
  const x0 = 210;
  const px = (v: number) => (v / max) * W;
  // the value: fills to provided; +2 trees lifts it to the before-pit-rule fix; the pit drops it back
  const fill = over(t, G.fill.from, G.fill.to);
  const up = over(t, G.trees.rise.from, G.trees.rise.to);
  const down = over(t, G.pit.fall.from, G.pit.fall.to);
  const plus2 = g.plus2 ? g.plus2.value : g.required;
  const v = lerp(lerp(0, g.provided, fill), plus2, up) - (plus2 - g.provided) * down * up;
  const pass = v >= g.required;
  const colour = pass ? C.greenLt : C.red;
  const SX = (X: number) => X + d.greenfield.svg.offset_x;
  const SY = (Y: number) => d.greenfield.svg.flip_y - Y;
  const row = [...d.greenfield.row].sort((p, q) => p.centre[0] - q.centre[0]);
  const shrink = over(t, G.pit.shrink, G.pit.shrink + 0.6);
  const pitA = over(t, G.pit.in, G.pit.in + 0.5, easeOut);
  const sheetA = over(t, G.trees.drop - 0.4, G.trees.drop);
  const fixesA = over(t, G.fixes.start, G.fixes.start + 0.4);
  const showFixes = t >= G.fixes.start;
  const n = (v: number) => v.toFixed(1);
  return (
    <AbsoluteFill style={{background: FIELD, opacity: inA * outA}}>
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at 50% 40%, #15181d 0%, #0e1013 50%, #0b0c0f 85%)'}} />
      {/* the gauge: the product's own design — a bar to the required line, the provided fill, the figures */}
      <div style={{position: 'absolute', left: x0, top: 120, width: W, fontFamily: FONT.sans, color: C.white, opacity: 1 - 0.85 * fixesA}}>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
          <div style={{fontSize: 26, color: C.soft}}>Greening (Art. 302) · kgCO₂e/yr · 8 trees (T-08 confirmed) · E14 · {pass ? <span style={{color: C.greenLt, fontWeight: 600}}>pass</span> : <span style={{color: C.red, fontWeight: 600}}>fail</span>}</div>
          <div />
        </div>
        <div style={{position: 'relative', height: 56, marginTop: 26, background: 'rgba(255,255,255,0.06)', borderRadius: 10, overflow: 'visible'}}>
          <div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: px(v), background: colour, borderRadius: 10, boxShadow: `0 0 30px ${colour}66`}} />
          <div style={{position: 'absolute', left: px(g.required) - 2, top: -16, bottom: -16, width: 4, background: C.white}} />
          <div style={{position: 'absolute', left: px(g.required) + 14, top: -58, fontSize: 24, color: C.white, whiteSpace: 'nowrap'}}>
            required <b>{n(g.required)}</b>
          </div>
          <div style={{position: 'absolute', left: Math.max(16, px(v) - 220), top: 70, fontSize: 30, color: colour, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: 600}}>
            provided {n(v)}
          </div>
        </div>
        {up > 0 && down < 1 ? (
          <div style={{marginTop: 70, fontSize: 24, color: C.soft, opacity: Math.min(up, 1 - down)}}>
            {g.plus2 ? `${g.plus2.label} → ${n(g.plus2.value)} — if the pits were in the ground (${n(g.before_pit_rule)} before the tree-pit rule)` : ''}
          </div>
        ) : null}
        {down > 0 ? (
          <div style={{marginTop: 70, fontSize: 24, color: C.red, opacity: down}}>
            on a slab, {d.greenfield.pit.downgraded} large trees count as small → {n(g.provided)}
          </div>
        ) : null}
      </div>

      {/* the frontage row of L-1 with two canopies dropping in, then shrinking */}
      {sheetA > 0 && !showFixes ? (
        <div style={{position: 'absolute', left: 120, top: 400, width: 1000, height: 280, opacity: sheetA, overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)'}}>
          <Sheet svg={s1.sheet.svg} viewBox={s1.sheet.viewBox} width={1000 * 2.4} style={{position: 'absolute', left: (-SX(13) * (1000 * 2.4)) / s1.sheet.viewBox[2], top: -(SY(6.5) * (1000 * 2.4)) / s1.sheet.viewBox[2]}}>
            {[0, 1].map((k) => {
              const at = G.trees.drop + k * G.trees.step;
              const drop = over(t, at, at + 0.4, easeOut);
              if (drop <= 0) return null;
              const last = row[row.length - 1];
              const cx = SX(last.centre[0] + 4 * (k + 1));
              const cy = SY(last.centre[1]) - (1 - drop) * 6;
              const r = last.r * lerp(1, 0.62, shrink);
              return (
                <g key={k} opacity={drop}>
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke={shrink > 0 ? C.red : C.cobalt} strokeWidth={0.14} />
                  <line x1={cx - 0.5} y1={cy} x2={cx + 0.5} y2={cy} stroke={shrink > 0 ? C.red : C.cobalt} strokeWidth={0.08} />
                  <line x1={cx} y1={cy - 0.5} x2={cx} y2={cy + 0.5} stroke={shrink > 0 ? C.red : C.cobalt} strokeWidth={0.08} />
                  {k === 1 ? <text x={cx - 2} y={cy - r - 0.6} fontSize={1.0} fontWeight={700} textAnchor="middle" fill={shrink > 0 ? C.red : C.cobalt} fontFamily="Inter">{shrink > 0 ? '+2 Camphor · counted small' : '+2 Camphor'}</text> : null}
                </g>
              );
            })}
          </Sheet>
        </div>
      ) : null}

      {/* the tree-pit detail, L-6, slides in */}
      {pitA > 0 && !showFixes ? (
        <div style={{position: 'absolute', left: 1240 + (1 - pitA) * 120, top: 380, width: 560, opacity: pitA, fontFamily: FONT.sans, color: C.white}}>
          <div style={{background: '#fff', aspectRatio: '2100 / 1140', overflow: 'hidden', boxShadow: '0 30px 80px rgba(0,0,0,0.5)'}}>
            <Img src={staticFile('v7/sheets/L-6.png')} style={{width: '100%', display: 'block'}} />
          </div>
          <div style={{marginTop: 18, fontSize: 22, color: C.soft, fontFamily: FONT.mono}}>L-6 · Tree Pit Detail · read by Muse Spark</div>
          <div style={{marginTop: 6, fontSize: 32, fontWeight: 600}}>
            {d.greenfield.pit.w} × {d.greenfield.pit.l} m · soil {d.greenfield.pit.soil} m · <span style={{color: C.red}}>on the slab</span>
          </div>
        </div>
      ) : null}

      {/* the fixes that pass, from the run */}
      {showFixes ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 300, display: 'flex', justifyContent: 'center', gap: 40}}>
          {g.fixes.map((f, k) => {
            const a = over(t, k === 0 ? G.fixes.a : G.fixes.b, (k === 0 ? G.fixes.a : G.fixes.b) + 0.4, easeOut);
            const label = f.label.replace(', the same species', '').replace(/, a second native species.*$/, '').replace('Change 1 Camphor to Bischofia', "change one tree's species");
            return (
              <div key={f.id} style={{opacity: a, transform: `translateY(${(1 - a) * 14}px)`}}>
                <GlassCard dot="green" title={k === 0 ? `${label.replace('Camphor', 'trees')}` : `or ${label}`} sub={`→ ${n(f.value)} · required ${n(g.required)} · pass`} width={560} inline />
              </div>
            );
          })}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the developer beat (1:09–1:19.5)
/** A revision cloud: scallops around a box (svg units). */
function cloudPath(x0: number, y0: number, x1: number, y1: number, r: number): string {
  const pts: [number, number][] = [];
  const w = x1 - x0;
  const h = y1 - y0;
  const nx = Math.max(2, Math.round(w / (r * 1.6)));
  const ny = Math.max(2, Math.round(h / (r * 1.6)));
  for (let i = 0; i < nx; i++) pts.push([x0 + (w * i) / nx, y0]);
  for (let i = 0; i < ny; i++) pts.push([x1, y0 + (h * i) / ny]);
  for (let i = 0; i < nx; i++) pts.push([x1 - (w * i) / nx, y1]);
  for (let i = 0; i < ny; i++) pts.push([x0, y1 - (h * i) / ny]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i <= pts.length; i++) {
    const [x, y] = pts[i % pts.length];
    d += ` A${r},${r} 0 0 1 ${x},${y}`;
  }
  return d;
}

const Developer: React.FC<{t: number; d: StoryV7Data; s1: Scene1Data}> = ({t, d, s1}) => {
  const g = d.greenfield;
  const K = V7.developer;
  const SX = (X: number) => X + g.svg.offset_x;
  const SY = (Y: number) => g.svg.flip_y - Y;
  const [, , vw] = s1.sheet.viewBox;
  const inA = over(t, K.start, K.start + 0.3);
  const outA = 1 - over(t, K.end - 0.25, K.end);
  const z = over(t, K.zoom.from, K.zoom.to);
  const c = g.offsite.centre;
  const at = [lerp(vw / 2, SX(c[0]), z), lerp(s1.sheet.viewBox[3] / 2, SY(c[1]), z)];
  const to = [lerp(960, 640, z), lerp(540, 470, z)];
  const ppu = lerp(1920 / vw, 52, z);
  const xs = g.offsite.outline.map((p) => SX(p[0]));
  const ys = g.offsite.outline.map((p) => SY(p[1]));
  const pad = 1.1;
  const cloud = cloudPath(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad, 0.55);
  const drawn = over(t, K.cloud.from, K.cloud.to, (u) => u);
  const cardA = over(t, K.card, K.card + 0.4, easeOut);
  const panelA = over(t, K.panel.in, K.panel.in + 0.5, easeOut);
  const b = g.boundary;
  const findings: {dot: 'red' | 'amber' | 'cobalt'; text: string; money?: string}[] = [
    {dot: 'amber', text: `Billed ${g.camphor.bill_qty}, drawn ${g.camphor.drawn_qty}`, money: money(g.camphor.over_usd)},
    {dot: 'amber', text: 'Pavers over your list', money: money(g.pavers.over_usd)},
    {dot: 'cobalt', text: 'Greenery short', money: 'building code'},
    {dot: 'amber', text: 'Hedge priced by the metre', money: `${g.hedge.count} plants`},
  ];
  return (
    <AbsoluteFill style={{background: '#2a241c', opacity: inA * outA}}>
      <SheetView s1={s1} at={at} to={to} ppu={ppu}>
        {/* the site boundary, traced faintly so "outside the site" reads */}
        <polyline points={b.map((p) => `${SX(p[0])},${SY(p[1])}`).join(' ')} fill="none" stroke={C.cobalt} strokeWidth={0.1} strokeDasharray="0.6 0.4" opacity={0.6 * z} />
        <text x={SX(c[0]) - 9.5} y={SY(1.0)} fontSize={0.7} fill={C.cobalt} fontFamily="Inter" fontWeight={600} opacity={z}>site boundary</text>
        <text x={SX(c[0]) - 9.5} y={SY(-1.2)} fontSize={0.7} fill={C.cobalt} fontFamily="Inter" fontWeight={600} opacity={z}>road reserve</text>
        {/* the revision cloud */}
        {drawn > 0 ? <path d={cloud} fill="none" stroke={C.redInk} strokeWidth={0.16} strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} /> : null}
        {drawn >= 1 ? <text x={Math.max(...xs) + pad + 0.6} y={Math.min(...ys) - pad + 0.2} fontSize={0.9} fontWeight={700} fill={C.redInk} fontFamily="Inter">T-10 · off the site</text> : null}
      </SheetView>
      {cardA > 0 ? <GlassCard dot="red" title="Send back · A tree drawn outside the site" sub={g.offsite.title} x={1130} y={150} width={690} a={cardA * (1 - panelA)} rise={(1 - cardA) * 16} tone="dark" /> : null}
      {/* the glass side panel of four real findings */}
      {panelA > 0 ? (
        <div style={{position: 'absolute', right: 0, top: 0, bottom: 0, width: 760, transform: `translateX(${(1 - panelA) * 120}px)`, opacity: panelA, background: 'rgba(20,22,26,0.80)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderLeft: '1.5px solid rgba(255,255,255,0.22)', padding: '70px 56px', fontFamily: FONT.sans, color: C.white}}>
          <div style={{fontSize: 22, color: C.soft, letterSpacing: 1.2, textTransform: 'uppercase'}}>Fix before pricing · Building code</div>
          <div style={{marginTop: 22}}>
            {findings.map((f, i) => (
              <GlassRow key={f.text} dot={f.dot} text={f.text} money={f.money} a={over(t, K.panel.rows.start + i * K.panel.rows.step, K.panel.rows.start + i * K.panel.rows.step + 0.3, easeOut)} />
            ))}
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the promise (1:19–1:26) and the close (1:26–1:30)
const Promise_: React.FC<{t: number}> = ({t}) => {
  const P = V7.promise;
  const inA = over(t, P.start, P.start + 0.2);
  const outA = 1 - over(t, P.end - 0.2, P.end);
  const chips = [
    {dot: 'cobalt' as const, name: 'Muse Spark 1.3', does: 'reads the drawings, the PDFs, the bill'},
    {dot: 'violet' as const, name: 'SAM 3.1', does: 'measures the colour plans'},
  ];
  const metaA = over(t, P.meta, P.meta + 0.4);
  return (
    <AbsoluteFill style={{background: FIELD, opacity: inA * outA}}>
      <div style={{position: 'absolute', left: 0, right: 0, top: 640, display: 'flex', justifyContent: 'center', gap: 36}}>
        {chips.map((c, k) => {
          const a = over(t, P.chips + k * 0.25, P.chips + k * 0.25 + 0.4, easeOut);
          return (
            <div key={c.name} style={{opacity: a, transform: `translateY(${(1 - a) * 24}px)`}}>
              <GlassCard dot={c.dot} title={c.name} sub={c.does} width={620} inline />
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 880, textAlign: 'center', fontFamily: FONT.sans, fontSize: 26, color: C.mute, opacity: metaA, letterSpacing: 0.5}}>by Meta</div>
    </AbsoluteFill>
  );
};

const Close: React.FC<{t: number; live?: string | null}> = ({t, live}) => {
  const K = V7.close;
  const screen = over(t, K.screenIn, K.screenIn + 1.4);
  return (
    <AbsoluteFill style={{background: FIELD}}>
      {live !== null ? <LiveSlot slot="L3" clip={live} a={over(t, K.start, K.start + 0.25)} /> : null}
      {/* the screen flies in: the product's frame rises and fills, the hand-off to Part 2 */}
      {screen > 0 ? (
        <div style={{position: 'absolute', left: lerp(300, 0, screen), right: lerp(300, 0, screen), top: lerp(1080, 0, ease(screen)), bottom: lerp(-500, 0, ease(screen)), borderRadius: lerp(28, 0, screen), background: 'linear-gradient(160deg, #1a1d22, #0b0c0f)', boxShadow: '0 -30px 120px rgba(0,0,0,0.6)', border: '1.5px solid rgba(255,255,255,0.14)'}} />
      ) : null}
    </AbsoluteFill>
  );
};

/** The L2 fallback under the placeholder: the thirty sheets fall into a pile. */
const Pile: React.FC<{t: number; sheets: StoryV7Data['sheets']}> = ({t, sheets}) => (
  <AbsoluteFill style={{background: 'linear-gradient(160deg, #3b3127 0%, #241d16 60%, #17120d 100%)', overflow: 'hidden'}}>
    {sheets.map((s, i) => {
      const at = V7.live.L2.start + 0.1 + i * 0.045;
      const u = over(t, at, at + 0.45, (x) => x * x);
      if (u <= 0) return null;
      const rot = ((i * 37) % 17) - 8;
      return (
        <div key={s.id} style={{position: 'absolute', left: 560 + ((i * 53) % 90) - 45, top: lerp(-500, 330, u) + ((i * 29) % 40) - i * 1.5, width: 800, aspectRatio: '2100 / 1140', background: '#fff', transform: `rotate(${rot * u}deg)`, boxShadow: '0 10px 30px rgba(0,0,0,0.4)', overflow: 'hidden'}}>
          <Img src={staticFile(s.png)} style={{width: '100%', display: 'block'}} />
        </div>
      );
    })}
  </AbsoluteFill>
);

// ---------------------------------------------------------------- the composition
export const StoryV7: React.FC<StoryV7Props> = ({story, scene1, live = {}, audio = 'mix'}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  if (!story || !scene1) return <AbsoluteFill style={{background: FIELD}} />;
  const T = V7.tower;
  const towerFade = 1 - over(t, T.fade.out, T.fade.out + 0.3);
  const cardA = over(t, T.card.in, T.card.in + 0.5, easeOut) * (1 - over(t, T.card.out - 0.3, T.card.out));
  const b = story.tower.bill;
  const l1 = live.L1 === undefined ? undefined : live.L1;
  const l2 = live.L2 === undefined ? undefined : live.L2;
  const l3 = live.L3 === undefined ? undefined : live.L3;
  return (
    <AbsoluteFill style={{background: FIELD, overflow: 'hidden'}}>
      {/* 0:00–0:22 the tower */}
      {t < T.fade.out + 0.4 ? (
        <AbsoluteFill style={{opacity: towerFade}}>
          <Tower3D sheets={story.sheets} typicalFloors={story.tower.typical.floors} />
          <BillRow t={t} d={story.tower} />
          {cardA > 0 ? (
            <GlassCard dot="red" title={`Bill: 1 floor · Drawing: ${story.tower.typical.floors.length} floors`} sub={`${b.bill_text}: bill ${b.bill_qty} ${b.bill_unit}, drawing ${b.drawn_qty} ${b.bill_unit} · ${money(b.unit_price_usd)}/${b.bill_unit} · ${money(b.amount_usd)} billed`} x={1060} y={540} width={780} a={cardA} rise={(1 - cardA) * 18} />
          ) : null}
          {/* LIVE L1 over the push */}
          {l1 !== null && t >= V7.live.L1.start - 0.3 && t < V7.live.L1.end + 0.3 ? <LiveSlot slot="L1" clip={l1} a={over(t, V7.live.L1.start - 0.25, V7.live.L1.start) * (1 - over(t, V7.live.L1.end, V7.live.L1.end + 0.25))} /> : null}
        </AbsoluteFill>
      ) : null}

      {/* 0:22–0:36 hook 1 v3 on its own clock */}
      {t >= V7.hook.start - 0.05 && t < V7.hook.end ? (
        <Sequence from={Math.round(V7.hook.start * fps)} durationInFrames={Math.round((V7.hook.end - V7.hook.start) * fps)} name="hook 1 v3" layout="none">
          <Scene1Tree data={scene1} offset={V7.hook.offset} silent burn={false} reference />
        </Sequence>
      ) : null}

      {/* 0:36–0:52 the paper desk */}
      {t >= V7.desk.start && t < V7.desk.end ? <Desk t={t} d={story} s1={scene1} /> : null}

      {/* 0:52–1:06 the gauge, the pit, the fixes */}
      {t >= V7.gauge.start && t < V7.gauge.end ? <Gauge t={t} d={story} s1={scene1} /> : null}

      {/* 1:06–1:09 LIVE L2 (the pile under it) */}
      {t >= V7.live.L2.start && t < V7.live.L2.end ? (
        <>
          <Pile t={t} sheets={story.sheets} />
          {l2 !== null ? <LiveSlot slot="L2" clip={l2} a={over(t, V7.live.L2.start, V7.live.L2.start + 0.2)} /> : null}
        </>
      ) : null}

      {/* 1:09–1:19.5 the developer beat on the real L-1 */}
      {t >= V7.developer.start && t < V7.developer.end ? <Developer t={t} d={story} s1={scene1} /> : null}

      {/* 1:19.5–1:26.5 the promise */}
      {t >= V7.promise.start && t < V7.promise.end ? <Promise_ t={t} /> : null}

      {/* 1:26.5–1:30 the close */}
      {t >= V7.close.start ? <Close t={t} live={l3} /> : null}

      {/* the type cards, one at a time */}
      {V7.cards.map((c) => (c.fallbackL3 && l3 ? null : <TypeCard key={c.text} text={c.text} at={c.at} until={c.until} t={t} place={c.place as 'centre' | 'low'} scrim={c.scrim !== false} size={c.place === 'centre' && c.text.length < 26 ? 132 : 104} />))}

      {/* a small source tag during the tower, as the Rules ask: an illustration of real sheets */}
      {t > 0.5 && t < T.fade.out ? (
        <div style={{position: 'absolute', left: 64, top: 40, fontFamily: FONT.mono, fontSize: 18, color: 'rgba(255,255,255,0.42)', opacity: Math.min(over(t, 0.5, 1.2), 1 - over(t, T.fade.out - 0.5, T.fade.out))}}>
          an illustration · tower package {story.tower.run_id} · {story.tower.typical.sheet}: {story.tower.typical.title}
        </div>
      ) : null}

      {/* sound */}
      {audio === 'mix' && story.audio.mix ? <Audio src={staticFile(story.audio.mix)} name="mix" /> : null}
      {audio === 'lines' || (audio === 'mix' && !story.audio.mix)
        ? V7.voice.map((v) =>
            story.audio.voice[String(v.n)] ? (
              <Sequence key={v.n} from={Math.round(v.at * fps)} durationInFrames={Math.ceil((story.audio.voice[String(v.n)]! + 0.2) * fps)} name={`voice ${v.n}`}>
                <Audio src={staticFile(`audio/v7-eric/line-${String(v.n).padStart(2, '0')}.mp3`)} />
              </Sequence>
            ) : null,
          )
        : null}
    </AbsoluteFill>
  );
};
