// Shows HOW the agent decided: which data it checked, what it found, and how long each step took.
const LABEL = {
  find_at_risk_clients: 'Ranked clients by churn risk',
  get_client_snapshot: 'Pulled the client snapshot',
  analyze_usage: 'Analyzed product usage',
  get_overdue_work: 'Checked overdue work',
  compare_clients: 'Compared two clients',
  search_tickets: 'Searched support issues',
  list_clients: 'Listed all clients'
};
const argText = a => Object.values(a || {}).filter(Boolean).join(', ');

export default function AgentPanel({ agent, mk = s => s }) {
  if (!agent || (!agent.calls?.length && !agent.findings?.length)) return null;
  const ok = (agent.calls || []).filter(c => c.ok).length, total = Math.max(0, ...((agent.calls || []).map(c => c.ms || 0)));
  return (
    <details className="agent" open>
      <summary>How the agent decided: checked {ok} data source{ok === 1 ? '' : 's'}{agent.planner === 'rules' ? ' (fallback rules picked the checks)' : ''}</summary>
      {agent.findings?.length > 0 && <>
        <h3 className="small">What it found</h3>
        <ul className="finds">{agent.findings.map((f, i) => <li key={i}>{mk(f)}</li>)}</ul></>}
      {agent.calls?.length > 0 && <>
        <h3 className="small">What it checked, in order</h3>
        <ol className="steps">{agent.calls.map((c, i) => (
          <li key={i}>
            <span className="n" aria-hidden="true">{i + 1}</span>
            <div><b>{LABEL[c.tool] || c.tool}</b>{argText(c.args) && <span className="fine"> ({mk(argText(c.args))})</span>}
              <div className={c.ok ? '' : 'dn'}>{c.ok ? mk(c.summary) : 'Could not run: ' + c.summary}</div></div>
            <span className="fine">{c.ms} ms</span>
          </li>))}</ol>
        <p className="fine">Every number in "Why this?" comes from these checks, not from the AI's memory.{total ? '' : ''}</p></>}
    </details>
  );
}
