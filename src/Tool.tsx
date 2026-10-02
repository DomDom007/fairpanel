// Fairpanel: compares each interviewer's scores with how hires actually performed, to find harsh, lenient and noisy raters.
import { useState } from "react";
import { csvObjects, num } from "./lib/csv";
import { uid, useStored } from "./lib/store";
import { ImportBox, Section, Stat, Stats } from "./ui/kit";

const T = "fairpanel";
type Cand = { id: string; name: string; role: string; scores: Record<string, number>; hired: boolean; perf?: number };
const PANEL = ["Sami", "Rania", "Walid", "Olfa"];
const SAMPLE: Cand[] = [
  { id: "c1", name: "Candidate A", role: "Engineer", scores: { Sami: 4, Rania: 3, Walid: 4, Olfa: 2 }, hired: true, perf: 4 },
  { id: "c2", name: "Candidate B", role: "Engineer", scores: { Sami: 3, Rania: 2, Walid: 3, Olfa: 2 }, hired: true, perf: 2 },
  { id: "c3", name: "Candidate C", role: "Engineer", scores: { Sami: 5, Rania: 4, Walid: 4, Olfa: 3 }, hired: true, perf: 5 },
  { id: "c4", name: "Candidate D", role: "Designer", scores: { Sami: 4, Rania: 2, Olfa: 2 }, hired: true, perf: 3 },
  { id: "c5", name: "Candidate E", role: "Designer", scores: { Sami: 5, Rania: 4, Walid: 5, Olfa: 3 }, hired: true, perf: 4 },
  { id: "c6", name: "Candidate F", role: "Engineer", scores: { Sami: 3, Rania: 1, Walid: 2, Olfa: 1 }, hired: false },
  { id: "c7", name: "Candidate G", role: "Engineer", scores: { Sami: 4, Rania: 3, Walid: 3, Olfa: 3 }, hired: true, perf: 3 },
  { id: "c8", name: "Candidate H", role: "Engineer", scores: { Sami: 5, Rania: 3, Walid: 5, Olfa: 2 }, hired: true, perf: 5 },
];
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function corr(x: number[], y: number[]) {
  if (x.length < 3) return NaN;
  const mx = mean(x), my = mean(y);
  const num_ = x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0);
  const den = Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
  return den ? num_ / den : NaN;
}

export default function Fairpanel() {
  const [panel, setPanel] = useStored<string[]>(T, "panel", PANEL);
  const [cands, setCands] = useStored<Cand[]>(T, "cands", SAMPLE);
  const [d, setD] = useState<{ name: string; role: string; scores: Record<string, string> }>({ name: "", role: "", scores: {} });
  const [newI, setNewI] = useState("");

  // Offset: how much higher or lower each interviewer scores than the rest of the panel on the same candidates.
  const stats = panel.map(p => {
    const mine = cands.filter(c => c.scores[p] !== undefined);
    const offsets = mine.map(c => { const others = Object.entries(c.scores).filter(([k]) => k !== p).map(([, v]) => v); return others.length ? c.scores[p] - mean(others) : 0; });
    const withPerf = mine.filter(c => c.hired && c.perf !== undefined);
    const r = corr(withPerf.map(c => c.scores[p]), withPerf.map(c => c.perf!));
    const spread = Math.sqrt(mean(mine.map(c => (c.scores[p] - mean(mine.map(x => x.scores[p]))) ** 2)));
    return { p, n: mine.length, offset: mean(offsets), r, spread, avg: mean(mine.map(c => c.scores[p])) };
  });
  const label = (s: typeof stats[number]) => s.n < 3 ? ["Not enough interviews yet", ""] : s.offset > 0.5 ? ["Scores generously", "warn"] : s.offset < -0.5 ? ["Scores harshly", "warn"] : ["Well calibrated", "good"];
  const predictive = (r: number) => isNaN(r) ? ["Needs 3+ hires with ratings", ""] : r >= 0.5 ? ["Strong predictor", "good"] : r >= 0.2 ? ["Some signal", ""] : ["Scores do not predict performance", "bad"];
  const adjusted = (c: Cand) => { const vals = Object.entries(c.scores).map(([k, v]) => v - (stats.find(s => s.p === k)?.offset ?? 0)); return mean(vals); };
  const pending = cands.filter(c => !c.hired || c.perf === undefined);

  return (
    <div className="stack">
      <Section title="Panel calibration">
        <Stats><Stat value={cands.length} label="Candidates scored" /><Stat value={cands.filter(c => c.hired && c.perf !== undefined).length} label="Hires with a performance rating" /><Stat value={panel.length} label="Interviewers" /></Stats>
        <div className="table-wrap" style={{ marginTop: 16 }}><table className="t">
          <thead><tr><th>Interviewer</th><th className="r">Interviews</th><th className="r">Average</th><th className="r">Vs panel</th><th>Calibration</th><th className="r">Predicts performance</th><th /></tr></thead>
          <tbody>{stats.map(s => { const l = label(s), pr = predictive(s.r); return (
            <tr key={s.p}><td><strong>{s.p}</strong></td><td className="r">{s.n}</td><td className="r">{s.avg.toFixed(1)}</td>
              <td className="r">{s.offset >= 0 ? "+" : ""}{s.offset.toFixed(2)}</td><td><span className={"pill " + l[1]}>{l[0]}</span></td>
              <td className="r">{isNaN(s.r) ? "" : `r = ${s.r.toFixed(2)} `}<span className={"pill " + pr[1]}>{pr[0]}</span></td>
              <td><button className="btn ghost small danger" onClick={() => setPanel(panel.filter(x => x !== s.p))}>Remove</button></td></tr>); })}</tbody>
        </table></div>
        <p className="note" style={{ marginTop: 10 }}>“Vs panel” compares each person with the others who saw the same candidates. r is the correlation between their score and the hire's later performance rating, from −1 to 1.</p>
      </Section>

      {pending.length > 0 && <Section title="Adjusted scores for open candidates">
        <p className="note" style={{ marginBottom: 10 }}>Each score is corrected for that interviewer's usual leniency or harshness.</p>
        <table className="t"><thead><tr><th>Candidate</th><th>Role</th><th className="r">Raw average</th><th className="r">Adjusted</th></tr></thead>
          <tbody>{pending.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.role}</td><td className="r">{mean(Object.values(c.scores)).toFixed(2)}</td><td className="r"><strong>{adjusted(c).toFixed(2)}</strong></td></tr>)}</tbody></table>
      </Section>}

      <Section title="Candidates">
        <div className="table-wrap"><table className="t">
          <thead><tr><th>Candidate</th><th>Role</th>{panel.map(p => <th key={p} className="r">{p}</th>)}<th>Hired</th><th>Performance after 6 months (1 to 5)</th><th /></tr></thead>
          <tbody>{cands.map(c => (
            <tr key={c.id}><td>{c.name}</td><td>{c.role}</td>
              {panel.map(p => <td key={p} className="r"><input className="input num" style={{ width: 52 }} aria-label={`${p} score`} value={c.scores[p] ?? ""} onChange={e => { const v = e.target.value; const s = { ...c.scores }; if (v === "") delete s[p]; else s[p] = Math.max(1, Math.min(5, num(v))); setCands(cands.map(x => x.id === c.id ? { ...x, scores: s } : x)); }} /></td>)}
              <td><input type="checkbox" aria-label="Hired" checked={c.hired} onChange={e => setCands(cands.map(x => x.id === c.id ? { ...x, hired: e.target.checked } : x))} /></td>
              <td>{c.hired && <select className="input" style={{ width: 90 }} aria-label="Performance" value={c.perf ?? ""} onChange={e => setCands(cands.map(x => x.id === c.id ? { ...x, perf: e.target.value ? +e.target.value : undefined } : x))}><option value="">Not yet</option>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select>}</td>
              <td><button className="btn ghost small danger" onClick={() => setCands(cands.filter(x => x.id !== c.id))}>Delete</button></td></tr>
          ))}</tbody>
        </table></div>
        <form className="row" style={{ marginTop: 12, alignItems: "flex-end" }} onSubmit={e => { e.preventDefault(); if (!d.name.trim()) return; const scores: Record<string, number> = {}; Object.entries(d.scores).forEach(([k, v]) => { if (v) scores[k] = Math.max(1, Math.min(5, num(v))); }); setCands([...cands, { id: uid(), name: d.name.trim(), role: d.role, scores, hired: false }]); setD({ name: "", role: d.role, scores: {} }); }}>
          <label className="field"><span>Candidate</span><input id="fp-n" className="input" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></label>
          <label className="field"><span>Role</span><input id="fp-r" className="input" value={d.role} onChange={e => setD({ ...d, role: e.target.value })} /></label>
          {panel.map(p => <label key={p} className="field" style={{ flex: "0 0 70px" }}><span>{p}</span><input className="input num" value={d.scores[p] ?? ""} onChange={e => setD({ ...d, scores: { ...d.scores, [p]: e.target.value } })} /></label>)}
          <button className="btn primary" type="submit">Add</button>
        </form>
        <form className="row" style={{ marginTop: 10 }} onSubmit={e => { e.preventDefault(); if (newI.trim() && !panel.includes(newI.trim())) setPanel([...panel, newI.trim()]); setNewI(""); }}>
          <input id="fp-ni" className="input" style={{ maxWidth: 220 }} aria-label="New interviewer" placeholder="Add an interviewer" value={newI} onChange={e => setNewI(e.target.value)} /><button className="btn small" type="submit">Add interviewer</button>
        </form>
      </Section>
      <Section title="Import from your hiring tool">
        <ImportBox label="CSV with candidate, interviewer, score (one row per interview)" rows={3} placeholder={"candidate,interviewer,score\nCandidate I,Sami,4"} onText={t => {
          const next = [...cands]; const newPanel = [...panel];
          csvObjects(t).forEach(r => { const name = r.candidate || r.name; const who = r.interviewer || r.rater; if (!name || !who) return; if (!newPanel.includes(who)) newPanel.push(who); let c = next.find(x => x.name === name); if (!c) { c = { id: uid(), name, role: r.role || "", scores: {}, hired: /^(y|yes|1|true)/i.test(r.hired || "") }; next.push(c); } c.scores = { ...c.scores, [who]: num(r.score) }; });
          setPanel(newPanel); setCands(next);
        }} />
      </Section>
    </div>
  );
}
