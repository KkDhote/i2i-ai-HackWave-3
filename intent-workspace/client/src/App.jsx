import VoiceAssistant from './VoiceAssistant.jsx';
import AddTask from './AddTask.jsx';
import TaskList from './TaskList.jsx';
import CalendarWorkspace from './CalendarWorkspace.jsx';
import NotificationCenter from './NotificationCenter.jsx';
import { useLayoutEffect, useMemo, useRef, useState, useEffect } from 'react';
import { api } from './api';
import GoalWorkspace from './GoalWorkspace.jsx';
import Widget from './registry.jsx';
import ActionModal from './ActionModal.jsx';
import EvalPanel from './EvalPanel.jsx';
import AgentPanel from './AgentPanel.jsx';
import Briefing from './Briefing.jsx';
import './agent.css';
import { maskDeep, maskText } from './lib.js';
import { quickActionsFor } from './clientQuickActions.js';

const REFINE = ['Also show overdue tasks', 'Also show open issues', 'Remove next actions'];
// Animation timing in one place: tune here.
const T = { move: 700, enter: 620, stagger: 90, enterDelay: 280, glow: 2600 };
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const sigOf = (c, cid) => c.span + '|' + (c.variant || '') + '|' + (c.def.scoped ? cid : '');
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const friendly = (e) => e.name === 'TimeoutError' ? 'The AI took too long to answer. Please try again.'
  : e instanceof TypeError ? "Can't reach the server. Check that it is running (npm run dev in the server folder)."
  : e.message;

export default function App() {
  const [data, setData] = useState(null);
  const [clientId, setClientId] = useState('northwind');
  const [view, setView] = useState(null);
  const [leaving, setLeaving] = useState([]);
  const [intent, setIntent] = useState(null);
  const [clar, setClar] = useState(null);
  const [log, setLog] = useState([]);
  const [text, setText] = useState('');
  const [whyAll, setWhyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [announce, setAnnounce] = useState('');
  const [hist, setHist] = useState([]);          // earlier screens, for undo / restore
  const [pending, setPending] = useState(null);  // a change waiting for your OK (preview mode)
  const [modal, setModal] = useState(null);
  const [preview, setPreview] = useState(false);
  const [demo, setDemo] = useState(false);
  const [budget, setBudget] = useState(8);
  const viewRef = useRef(null), dataRef = useRef(null), clientRef = useRef('northwind'), lastReq = useRef(null);
  const revision = useRef(0);
  const pinsRef = useRef(new Map()), budgetRef = useRef(8);
  const gridRef = useRef(null), timer = useRef(null), els = useRef(new Map()), oldRects = useRef(new Map());
  const setRef = id => el => { if (el) els.current.set(id, el); else els.current.delete(id); };

  const measure = () => {
    const m = new Map();
    if (!gridRef.current) return m;
    const g = gridRef.current.getBoundingClientRect();
    els.current.forEach((el, id) => { const r = el.getBoundingClientRect(); m.set(id, { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height }); });
    return m;
  };

  // Pins stay on screen; the attention budget drops the least important widgets (never pinned ones).
  const shape = (res) => {
    const mode = res.plan.mode, pins = pinsRef.current;
    let comps = res.plan.components.map(c => ({ ...c }));
    const extra = [...pins.values()].filter(p => !comps.some(c => c.id === p.id)).map(p => ({ ...p, reason:'Pinned by you. Inspect the current widget evidence.', variant: p.variant !== undefined ? mode : undefined }));
    comps = [...extra, ...comps].map(c => ({ ...c, pinned: pins.has(c.id) }));
    let hidden = 0;
    if (mode !== 'fixed' && comps.length > budgetRef.current) {
      let free = budgetRef.current - comps.filter(c => c.pinned).length;
      const keep = comps.filter(c => c.pinned || free-- > 0);
      hidden = comps.length - keep.length; comps = keep;
    }
    return { comps, hidden };
  };

  const apply = (res, record = true) => {
    setClar(null); setErr(''); setPending(null);
    const cid = res.clientId || clientRef.current;
    const old = viewRef.current;
    oldRects.current = old ? measure() : new Map();
    const prev = new Map((old?.comps || []).map(c => [c.id, c.sig]));
    const { comps: shaped, hidden } = shape(res);
    const comps = shaped.map(c => {
      const sig = sigOf(c, cid);
      return { ...c, sig, status: !old ? 'first' : !prev.has(c.id) ? 'new' : prev.get(c.id) !== sig ? 'upd' : 'kept' };
    });
    const removed = old ? old.comps.filter(o => !comps.some(c => c.id === o.id)) : [];
    setLeaving(reduced() ? [] : removed.map(c => ({ c, r: oldRects.current.get(c.id) })).filter(x => x.r));
    clearTimeout(timer.current); timer.current = setTimeout(() => setLeaving([]), 480);
    const n = s => comps.filter(c => c.status === s).length;
    const next = { res, stamp: Math.random(), plan: res.plan, comps, hidden, summary: res.summary || '',
      delta: old ? `Rearranged: ${n('new')} new, ${n('upd')} updated, ${n('kept')} unchanged, ${removed.length} removed${hidden ? `, ${hidden} hidden by your attention budget` : ''}.` : '' };
    viewRef.current = next; setView(next); setIntent(res.intent);
    setAnnounce(`Workspace rearranged for ${res.intent.name}. ${comps.length} components: ${comps.map(c => c.def.title).join(', ')}.`);
    if (record && old) setHist(h => [{ res: old.res, label: old.plan.title }, ...h].slice(0, 6));
    if (old) setLog(l => [`${res.op === 'patch' ? 'Refined' : 'To "' + res.intent.name + '"'}: +${comps.filter(c => c.status === 'new').map(c => c.def.title).join(', ') || 'none'}; removed ${removed.map(c => c.def.title).join(', ') || 'none'}`, ...l].slice(0, 4));
  };

  // Load this client's data BEFORE the screen changes, so nothing flashes with old data.
  const present = async (res, record = true, requestId) => {
    const d = await api.data(res.clientId || clientRef.current);
    if (requestId !== undefined && requestId !== revision.current) return false;
    dataRef.current = d; clientRef.current = d.clientId; setData(d); setClientId(d.clientId);
    apply(res, record);
    return true;
  };

  // FLIP: kept widgets glide old spot -> new spot, then new ones fly in one by one; changed ones glow.
  useLayoutEffect(() => {
    if (!view || !gridRef.current || reduced()) return;
    const g = gridRef.current.getBoundingClientRect();
    let k = 0;
    view.comps.forEach((c) => {
      const el = els.current.get(c.id);
      if (!el || c.status === 'first') return;
      const o = oldRects.current.get(c.id), r = el.getBoundingClientRect();
      let glowDelay = 200;
      if (o && c.status !== 'new') {
        const dx = o.x - (r.left - g.left), dy = o.y - (r.top - g.top), resized = Math.abs(o.w - r.width) > 4;
        if (dx || dy || resized) el.animate(
          [{ transform: `translate(${dx}px,${dy}px)`, opacity: resized ? 0.6 : 1 }, { transform: 'none', opacity: 1 }],
          { duration: T.move, easing: EASE });
      } else {
        const delay = T.enterDelay + (k++) * T.stagger;
        glowDelay = delay + 200;
        el.animate([{ opacity: 0, transform: 'translate(-28px,16px) scale(.96)' }, { opacity: 1, transform: 'none' }],
          { duration: T.enter, delay, easing: EASE, fill: 'backwards' });
      }
      if (c.status === 'new' || c.status === 'upd')
        el.animate([{ boxShadow: '0 0 0 3px var(--acc)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: T.glow, delay: glowDelay, easing: 'ease-out' });
    });
  }, [view?.stamp]);

  const ask = async (body) => {
    const requestId = ++revision.current;
    lastReq.current = body;
    setBusy(true); setErr('');
    const v = viewRef.current;
    const current = v && { mode: v.plan.mode, title: v.plan.title, desc: v.plan.desc, components: v.comps.map(({ id, span, reason }) => ({ id, span, reason })) };
    try {
      const res = await api.intent({ ...body, current, clientId: body.clientId || clientRef.current });
      if (requestId !== revision.current) return { status:'superseded' };
      if (res.status === 'clarify' || res.status === 'unsupported') setClar(res);
      else if (preview && viewRef.current) { setClar(null); setPending(res); return { status:'preview',intent:res.intent }; }
      else if (!await present(res, true, requestId)) return { status:'superseded' };
      return res;
    } catch (e) { if (requestId === revision.current) setErr(friendly(e)); return { status:'error',message:friendly(e) }; }
    finally { if (requestId === revision.current) setBusy(false); }
  };

  const requestWorkspace = async (value, target) => {
    if (busy) return 'The workspace is still updating. Please try again after it finishes.';
    const other = (data?.clients || []).find(c => c.id !== clientId && (c.aliases || []).some(alias => new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b','i').test(value)));
    if (other) return `This chat belongs to ${selectedClient}. Select ${other.name} using the Client selector before continuing there.`;
    if (target.type === 'calendar') {
      window.location.hash = 'workspace-calendar';
      window.dispatchEvent(new Event('workspace-open-calendar'));
      document.getElementById('workspace-calendar')?.scrollIntoView({ behavior:reduced() ? 'auto' : 'smooth' });
      return `Opened Calendar, meetings & places for ${selectedClient}. Use its controls to add or sync an entry.`;
    }
    const result = await ask(target.type === 'layout' ? { pick:target.pick,clientId } : { text:value,clientId });
    if (result.status === 'plan') return `Updated the dashboard for ${selectedClient}: ${result.intent.name}. Use “Why this?” to inspect the records.${result.plan.components.some(c => ['overdue','load','blockers'].includes(c.id)) ? ' Overdue project work covers the whole workspace.' : ''}`;
    if (result.status === 'preview') return 'The requested screen is ready for preview. Select Apply in the sidebar to update the dashboard.';
    if (result.status === 'clarify' || result.status === 'unsupported') return result.message + ' Choose an option in the sidebar.';
    return result.message || 'That request did not update the dashboard. Please retry.';
  };

  const restored = res => ({...res,agent:null,summary:'Restored your earlier layout with current records.',intent:{...res.intent,source:'user-pick'},plan:{...res.plan,components:res.plan.components.map(c=>({...c,reason:'Restored from your earlier layout. Inspect the current widget evidence.'}))}});
  const undo = async () => { const [s, ...rest] = hist; if (!s) return; setHist(rest); await present(restored(s.res), false); };
  const restore = async (i) => { const s = hist[i]; setHist(h => h.filter((_, j) => j !== i)); await present(restored(s.res), true); };
  const changeBudget = (n) => { setBudget(n); budgetRef.current = n; if (viewRef.current) apply(viewRef.current.res, false); };
  const togglePin = (c) => {
    const pins = pinsRef.current;
    if (pins.has(c.id)) pins.delete(c.id); else pins.set(c.id, { id: c.id, span: c.span, reason: c.reason, variant: c.variant, def: c.def });
    const upd = v => v && { ...v, comps: v.comps.map(x => x.id === c.id ? { ...x, pinned: pins.has(c.id) } : x) };
    viewRef.current = upd(viewRef.current); setView(upd);
    setLog(l => [`${pins.has(c.id) ? 'Pinned' : 'Unpinned'}: ${c.def.title}`, ...l].slice(0, 4));
  };

  useEffect(() => { ask({ pick: 'home' }); }, []);
  useEffect(() => {
    let controller;
    const refreshTasks = async () => {
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal, cid = clientRef.current;
      try {
        const fresh = await api.data(cid, signal);
        if (!signal.aborted && clientRef.current === cid) { dataRef.current = fresh; setData(fresh); }
      } catch (e) { if (!signal.aborted) setErr('Task saved, but dashboard refresh failed: ' + friendly(e)); }
    };
    window.addEventListener('workspace-tasks-changed', refreshTasks);
    return () => { controller?.abort(); window.removeEventListener('workspace-tasks-changed', refreshTasks); };
  }, []);
  const submit = (e) => { e.preventDefault(); if (!busy && text.trim()) { ask({ text }); setText(''); } };
  const mode = view?.plan.mode;
  const pct = intent ? Math.round(intent.confidence * 100) : 0;
  const shown = useMemo(() => (demo && data ? maskDeep(data) : data), [data, demo]);
  const mk = (s) => (demo ? maskText(s) : s);
  const selectedClient = data?.clients?.find(c => c.id === clientId)?.name || clientId;

  // What would change if you accepted the pending screen?
  const diff = pending && view && (() => {
    const s = shape(pending).comps, cur = view.comps;
    return { add: s.filter(c => !cur.some(o => o.id === c.id)), rem: cur.filter(c => !s.some(o => o.id === c.id)), keep: s.filter(c => cur.some(o => o.id === c.id)).length };
  })();

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to workspace</a>
      <aside>
        <div><h1>I2I By AI</h1><p className="sub">Say what you need. The workspace rebuilds itself around it.</p></div>
        <form onSubmit={submit}>
          <label htmlFor="q">What are you trying to do?</label>
          <div className="ask">
            <input id="q" value={text} onChange={e => setText(e.target.value)} autoComplete="off" placeholder="e.g. Prepare the Aarogya meeting" />
            <button className="btn" disabled={busy}>{busy ? '...' : 'Go'}</button>
          </div>
          <p className="fine">Quick actions for {mk(selectedClient)}</p>
          <div className="chips" aria-label={'Quick actions for ' + mk(selectedClient)}>{quickActionsFor(clientId).map(action => <button type="button" key={action.pick} className="chip" disabled={busy} onClick={() => ask({ pick: action.pick, clientId })}>{mk(action.label)}</button>)}</div>
          {mode && mode !== 'home' && mode !== 'fixed' && <>
            <label style={{ display: 'block', marginTop: 12 }}>Refine this screen</label>
            <div className="chips">{REFINE.filter(x => x !== 'Remove next actions' || view?.comps.some(c => c.id === 'actions')).map(x => <button type="button" key={x} className="chip" disabled={busy} onClick={() => ask({ text: x })}>{x}</button>)}</div></>}
        </form>
        {shown?.clients && <div><label htmlFor="cl">Client</label>
          <select id="cl" value={clientId} disabled={busy} onChange={e => ask({ pick: mode || 'home', clientId: e.target.value })}>
            {shown.clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <p className="fine">You can also type a client name, like "Aarogya usage". Company records are fictional Indian demo data.</p></div>}
        {busy && <p className="sub">AI is arranging your screen...</p>}
        {diff && <div className="clar"><b>Preview: {pending.intent.name}</b>
          <p className="fine">Add: {diff.add.map(c => c.def.title).join(', ') || 'nothing'}.<br />Remove: {diff.rem.map(c => c.def.title).join(', ') || 'nothing'}.<br />Keep: {diff.keep} widgets.</p>
          <div className="chips"><button className="chip" disabled={busy} onClick={() => present(pending)}>Apply</button><button className="chip" disabled={busy} onClick={() => setPending(null)}>Discard</button></div></div>}
        {clar && <div className="clar"><b>{clar.message}</b>
          <div className="chips">{clar.options.map(o => <button key={o.key} className="chip" onClick={() => ask({ pick: o.key })}>{o.label}</button>)}</div></div>}
        {err && <div className="clar" role="alert">{err}
          <div className="chips"><button className="chip" onClick={() => lastReq.current && ask(lastReq.current)}>Try again</button></div></div>}
        {intent && <div className="intent">
          <b>{intent.key === 'home' ? 'No task set' : intent.name}</b>
          {intent.key !== 'home' && <>
            <div className="meter" role="meter" aria-label="Confidence" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pct}><i style={{ width: pct + '%' }} /></div>
            <div>Interpretation confidence {pct}%{intent.hits.length ? '. Matched: ' + intent.hits.join(', ') : ''}.
              {' '}Planned by {intent.source === 'llm' ? `AI in ${(intent.ms / 1000).toFixed(1)}s` : intent.source === 'user-pick' ? 'your choice' : 'built-in rules'}.</div>
            <p className="fine">This is an estimate of how the request was interpreted, not measured answer accuracy. Unclear requests ask for clarification.</p>
            {intent.fallback && <p className="fine"><b>The AI was unavailable, so built-in rules planned this screen.</b></p>}</>}
        </div>}
        <div className="ctl">
          <h2 className="small">Workspace controls</h2>
          <button className="btn ghost sm" onClick={undo} disabled={busy || !hist.length}>Undo last change</button>
          <label htmlFor="bud" style={{ fontWeight: 600 }}>Attention budget</label>
          <select id="bud" value={budget} onChange={e => changeBudget(+e.target.value)}>
            <option value="4">Up to 4 widgets</option><option value="6">Up to 6 widgets</option><option value="8">Up to 8 widgets</option></select>
          <label><input type="checkbox" checked={preview} onChange={e => setPreview(e.target.checked)} /> Preview changes before applying</label>
          <label><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} /> Demo mode: hide sensitive data</label>
          <button className="btn ghost sm" onClick={() => setModal({ type: 'eval' })}>Evaluation and comparison</button>
        </div>
        {hist.length > 0 && <div><h2 className="small">Restore earlier screens</h2>
          <ul className="rest">{hist.map((h, i) => <li key={i}><span>{mk(h.label)}</span><button className="chip" disabled={busy} onClick={() => restore(i)}>Restore</button></li>)}</ul></div>}
        {view && <details><summary>View plan JSON</summary>
          <pre>{JSON.stringify(view.comps.map(({ id, span, reason, variant, pinned }) => ({ id, span, reason, variant, pinned })), null, 1)}</pre></details>}
        <div><h2 className="small">What changed</h2><ol className="log">{log.map((x, i) => <li key={i}>{mk(x)}</li>)}</ol></div>
      </aside>
      <main id="main" tabIndex={-1}>
        <NotificationCenter demo={demo} />
        <VoiceAssistant key={'chat-' + clientId} demo={demo} clientId={clientId} clientName={data?.clients?.find(c => c.id === clientId)?.name || clientId} onWorkspaceRequest={requestWorkspace} />
        {view && shown && <>
          <div className="head">
            <div><h2 className="big">{mk(view.plan.title)}</h2><p className="sub">{view.plan.desc}</p></div>
            <div className="tools">
              <button className="btn ghost sm" aria-pressed={whyAll} onClick={() => setWhyAll(v => !v)}>{whyAll ? 'Hide all reasons' : 'Show all reasons'}</button>
              <button className="btn ghost sm" disabled={busy} onClick={() => ask({ pick: 'home' })}>Back to dashboard</button>
            </div>
          </div>
          {view.summary && <p className="note"><b>Workspace note:</b> {mk(view.summary)}</p>}
          {mode === 'home' && <Briefing onGo={(g) => ask({ text: g })} mk={mk} />}
          {view.res?.agent && <AgentPanel agent={view.res.agent} mk={mk} />}
          <div className="delta">{view.delta}</div>
          <div className="grid" ref={gridRef} aria-busy={busy}>
            {view.comps.map((c, i) => <Widget key={c.id} c={c} index={i} data={shown} showWhy={whyAll} onAct={(name) => setModal({ type: 'action', name })} onPin={togglePin} refCb={setRef(c.id)} />)}
            {leaving.map(({ c, r }) => (
              <div key={'g-' + c.id} className="ghost" aria-hidden="true" style={{ left: r.x, top: r.y, width: r.w, height: r.h }}>
                <Widget c={{ ...c, status: 'kept' }} index={0} data={shown} showWhy={false} onAct={() => {}} refCb={null} />
              </div>))}
          </div>
        </>}
        <TaskList mk={mk} />
        <CalendarWorkspace key={'calendar-' + clientId} clientId={clientId} clientName={data?.clients?.find(c => c.id === clientId)?.name || clientId} demo={demo} />
        <GoalWorkspace />
        <AddTask key={'add-task-' + clientId} clientId={clientId} clientName={data?.clients?.find(c => c.id === clientId)?.name || clientId} />
        {!data && !err && <p className="sub">Loading workspace...</p>}
      </main>
      <div className="sr" role="status" aria-live="polite">{announce}</div>
      {toast && <div className="toast on" role="status">{toast}</div>}
      {modal?.type === 'action' && <ActionModal action={modal.name} mode={mode} clientId={clientId} masked={demo}
        onClose={() => setModal(null)} onApproved={(a) => setLog(l => [`Approved: ${a}`, ...l].slice(0, 4))} />}
      {modal?.type === 'eval' && <EvalPanel onClose={() => setModal(null)} onFixed={() => { setModal(null); ask({ pick: 'fixed' }); }} />}
    </div>
  );
}
