// The console, laid out at 1600 × 900 (recorded at 1.2×, so 28.5 px here is 34 px on the 1080 frame): a top bar
// (Landsight, the package, the sheet), the review log as a thin scrubber with a tick on every beat, a left card with the
// current finding's real numbers, a right card with the four check groups, the part under review and the operator's
// modes, labels with leaders into the model, the operator's pointer. The bottom centre stays empty for the caption.
// update(u) redraws every live part from the frame's state.
import {lockupSvg} from '../src/logo/marks.js';
import {GROUPS, LOG, MODES} from './data.js';
import {LOOK as C} from './look.js';

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.mo{font-family:'JetBrains Mono',ui-monospace,monospace}
.cp{position:absolute;background:${C.panel};border:1px solid ${C.line};border-radius:10px;box-shadow:0 6px 22px rgba(60,55,45,.07)}
.sm{font:600 12.5px 'JetBrains Mono',monospace;letter-spacing:1.6px;color:${C.mute};text-transform:uppercase;white-space:nowrap}
.row{display:flex;align-items:baseline;justify-content:space-between;gap:14px;margin-top:10px}
.row .l{font-size:29px;font-weight:500;color:${C.mute};white-space:nowrap}
.row .v{font-size:34px;font-weight:700;letter-spacing:-.5px;white-space:nowrap}
.row.st{display:block}
.row.st .v{display:block;margin-top:2px}
.fix{display:flex;gap:12px;align-items:flex-start;margin-top:16px;font-size:29px;font-weight:650;line-height:1.16;color:${C.accent}}
.fix i{flex:none;width:12px;height:12px;margin-top:11px;background:${C.accent};border-radius:2px}
.grp{display:flex;align-items:center;gap:14px;height:50px;font-size:29px;font-weight:600;white-space:nowrap}
.grp i{flex:none;width:15px;height:15px;border-radius:50%;box-sizing:border-box}
.sub{display:flex;align-items:center;gap:9px;height:27px;font-size:17px;font-weight:500;white-space:nowrap}
.sub i{flex:none;width:13px;height:13px;border-radius:3px;box-sizing:border-box;border:1.5px solid ${C.faint};position:relative}
.pill{display:inline-flex;align-items:center;height:26px;padding:0 9px;margin:0 5px 6px 0;border-radius:13px;border:1px solid ${C.line};font:700 11.5px 'JetBrains Mono',monospace;letter-spacing:1.2px;text-transform:uppercase;color:${C.mute}}
.call{position:absolute;white-space:nowrap;display:flex;align-items:center;gap:10px;padding:5px 14px 7px;background:rgba(251,250,247,.96);border:1px solid ${C.line};border-radius:8px;font-size:29px;font-weight:600;letter-spacing:-.2px;box-shadow:0 4px 14px rgba(40,40,40,.1)}
.call i{flex:none;width:10px;height:10px;border-radius:2px;background:${C.accent}}
.call.ac{background:${C.accent};color:#fff;border-color:${C.accent}}
.call.sm2{font-size:22px;padding:2px 9px 4px;gap:7px;border-radius:6px}
.call.sm2 i{width:7px;height:7px}
.call.ac i{background:#fff}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:38px;height:38px;margin:-19px 0 0 -19px;border-radius:50%;border:2px solid ${C.accent};opacity:0;z-index:49}
.btn{display:inline-flex;align-items:center;gap:10px;margin-top:16px;padding:10px 20px 12px;border-radius:10px;font-size:29px;font-weight:650;color:#fff;background:${C.accent}}
table.t{border-collapse:collapse;width:100%;margin-top:8px}
table.t td{padding:5px 0;font-size:28px;white-space:nowrap;border-bottom:1px solid ${C.line}}
table.t td.n{text-align:right;font-weight:700;padding-left:12px}
table.t th{font:600 12px 'JetBrains Mono',monospace;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;text-align:right;padding:0 0 4px 10px}
table.t th:first-child{text-align:left;padding-left:0}
.bd h3{display:flex;align-items:center;gap:14px;margin:0 0 10px;font-size:30px;font-weight:700}
.bd h3 i{width:15px;height:15px;border-radius:50%;background:${C.ink}}
.bd p{margin:0 0 7px;font-size:24px;font-weight:500;line-height:1.2;white-space:nowrap}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};
// a number keeps its unit on the same line
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/(\d) (?=(m²|m\b|%|trees\b|floors\b|plants\b))/g, '$1\u00a0');

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h, parent = ui) => {
    const n = el(h);
    parent.appendChild(n);
    return n;
  };

  // ------------------------------------------------------------ top bar
  const top = add(`<div style="position:absolute;left:0;top:0;width:1600px;height:76px;background:${C.panel};border-bottom:1px solid ${C.line}"></div>`);
  add(`<div style="position:absolute;left:40px;top:21px;height:34px">${lockupSvg('b', 'light').replace(/width="\d+" height="\d+"/, 'height="34"')}</div>`, top);
  add(`<div style="position:absolute;left:252px;top:18px;width:1px;height:40px;background:${C.line}"></div>`, top);
  add(`<div style="position:absolute;left:276px;top:19px;font-size:29px;font-weight:650;letter-spacing:-.3px">Greenfield Residences</div>`, top);
  add(`<div class="sm" style="position:absolute;left:640px;top:31px">sheet</div>`, top);
  const sheetId = add(`<div class="mo" style="position:absolute;left:702px;top:20px;font-size:29px;font-weight:700"></div>`, top);
  const sheetName = add(`<div style="position:absolute;top:27px;font-size:19px;font-weight:500;color:${C.mute};white-space:nowrap"></div>`, top);

  // ------------------------------------------------------------ the review log
  const log = add(`<div style="position:absolute;left:0;top:76px;width:1600px;height:40px"></div>`);
  add(`<div class="sm" style="position:absolute;left:40px;top:14px">review log</div>`, log);
  const LX = 176;
  const LW = 1560 - LX;
  add(`<div style="position:absolute;left:${LX}px;top:20px;width:${LW}px;height:2px;background:${C.line}"></div>`, log);
  const logFill = add(`<div style="position:absolute;left:${LX}px;top:20px;height:2px;background:${C.accent}"></div>`, log);
  const ticks = LOG.map(() => add(`<div style="position:absolute;top:14px;width:2px;height:14px;margin-left:-1px;background:${C.faint}"></div>`, log));
  const knob = add(`<div style="position:absolute;top:13px;width:16px;height:16px;margin-left:-8px;border-radius:50%;background:#fff;border:3px solid ${C.accent};box-sizing:border-box"></div>`, log);

  // ------------------------------------------------------------ left card: the finding
  const left = add(`<div class="cp" style="left:36px;top:136px;width:390px;padding:18px 22px 22px;box-sizing:border-box"></div>`);
  const lHead = add(`<div style="display:flex;justify-content:space-between"><span class="sm lh"></span><span class="sm lg" style="color:${C.accent}"></span></div>`, left);
  const lTitle = add(`<div style="margin-top:12px;font-size:31px;font-weight:700;line-height:1.13;letter-spacing:-.4px"></div>`, left);
  const lRef = add(`<div style="margin-top:8px;font-size:17px;font-weight:500;line-height:1.3;color:${C.mute}"></div>`, left);
  const lBody = add(`<div style="margin-top:8px;border-top:1px solid ${C.line};padding-top:4px"></div>`, left);

  // ------------------------------------------------------------ right card: the four groups, the part under review, the operator
  const right = add(`<div class="cp" style="left:1228px;top:136px;width:336px;padding:16px 20px 14px;box-sizing:border-box"></div>`);
  add(`<div style="display:flex;justify-content:space-between"><span class="sm">checks</span><span class="sm">4 groups</span></div>`, right);
  const grpEl = GROUPS.map((g) => add(`<div class="grp"><i></i><span>${g.name}</span></div>`, right));
  add(`<div style="height:1px;background:${C.line};margin:8px 0 10px"></div>`, right);
  const subLine = add(`<div style="display:flex;align-items:center;gap:10px;height:30px;white-space:nowrap"><span class="sm">part</span><span class="sv" style="font-size:22px;font-weight:650"></span></div>`, right);
  const subName = subLine.querySelector('.sv');
  add(`<div class="sm" style="margin:10px 0 8px">operator</div>`, right);
  const pills = add(`<div></div>`, right);
  const modeEl = Object.fromEntries(MODES.map((m) => [m, add(`<span class="pill">${m}</span>`, pills)]));

  // ------------------------------------------------------------ the findings board, the end panel
  const board = add(`<div class="cp bd" style="left:40px;top:140px;width:1520px;height:640px;padding:30px 40px;box-sizing:border-box"></div>`);
  const endPanel = add(`<div class="cp" style="left:40px;top:140px;width:660px;padding:26px 32px 30px;box-sizing:border-box"></div>`);

  // ------------------------------------------------------------ labels, the pointer
  const callSvg = add(`<svg style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="26" height="26" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="${C.ink}" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  // the pointer's targets: the operator's modes (laid out now, so their centres are known)
  const spots = {};
  for (const m of MODES) spots[`mode:${m}`] = centre(modeEl[m]);

  const setGroup = (n, state) => {
    const i = n.querySelector('i');
    const sp = n.querySelector('span');
    i.style.background = state === 'active' ? C.accent : state === 'seen' ? C.ink : 'transparent';
    i.style.border = state === 'idle' ? `2px solid ${C.faint}` : 'none';
    sp.style.color = state === 'active' ? C.accent : state === 'seen' ? C.ink : C.faint;
  };
  const rowsHtml = (rows) =>
    rows
      .map(([l, v]) => {
        const stack = l.length + String(v).length > 23;
        return `<div class="row${stack ? ' st' : ''}"><span class="l">${esc(l)}</span><span class="v">${esc(v)}</span></div>`;
      })
      .join('');
  let lastLeft = '';
  let lastBoard = '';
  let lastEnd = '';
  const pointer = (c) => {
    cur.style.display = c && c.a > 0.01 ? 'block' : 'none';
    if (!c) return;
    cur.style.opacity = String(c.a);
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.9);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };

  return {
    spots,
    /**
     * u: {chrome 0..1, sheet [id, name], log 0..1, left {a, head, group, title, ref, html, wide}, groups {key: state},
     *     part, partDone, mode, board {a, html}, end {a, html}, callouts [{text, at, label, o, accent, anchor}], cursor}
     */
    update(u) {
      const ch = u.chrome ?? 1;
      top.style.opacity = String(ch);
      log.style.opacity = String(ch);
      // idle (nothing under review) the right card steps back
      const busy = Object.values(u.groups ?? {}).includes('active') || !!u.mode;
      right.style.opacity = String(Math.min(ch, u.rightA ?? 1) * (busy ? 1 : 0.62));
      sheetId.textContent = u.sheet?.[0] ?? '';
      sheetName.textContent = u.sheet?.[1] ?? '';
      sheetName.style.left = `${702 + sheetId.getBoundingClientRect().width / (window.__PX || 1) + 14}px`;
      const kx = LX + (u.log ?? 0) * LW;
      logFill.style.width = `${((u.log ?? 0) * LW).toFixed(1)}px`;
      knob.style.left = `${kx.toFixed(1)}px`;
      LOG.forEach((b, i) => {
        ticks[i].style.left = `${(LX + u.logAt(b.t) * LW).toFixed(1)}px`;
        ticks[i].style.background = u.logAt(b.t) <= (u.log ?? 0) + 1e-4 ? C.accent : C.faint;
      });
      // left card
      const L = u.left;
      left.style.display = L && L.a > 0.005 ? 'block' : 'none';
      if (L && L.a > 0.005) {
        left.style.opacity = String(L.a);
        left.style.width = L.wide ? '524px' : '390px';
        left.style.transform = `translateY(${((1 - L.a) * 10).toFixed(1)}px)`;
        const key = JSON.stringify([L.head, L.group, L.title, L.ref, L.html]);
        if (key !== lastLeft) {
          lastLeft = key;
          lHead.querySelector('.lh').textContent = L.head ?? '';
          lHead.querySelector('.lg').textContent = L.group ?? '';
          lTitle.textContent = L.title ?? '';
          lTitle.style.display = L.title ? 'block' : 'none';
          lRef.textContent = L.ref ?? '';
          lRef.style.display = L.ref ? 'block' : 'none';
          lBody.innerHTML = L.html ?? '';
          lBody.style.display = L.html ? 'block' : 'none';
        }
      }
      // right card
      GROUPS.forEach((g, i) => setGroup(grpEl[i], u.groups?.[g.key] ?? 'idle'));
      subLine.style.display = u.part ? 'flex' : 'none';
      subName.textContent = u.part ?? '';
      subName.style.color = u.partDone ? C.ink : C.accent;
      for (const m of MODES) {
        const on = u.mode === m;
        modeEl[m].style.background = on ? C.accent : 'transparent';
        modeEl[m].style.color = on ? '#fff' : C.mute;
        modeEl[m].style.borderColor = on ? C.accent : C.line;
      }
      // board and end
      board.style.display = u.board && u.board.a > 0.005 ? 'block' : 'none';
      if (u.board && u.board.a > 0.005) {
        board.style.opacity = String(u.board.a);
        if (u.board.html !== lastBoard) board.innerHTML = lastBoard = u.board.html;
      }
      endPanel.style.display = u.end && u.end.a > 0.005 ? 'block' : 'none';
      if (u.end && u.end.a > 0.005) {
        endPanel.style.opacity = String(u.end.a);
        if (u.end.html !== lastEnd) endPanel.innerHTML = lastEnd = u.end.html;
      }
      // labels: a square, the words, a leader to the point
      let lh = '';
      let chs = '';
      for (const c of u.callouts ?? []) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        if (!c.bare) lh += `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${lx.toFixed(1)}" y2="${ly.toFixed(1)}" stroke="${C.accent}" stroke-width="2" opacity="${c.o.toFixed(2)}"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="5" fill="#fff" stroke="${C.accent}" stroke-width="2.5" opacity="${c.o.toFixed(2)}"/>`;
        const anchor = c.anchor ?? 'translate(-50%, -50%)';
        chs += `<div class="call${c.accent ? ' ac' : ''}${c.small ? ' sm2' : ''}" style="left:${lx.toFixed(1)}px;top:${ly.toFixed(1)}px;transform:${anchor};opacity:${c.o.toFixed(2)}"><i></i>${esc(c.text)}</div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = chs;
      pointer(u.cursor);
    },
    rowsHtml,
    esc,
  };
}
