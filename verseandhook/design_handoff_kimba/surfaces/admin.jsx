/* global React */
/* Surface: ADMIN — list, detail, analysis */

const ADMIN_CLIENTS = [
  { id: "altona", name: "altona coffee co.", goal: "brand discovery", goalIdx: "01", expected: 12, completed: 8, last: "2h ago" },
  { id: "noorhaven", name: "noorhaven & sons", goal: "project intake", goalIdx: "02", expected: 6, completed: 6, last: "yesterday" },
  { id: "fieldcrest", name: "fieldcrest brewing", goal: "engagement feedback", goalIdx: "03", expected: 20, completed: 7, last: "3d ago" },
  { id: "kestrel", name: "kestrel financial", goal: "brand discovery", goalIdx: "01", expected: 8, completed: 2, last: "5d ago" },
  { id: "marrowbone", name: "marrowbone records", goal: "project intake", goalIdx: "02", expected: 4, completed: 4, last: "1w ago" },
  { id: "harlowe", name: "harlowe theater group", goal: "engagement feedback", goalIdx: "03", expected: 14, completed: 11, last: "1w ago" },
];

const RESPONDENTS = [
  { name: "elena marsh", role: "founder & ceo", duration: "12m 04s", date: "apr 23", point: { x: 0.72, y: 0.78 }, kind: "alignment" },
  { name: "darrin okafor", role: "head of brand", duration: "9m 41s", date: "apr 23", point: { x: 0.68, y: 0.74 }, kind: "alignment" },
  { name: "priya iyer", role: "ops director", duration: "7m 22s", date: "apr 24", point: { x: 0.34, y: 0.62 }, kind: "conflict" },
  { name: "marcus bell", role: "lead barista", duration: "11m 18s", date: "apr 24", point: { x: 0.30, y: 0.58 }, kind: "conflict" },
  { name: "sarah lin", role: "marketing manager", duration: "8m 55s", date: "apr 24", point: { x: 0.74, y: 0.42 }, kind: "alignment" },
  { name: "jacob rhee", role: "investor (board)", duration: "6m 12s", date: "apr 25", point: { x: 0.18, y: 0.22 }, kind: "outlier" },
  { name: "noor abadi", role: "wholesale lead", duration: "10m 03s", date: "apr 25", point: { x: 0.66, y: 0.36 }, kind: "alignment" },
  { name: "tomás vega", role: "creative director", duration: "13m 47s", date: "apr 25", point: { x: 0.62, y: 0.70 }, kind: "alignment" },
];

const ANALYSIS = [
  { kind: "alignment", dimension: "what altona makes", score: 88, narrative: "near-unanimous: 'small-batch coffee from single-origin farms.' the words 'honest,' 'small,' and 'midwest' show up across seven of eight transcripts, often unprompted." },
  { kind: "alignment", dimension: "the loyal customer", score: 76, narrative: "respondents consistently describe a customer who values process over outcome — interested in 'where the beans come from' more than the cup itself. shared language: 'particular,' 'patient,' 'reads the bag.'" },
  { kind: "conflict", dimension: "competitive position", score: 41, narrative: "leadership frames altona as a regional brand competing with national specialty roasters. operations and floor staff describe a hyperlocal cafe-first business. these are materially different strategies in the same conversation." },
  { kind: "conflict", dimension: "growth posture", score: 38, narrative: "tension between 'we don't pretend we're a movement' (founders) and a desire from marketing to scale subscription nationally. neither position is wrong — but the brand can't speak both at once." },
  { kind: "outlier", dimension: "definition of success", score: 28, narrative: "one respondent — a board-level voice — defines success in revenue multiples and exit terms. no other respondent uses financial language. worth investigating, not dismissing: signal of board/operator misalignment." },
];

function AdminSurface({ markVariant = "circle" }) {
  const [view, setView] = React.useState("list"); // list | detail
  const [activeClient, setActiveClient] = React.useState("altona");
  const [tab, setTab] = React.useState("analysis"); // analysis | respondents | settings

  const client = ADMIN_CLIENTS.find(c => c.id === activeClient) || ADMIN_CLIENTS[0];

  return (
    <div className="surface-admin">
      <div className="admin-topbar">
        <div className="left">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <KimbaMark variant={markVariant === "mono" ? "mono" : "circle"} size={22} />
            <Wordmark size={16} color="var(--kimba-paper)" />
            <span className="k-mono" style={{ color: "var(--kimba-mute)", marginLeft: 8 }}>/admin</span>
          </div>
          <div className="crumbs">
            <a onClick={() => setView("list")}>all clients</a>
            {view === "detail" && (
              <>
                <span className="sep">/</span>
                <span style={{ color: "var(--kimba-paper)" }}>{client.name}</span>
              </>
            )}
          </div>
        </div>
        <div className="right">
          <span>verse and hook</span>
          <span style={{ color: "var(--kimba-mute)" }}>·</span>
          <span>n. heron</span>
          <button className="k-btn" style={{ padding: "6px 12px", fontSize: 11, background: "transparent", borderColor: "var(--kimba-mute)", color: "var(--kimba-paper)" }}>sign out</button>
        </div>
      </div>

      <div className="admin-body">
        <aside className="admin-sidebar">
          <div className="section">/sessions</div>
          <div className={`admin-nav-item ${view === "list" ? "active" : ""}`} onClick={() => setView("list")}>
            <span>all clients</span><span className="count">{ADMIN_CLIENTS.length}</span>
          </div>
          <div className="admin-nav-item">
            <span>active</span><span className="count">4</span>
          </div>
          <div className="admin-nav-item">
            <span>complete</span><span className="count">2</span>
          </div>
          <div className="section">/views</div>
          <div className="admin-nav-item">
            <span>respondents</span><span className="count">53</span>
          </div>
          <div className="admin-nav-item">
            <span>analysis runs</span><span className="count">17</span>
          </div>
          <div className="section">/account</div>
          <div className="admin-nav-item"><span>team</span></div>
          <div className="admin-nav-item"><span>settings</span></div>
        </aside>

        <main className="admin-main">
          {view === "list" ? (
            <ListView onOpen={(id) => { setActiveClient(id); setView("detail"); }} />
          ) : (
            <DetailView client={client} tab={tab} setTab={setTab} markVariant={markVariant} />
          )}
        </main>
      </div>
    </div>
  );
}

function ListView({ onOpen }) {
  return (
    <div>
      <div className="admin-pageheader">
        <div>
          <div className="k-mono k-slash" style={{ marginBottom: 8 }}>active sessions</div>
          <h1>clients<span style={{ color: "var(--kimba-red)" }}>.</span></h1>
        </div>
        <div className="actions">
          <button className="k-btn k-btn-ghost">export csv</button>
          <button className="k-btn k-btn-red">+ new session</button>
        </div>
      </div>
      <table className="admin-table">
        <thead>
          <tr>
            <th>client</th>
            <th>goal</th>
            <th>completion</th>
            <th>respondents</th>
            <th>last response</th>
            <th>analysis</th>
          </tr>
        </thead>
        <tbody>
          {ADMIN_CLIENTS.map(c => {
            const pct = Math.round((c.completed / c.expected) * 100);
            const done = c.completed === c.expected;
            return (
              <tr key={c.id} onClick={() => onOpen(c.id)}>
                <td className="name">{c.name}</td>
                <td>
                  <span className="k-mono" style={{ color: "var(--kimba-mute)" }}>
                    <span style={{ color: "var(--kimba-red)" }}>/{c.goalIdx}</span> {c.goal}
                  </span>
                </td>
                <td>
                  <div className="completion-cell">
                    <div className="completion-track">
                      <div className="completion-fill" style={{ width: `${pct}%`, background: done ? "var(--kimba-ink)" : "var(--kimba-red)" }} />
                    </div>
                    <span>{c.completed}/{c.expected}</span>
                  </div>
                </td>
                <td><span className="k-mono" style={{ color: "var(--kimba-ink-2)" }}>{c.expected} expected</span></td>
                <td><span className="k-mono" style={{ color: "var(--kimba-mute)" }}>{c.last}</span></td>
                <td>
                  {c.completed >= 2
                    ? <span className="k-badge" style={{ borderColor: "var(--kimba-ink)" }}>ready</span>
                    : <span className="k-badge" style={{ borderColor: "var(--kimba-rule)", color: "var(--kimba-mute)" }}>pending</span>
                  }
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailView({ client, tab, setTab, markVariant }) {
  return (
    <div>
      <div className="admin-pageheader">
        <div>
          <div className="k-mono" style={{ marginBottom: 8 }}>
            <span style={{ color: "var(--kimba-red)" }}>/{client.goalIdx}</span>{" "}
            <span style={{ color: "var(--kimba-mute)" }}>{client.goal}</span>
          </div>
          <h1>{client.name}</h1>
        </div>
        <div className="actions">
          <button className="k-btn k-btn-ghost">copy link</button>
          <button className="k-btn k-btn-ghost">distribute</button>
          <button className="k-btn">run analysis →</button>
        </div>
      </div>

      <div className="admin-detail">
        <div className="admin-detail-main">
          {/* Stat row */}
          <div className="admin-stats">
            <div className="admin-stat">
              <div className="label">/completion</div>
              <div className="value"><span className="red">{client.completed}</span>/{client.expected}</div>
              <div className="sub">{Math.round(client.completed / client.expected * 100)}% complete</div>
            </div>
            <div className="admin-stat">
              <div className="label">/avg duration</div>
              <div className="value">9<span style={{ fontSize: 18, color: "var(--kimba-mute)" }}>m</span>52<span style={{ fontSize: 18, color: "var(--kimba-mute)" }}>s</span></div>
              <div className="sub">range 6m–14m</div>
            </div>
            <div className="admin-stat">
              <div className="label">/last analysis</div>
              <div className="value" style={{ fontSize: 22 }}>2h ago</div>
              <div className="sub">apr 25 · 14:02</div>
            </div>
            <div className="admin-stat">
              <div className="label">/alignment index</div>
              <div className="value"><span className="red">62</span></div>
              <div className="sub">moderate convergence</div>
            </div>
          </div>

          {/* Tab strip */}
          <div style={{ display: "flex", gap: 0, marginBottom: 18, borderBottom: "1px solid var(--kimba-rule)" }}>
            {[
              { id: "analysis", label: "alignment analysis" },
              { id: "respondents", label: `respondents (${RESPONDENTS.length})` },
              { id: "settings", label: "session settings" },
            ].map(t => (
              <button key={t.id}
                onClick={() => setTab(t.id)}
                className="k-mono"
                style={{
                  background: "transparent",
                  border: 0,
                  padding: "12px 18px",
                  borderBottom: tab === t.id ? "2px solid var(--kimba-red)" : "2px solid transparent",
                  color: tab === t.id ? "var(--kimba-ink)" : "var(--kimba-mute)",
                  fontWeight: tab === t.id ? 600 : 500,
                  cursor: "pointer",
                  marginBottom: -1,
                  fontSize: 11,
                }}
              >
                /{t.label}
              </button>
            ))}
          </div>

          {tab === "analysis" && <AnalysisView />}
          {tab === "respondents" && <RespondentsView />}
          {tab === "settings" && <SettingsView client={client} />}
        </div>

        <aside className="admin-detail-aside">
          <h3 className="admin-section-title">share link</h3>
          <div style={{ background: "var(--kimba-paper-2)", border: "1px solid var(--kimba-rule)", padding: "10px 12px", marginBottom: 16, fontFamily: "var(--kimba-mono)", fontSize: 11, color: "var(--kimba-ink-2)", wordBreak: "break-all" }}>
            kimba.vh/s/altona-7c2-{`{token}`}
          </div>
          <button className="k-btn k-btn-ghost" style={{ width: "100%", justifyContent: "center", marginBottom: 24 }}>copy link template</button>

          <h3 className="admin-section-title">recent activity</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["completed", "tomás vega", "13m"],
              ["completed", "noor abadi", "10m"],
              ["started", "rachel kim", "—"],
              ["completed", "jacob rhee", "6m"],
            ].map(([action, name, dur], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--kimba-ink-2)" }}>
                <span><span style={{ color: action === "completed" ? "var(--kimba-ink)" : "var(--kimba-mute)", fontFamily: "var(--kimba-mono)", fontSize: 10, textTransform: "uppercase", marginRight: 8 }}>{action}</span>{name}</span>
                <span className="k-mono">{dur}</span>
              </div>
            ))}
          </div>

          <h3 className="admin-section-title" style={{ marginTop: 28 }}>extraction prompt</h3>
          <p style={{ fontFamily: "var(--kimba-serif)", fontSize: 14, lineHeight: 1.45, color: "var(--kimba-ink-2)", margin: 0 }}>
            kimba is conducting a brand discovery interview. ask one question at a time. probe gently. never lead. do not summarize the respondent's answers back at them.
          </p>
        </aside>
      </div>
    </div>
  );
}

function AnalysisView() {
  const [hovered, setHovered] = React.useState(null);

  return (
    <div>
      {/* Quadrant */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, marginBottom: 24 }}>
        <div>
          <h3 className="admin-section-title">
            respondent quadrant
            <span className="k-mono" style={{ color: "var(--kimba-mute-2)", fontSize: 10 }}>brand clarity × audience alignment</span>
          </h3>
          <div className="quadrant">
            <span className="label tl">low clarity / aligned audience</span>
            <span className="label tr">clear brand / aligned audience</span>
            <span className="label bl">low clarity / split audience</span>
            <span className="label br">clear brand / split audience</span>
            <div className="axis-h" />
            <div className="axis-v" />
            {RESPONDENTS.map((r, i) => (
              <div
                key={i}
                className={`point ${r.kind}`}
                style={{ left: `${r.point.x * 100}%`, top: `${(1 - r.point.y) * 100}%` }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                title={`${r.name} — ${r.role}`}
              >
                {i + 1}
              </div>
            ))}
            {/* alignment cluster ring */}
            <div className="point cluster" style={{ left: "70%", top: "30%", width: 90, height: 90 }} />
            {hovered != null && (
              <div style={{ position: "absolute", left: 12, bottom: 12, background: "var(--kimba-ink)", color: "var(--kimba-paper)", padding: "8px 12px", fontSize: 11, fontFamily: "var(--kimba-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                #{hovered + 1} {RESPONDENTS[hovered].name} · {RESPONDENTS[hovered].role}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 24, marginTop: 14, fontFamily: "var(--kimba-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, background: "var(--kimba-ink)", borderRadius: "50%" }} /> alignment
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, background: "var(--kimba-red)", borderRadius: "50%" }} /> conflict
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, background: "var(--kimba-paper)", border: "1.5px solid var(--kimba-ink)", borderRadius: "50%" }} /> outlier
            </span>
          </div>
        </div>

        <div>
          <h3 className="admin-section-title">at a glance</h3>
          <p style={{ fontFamily: "var(--kimba-serif)", fontSize: 17, lineHeight: 1.45, color: "var(--kimba-ink-2)", margin: "0 0 16px" }}>
            the team agrees on what altona <em>is</em> — small, honest, midwest. they disagree on what it should <em>become</em>. one voice (board) is materially out of band on success metrics.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Pill label="strong convergence" count="3" tone="ink" />
            <Pill label="material conflict" count="2" tone="red" />
            <Pill label="outlier voices" count="1" tone="mute" />
            <Pill label="dimensions scored" count="6" tone="ink" />
          </div>
        </div>
      </div>

      {/* Cards */}
      <h3 className="admin-section-title">narrative breakdown</h3>
      {ANALYSIS.map((a, i) => (
        <div key={i} className={`analysis-card ${a.kind}`}>
          <div className="head">
            <div className="dimension">/{String(i+1).padStart(2,"0")} · {a.dimension}</div>
            <span className={`tag`}>
              {a.kind === "alignment" && "● convergence"}
              {a.kind === "conflict" && "● conflict"}
              {a.kind === "outlier" && "○ outlier"}
            </span>
          </div>
          <div className={`scoreline ${a.kind}`}>
            <div className="track"><div className="fill" style={{ width: `${a.score}%` }} /></div>
            <span className="num">{a.score}</span>
          </div>
          <p className="narrative">{a.narrative}</p>
        </div>
      ))}
    </div>
  );
}

function Pill({ label, count, tone }) {
  const c = tone === "red" ? "var(--kimba-red)" : tone === "mute" ? "var(--kimba-mute)" : "var(--kimba-ink)";
  return (
    <div style={{ border: "1px solid var(--kimba-rule)", padding: "10px 12px", background: "var(--kimba-white)" }}>
      <div className="k-mono" style={{ fontSize: 10, color: "var(--kimba-mute)" }}>/{label}</div>
      <div className="k-display" style={{ fontSize: 28, lineHeight: 1, color: c, marginTop: 4 }}>{count}</div>
    </div>
  );
}

function RespondentsView() {
  return (
    <div>
      <h3 className="admin-section-title">{RESPONDENTS.length} respondents</h3>
      {RESPONDENTS.map((r, i) => (
        <div key={i} className="respondent-row">
          <div>
            <div className="name">{r.name}</div>
            <div className="role">{r.role}</div>
          </div>
          <span className={`k-badge ${r.kind === "outlier" ? "" : r.kind === "conflict" ? "k-badge-red" : ""}`} style={{ fontSize: 10 }}>
            {r.kind}
          </span>
          <span className="duration">{r.duration}</span>
          <span className="k-mono" style={{ fontSize: 10, color: "var(--kimba-mute)" }}>{r.date}</span>
        </div>
      ))}
    </div>
  );
}

function SettingsView({ client }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div>
        <h3 className="admin-section-title">session details</h3>
        <FieldRow label="client name" value={client.name} />
        <FieldRow label="extraction goal" value={client.goal} />
        <FieldRow label="expected respondents" value={client.expected} />
        <FieldRow label="created" value="apr 18, 2026" />
        <FieldRow label="created by" value="n. heron" />
      </div>
      <div>
        <h3 className="admin-section-title">behavior</h3>
        <FieldRow label="model" value="claude haiku 4.5" />
        <FieldRow label="max exchanges" value="8" />
        <FieldRow label="closing trigger" value="auto" />
        <FieldRow label="auto-run analysis" value="on completion" />
      </div>
    </div>
  );
}

function FieldRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--kimba-rule)" }}>
      <span className="k-mono" style={{ color: "var(--kimba-mute)" }}>/{label}</span>
      <span style={{ fontFamily: "var(--kimba-body)", fontSize: 14, color: "var(--kimba-ink)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

window.AdminSurface = AdminSurface;
