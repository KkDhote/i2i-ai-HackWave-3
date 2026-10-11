import { useState } from 'react';
import { evidenceFor, age } from './lib.js';

// Only 6 generic components. Every widget is one of these + data from the server catalog.
const Tag = ({ tone = 'n', children }) => <span className={'tag t-' + tone}>{children}</span>;

function StatCards({ data, c }) {
  const k = data.kpis[c.variant] || data.kpis.home;
  return <div className="kpis">{k.map(x => (
    <div className="kpi" key={x.label}><small>{x.label}</small><strong>{x.value}</strong>
      {x.delta && <small className={x.tone || ''}> {x.delta}</small>}</div>))}</div>;
}

function LineChart({ data, c }) {
  const u = data.usage, W = 560, H = 170, p = 28;
  const lo = Math.min(...u), hi = Math.max(...u), pad = Math.max(1, (hi - lo) * 0.12);
  const mn = lo - pad, mx = hi + pad;
  const x = i => p + i * (W - 2 * p) / (u.length - 1), y = v => H - p - (v - mn) * (H - 2 * p) / (mx - mn);
  const d = u.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const drop = c.variant === 'usage' && data.usageMeta.significant !== false ? data.usageMeta.dropFrom : null;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={'Daily active users over 30 days, from ' + u[0] + ' to ' + u[u.length - 1] + ', lowest ' + lo + ', highest ' + hi + '.' + (drop != null ? ' A drop begins on day ' + (drop + 1) + '.' : '')}>
      <line x1={p} x2={W - p} y1={H - p} y2={H - p} stroke="var(--line)" />
      {drop != null && <><rect x={x(drop)} y="8" width={W - p - x(drop)} height={H - p - 8} fill="var(--hl)" opacity=".55" />
        <text x={x(drop) + 4} y="22">Drop begins</text></>}
      <path d={d} fill="none" stroke="var(--acc)" strokeWidth="2.5" />
      <text x={p} y={H - 8}>Day 1</text><text x={W - p - 30} y={H - 8}>Day 30</text>
    </svg>
  );
}

function BarList({ data, c }) {
  return <>{data[c.def.source].map(b => (
    <div key={b.label}>
      <div className="row"><span>{b.label}</span><b className={b.tone === 'bad' ? 'dn' : ''}>{b.display}</b></div>
      <div className="bar" aria-hidden="true"><i className={b.tone === 'bad' ? 'bad' : ''} style={{ width: Math.min(100, b.value / (b.max || 100) * 100) + '%' }} /></div>
    </div>))}</>;
}

function ItemList({ data, c }) {
  return <ul className="list">{data[c.def.source].map((it, i) => (
    <li key={i}>
      {it.tag && <Tag tone={it.tone}>{it.tag}</Tag>}
      {c.def.checkbox ? <label className="chk"><input type="checkbox" /> {it.text}</label> : <span>{it.text}</span>}
    </li>))}</ul>;
}

function DataTable({ data, c }) {
  const cols = c.def.columns;
  return (
    <div className="tw"><table>
      <caption className="sr">{c.def.title}</caption>
      <thead><tr>{cols.map(col => <th scope="col" key={col.key}>{col.label}</th>)}</tr></thead>
      <tbody>{data[c.def.source].map((r, i) => (
        <tr key={i}>{cols.map(col => <td key={col.key}>{col.tag ? <Tag tone={r[col.key + 'Tone']}>{r[col.key]}</Tag> : r[col.key]}</td>)}</tr>))}</tbody>
    </table></div>
  );
}

const ACTIONS = {
  home: ['Start a task', 'Invite teammate'],
  meeting: ['Draft agenda email', 'Share last-meeting recap', 'Escalate export bug'],
  usage: ['Open Safari login report', 'Notify support lead', 'Start incident review'],
  overdue: ['Nudge owners', 'Reschedule 3 tasks', 'Request partner keys']
};
function ActionBar({ c, onAct }) {
  const a = ACTIONS[c.variant] || ACTIONS.home;
  return <div className="acts">{a.map(x => <button key={x} className="btn ghost sm" onClick={() => onAct(x)}>{x}</button>)}</div>;
}

const TYPES = { StatCards, LineChart, BarList, ItemList, DataTable, ActionBar };

export default function Widget({ c, data, showWhy, onAct, index, refCb, onPin }) {
  const [open, setOpen] = useState(false);
  const Body = TYPES[c.def.type];
  const id = 'w-' + c.id;
  const ev = evidenceFor(c, data), stale = ev && ev.hours > 24;
  return (
    <section ref={refCb} className={'w card'} style={{ '--s': c.span, '--i': index }} aria-labelledby={id}>
      <header>
        <h3 id={id}>{c.def.title}
          {c.status === 'new' && <> <Tag tone="n">New</Tag></>}
          {c.status === 'upd' && <> <Tag tone="warn">Updated</Tag></>}
          {c.pinned && <> <Tag tone="n">Pinned</Tag></>}
          {stale && <> <Tag tone="warn">Stale data</Tag></>}
        </h3>
        <span className="wbtns">{onPin && <button className="why-btn" aria-pressed={!!c.pinned} aria-label={(c.pinned ? 'Unpin ' : 'Pin ') + c.def.title} onClick={() => onPin(c)}>{c.pinned ? 'Unpin' : 'Pin'}</button>}<button className="why-btn" aria-controls={id + '-why'} aria-label={'Why ' + c.def.title + '?'} aria-expanded={open || showWhy} onClick={() => setOpen(o => !o)}>Why this?</button></span>
      </header>
      {(open || showWhy) && <div className="why" id={id + '-why'}>{c.reason}
        {ev && <div className="ev"><b>Evidence ({ev.source}):</b> {ev.text}.{ev.hours != null && <> <span className={stale ? 'dn' : ''}>Updated {age(ev.hours)}{stale ? ', may be out of date.' : '.'}</span></>}</div>}</div>}
      {Body && <Body c={c} data={data} onAct={onAct} />}
    </section>
  );
}
