/* global React */
/* Surface: STATES — error, edge, loading, modal screens.
   Each subSurface is its own self-contained screen so we can route to it
   from real triggers later (token validate, fetch fail, etc.) */

const { useState: useS, useEffect: useE } = React;

/* =====================================================
   1. ADMIN LOGIN
   ===================================================== */
function AdminLogin({ onIn }) {
  const [pw, setPw] = useS("");
  const [busy, setBusy] = useS(false);
  const [err, setErr] = useS("");
  const submit = (e) => {
    e && e.preventDefault();
    if (!pw) return;
    setErr(""); setBusy(true);
    setTimeout(() => {
      if (pw === "wrong") { setBusy(false); setErr("password not recognized"); }
      else { setBusy(false); onIn && onIn(); }
    }, 900);
  };
  return (
    <div style={{ minHeight: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", background: "var(--kimba-paper-2)" }}>
      <div style={{ background: "var(--kimba-red)", position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-end", padding: 36 }}>
        <img src="assets/kimba-portrait.jpg" alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        <span className="k-mono" style={{ position: "relative", color: "var(--kimba-paper)" }}>/admin · authorized personnel only</span>
      </div>
      <form onSubmit={submit} style={{ padding: "60px 56px", display: "flex", flexDirection: "column", gap: 26, justifyContent: "center", maxWidth: 520 }}>
        <Wordmark size={26} />
        <div>
          <div className="k-mono k-slash" style={{ marginBottom: 12 }}>verse and hook · admin</div>
          <h1 className="k-display" style={{ fontSize: 56, margin: 0, lineHeight: 0.95 }}>
            sign in<span style={{ color: "var(--kimba-red)" }}>.</span>
          </h1>
        </div>
        <div>
          <label className="k-mono" style={{ display: "block", marginBottom: 4 }}>password</label>
          <input className="k-input" type="password" autoFocus value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" />
          {err && <div className="k-mono" style={{ color: "var(--kimba-red)", marginTop: 8, fontSize: 11 }}>/error · {err}</div>}
        </div>
        <button className="k-btn k-btn-red" disabled={!pw || busy} style={{ alignSelf: "flex-start", opacity: pw && !busy ? 1 : 0.5 }}>
          {busy ? "checking…" : "enter →"}
        </button>
        <span className="k-mono" style={{ color: "var(--kimba-mute-2)", marginTop: "auto" }}>/forgot? ping nile.</span>
      </form>
    </div>
  );
}

/* =====================================================
   2. INVALID / EXPIRED TOKEN
   ===================================================== */
function TokenError({ kind = "invalid" }) {
  const copy = {
    invalid: { tag: "/link not recognized", h: "this link doesn't work.", body: "the token in this URL didn't match any active session. it might be a typo, or the link might have been replaced. ping the person who sent it." },
    expired: { tag: "/session expired", h: "this link has expired.", body: "kimba sessions stay open for two weeks. this one closed on apr 11. if you still want to share thoughts, ask v&h to send a fresh link." },
    used:    { tag: "/already submitted", h: "you've already done this one.", body: "this link was used to submit a response on apr 22. each respondent gets one conversation. if you'd like to add something, reach out to v&h directly." },
  }[kind];
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", background: "var(--kimba-paper)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 36px", borderBottom: "1px solid var(--kimba-rule)" }}>
        <Wordmark size={20} />
        <span className="k-mono">/operated by verse and hook</span>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 36 }}>
        <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 24 }}>
          <KimbaMark variant="circle" size={120} />
          <span className="k-mono k-slash" style={{ color: "var(--kimba-red)" }}>{copy.tag}</span>
          <h1 className="k-display" style={{ fontSize: 64, margin: 0, lineHeight: 0.95 }}>{copy.h}</h1>
          <p className="k-serif" style={{ fontSize: 19, margin: 0, color: "var(--kimba-ink-2)", maxWidth: "52ch" }}>{copy.body}</p>
          <span className="k-mono" style={{ color: "var(--kimba-mute-2)", marginTop: 12 }}>/no further action available</span>
        </div>
      </div>
    </div>
  );
}

/* =====================================================
   3. NETWORK ERROR (mid-chat)
   ===================================================== */
function NetworkError({ onRetry }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(13,13,13,0.55)", backdropFilter: "blur(4px)", zIndex: 50, padding: 24
    }}>
      <div className="k-card" style={{ maxWidth: 420, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        <span className="k-mono k-slash" style={{ color: "var(--kimba-red)" }}>connection lost</span>
        <h2 className="k-display" style={{ fontSize: 36, margin: 0, lineHeight: 0.95 }}>kimba can't hear you<span style={{ color: "var(--kimba-red)" }}>.</span></h2>
        <p className="k-serif" style={{ fontSize: 17, color: "var(--kimba-ink-2)", margin: 0 }}>your last reply didn't go through. your previous answers are saved.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="k-btn k-btn-red" onClick={onRetry}>retry</button>
          <button className="k-btn k-btn-ghost">save & exit</button>
        </div>
      </div>
    </div>
  );
}

/* =====================================================
   4. EMPTY ADMIN
   ===================================================== */
function EmptyAdmin({ onNew }) {
  return (
    <div style={{ padding: "80px 32px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18 }}>
      <KimbaMark variant="circle" size={120} />
      <span className="k-mono k-slash">no sessions yet</span>
      <h1 className="k-display" style={{ fontSize: 54, margin: 0, lineHeight: 0.95 }}>kimba is sitting<span style={{ color: "var(--kimba-red)" }}>.</span></h1>
      <p className="k-serif" style={{ fontSize: 18, color: "var(--kimba-ink-2)", margin: 0, maxWidth: "44ch" }}>create a session to generate a tokenized link, send it to client stakeholders, and watch responses roll in.</p>
      <button className="k-btn k-btn-red" onClick={onNew} style={{ marginTop: 8 }}>+ new session</button>
    </div>
  );
}

/* =====================================================
   5. LOW-RESPONDENT ANALYSIS (locked state)
   ===================================================== */
function AnalysisLocked({ count = 1 }) {
  const need = Math.max(0, 2 - count);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 32px", textAlign: "center", border: "1px dashed var(--kimba-rule)", background: "var(--kimba-white)", gap: 14 }}>
      <span className="k-mono k-slash">analysis locked</span>
      <h2 className="k-display" style={{ fontSize: 36, margin: 0 }}>need {need} more {need === 1 ? "voice" : "voices"}<span style={{ color: "var(--kimba-red)" }}>.</span></h2>
      <p className="k-serif" style={{ fontSize: 17, color: "var(--kimba-ink-2)", margin: 0, maxWidth: "44ch" }}>
        alignment requires at least 2 completed responses. {count === 0 ? "no responses yet." : `${count} of 2 received.`} outlier detection unlocks at 5+.
      </p>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <span className="k-badge">2 · alignment</span>
        <span className="k-badge" style={{ color: "var(--kimba-mute-2)", borderColor: "var(--kimba-rule)" }}>5 · outliers</span>
      </div>
    </div>
  );
}

/* =====================================================
   6. NEW SESSION MODAL — with mode preview
   ===================================================== */
const MODE_DETAILS = {
  "01": {
    name: "brand discovery",
    coverage: "company identity · audience · competitive position · voice",
    rec: "5–20 stakeholders",
    sample: "when someone outside the company asks what you actually do, what do you tell them?",
  },
  "02": {
    name: "project intake",
    coverage: "scope · constraints · success criteria · stakeholders",
    rec: "3–8 stakeholders",
    sample: "in plain language, what does this project need to do that nothing currently does?",
  },
  "03": {
    name: "engagement feedback",
    coverage: "process · communication · deliverables · what to repeat",
    rec: "3–10 stakeholders",
    sample: "looking back at the engagement so far, what's the one thing you'd change about how we worked together?",
  },
};

function NewSessionModal({ onClose, onCreate }) {
  const [name, setName] = useS("");
  const [mode, setMode] = useS("01");
  const [count, setCount] = useS(8);
  const detail = MODE_DETAILS[mode];
  const canSave = name.trim().length > 0;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(13,13,13,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "var(--kimba-paper)", border: "1px solid var(--kimba-ink)", width: "min(900px, 100%)", maxHeight: "90vh", overflow: "auto", display: "grid", gridTemplateColumns: "1.05fr 1fr" }}>
        <div style={{ padding: "32px 32px 28px", display: "flex", flexDirection: "column", gap: 22, borderRight: "1px solid var(--kimba-rule)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="k-mono k-slash">new session</span>
            <button onClick={onClose} className="k-mono" style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--kimba-mute)" }}>close ✕</button>
          </div>
          <h2 className="k-display" style={{ fontSize: 40, margin: 0, lineHeight: 0.95 }}>configure<span style={{ color: "var(--kimba-red)" }}>.</span></h2>

          <div>
            <label className="k-mono" style={{ display: "block", marginBottom: 6 }}>client name</label>
            <input className="k-input" placeholder="e.g. altona coffee co." value={name} onChange={e => setName(e.target.value)} autoFocus />
          </div>

          <div>
            <label className="k-mono" style={{ display: "block", marginBottom: 8 }}>extraction goal</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid var(--kimba-rule)" }}>
              {Object.entries(MODE_DETAILS).map(([k, m]) => (
                <button key={k} onClick={() => setMode(k)} style={{
                  textAlign: "left", padding: "12px 14px", background: mode === k ? "var(--kimba-paper)" : "var(--kimba-white)",
                  border: 0, borderBottom: "1px solid var(--kimba-rule)", borderLeft: mode === k ? "3px solid var(--kimba-red)" : "3px solid transparent",
                  cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <span><span className="k-mono" style={{ color: "var(--kimba-red)" }}>/{k}</span> <span style={{ fontFamily: "var(--kimba-body)", fontWeight: mode === k ? 600 : 400 }}>{m.name}</span></span>
                  {mode === k && <span className="k-mono" style={{ color: "var(--kimba-red)" }}>● selected</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="k-mono" style={{ display: "block", marginBottom: 6 }}>expected respondents</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <input className="k-input" type="number" min="1" max="50" value={count} onChange={e => setCount(Number(e.target.value))} style={{ width: 80 }} />
              <span className="k-mono" style={{ color: "var(--kimba-mute)" }}>used to compute completion %</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 16 }}>
            <button className="k-btn k-btn-ghost" onClick={onClose}>cancel</button>
            <button className={canSave ? "k-btn k-btn-red" : "k-btn"} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.45, marginLeft: "auto" }} onClick={() => onCreate && onCreate({ name, mode, count })}>
              create & generate link →
            </button>
          </div>
        </div>

        {/* Right: mode preview */}
        <div style={{ padding: "32px 28px", background: "var(--kimba-paper-2)", display: "flex", flexDirection: "column", gap: 18 }}>
          <span className="k-mono k-slash">preview · what kimba will cover</span>
          <h3 className="k-display" style={{ fontSize: 28, margin: 0, letterSpacing: "-0.02em" }}>{detail.name}<span style={{ color: "var(--kimba-red)" }}>.</span></h3>

          <div>
            <div className="k-mono" style={{ marginBottom: 6 }}>/coverage</div>
            <div style={{ fontFamily: "var(--kimba-body)", fontSize: 14, color: "var(--kimba-ink-2)" }}>{detail.coverage}</div>
          </div>

          <div>
            <div className="k-mono" style={{ marginBottom: 6 }}>/recommended</div>
            <div style={{ fontFamily: "var(--kimba-body)", fontSize: 14, color: "var(--kimba-ink-2)" }}>{detail.rec}</div>
          </div>

          <div>
            <div className="k-mono" style={{ marginBottom: 8 }}>/opener</div>
            <div className="chat-msg-ai" style={{ background: "var(--kimba-white)", border: "1px solid var(--kimba-rule)", padding: 14 }}>
              <div className="chat-msg-meta kimba" style={{ marginBottom: 6 }}>
                <KimbaMark variant="circle" size={14} />
                <span className="who">kimba</span>
              </div>
              <div className="body" style={{ fontSize: 17 }}>{detail.sample}</div>
            </div>
          </div>

          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--kimba-rule)" }}>
            <span className="k-mono" style={{ color: "var(--kimba-mute-2)" }}>/link template · kimba.vh/s/{name ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 18) : "client"}-{`{token}`}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =====================================================
   7. LOADING / SUBMITTING STATES
   ===================================================== */
function BeginTransition() {
  return (
    <div style={{ minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--kimba-paper)", gap: 24 }}>
      <div style={{ position: "relative" }}>
        <KimbaMark variant="circle" size={120} />
        <div style={{ position: "absolute", inset: -12, border: "1px solid var(--kimba-ink)", borderRadius: "50%", animation: "kimba-pulse 1.6s ease-in-out infinite" }} />
      </div>
      <span className="k-mono k-slash">connecting</span>
      <div className="k-display" style={{ fontSize: 36, lineHeight: 1 }}>kimba's getting ready<span style={{ color: "var(--kimba-red)" }}>.</span></div>
      <TypingDots />
      <style>{`@keyframes kimba-pulse { 0%, 100% { transform: scale(1); opacity: 0.4; } 50% { transform: scale(1.06); opacity: 0; } }`}</style>
    </div>
  );
}

function RunAnalysisOverlay({ pct = 64 }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(13,13,13,0.55)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="k-card" style={{ width: 480, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
        <span className="k-mono k-slash">running alignment analysis</span>
        <h3 className="k-display" style={{ fontSize: 32, margin: 0 }}>reading 8 transcripts<span style={{ color: "var(--kimba-red)" }}>.</span></h3>
        <p className="k-serif" style={{ fontSize: 16, color: "var(--kimba-ink-2)", margin: 0 }}>identifying convergence, conflict, and outlier perspectives across dimensions.</p>
        <div className="kimba-progress-bar"><div className="track"><div className="fill" style={{ width: `${pct}%` }} /></div></div>
        <div className="k-mono" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>{pct}% · ~12s remaining</span>
          <span style={{ color: "var(--kimba-mute-2)" }}>cancel</span>
        </div>
      </div>
    </div>
  );
}

/* =====================================================
   STATES SURFACE — gallery view to navigate
   ===================================================== */
function StatesSurface() {
  const [pick, setPick] = useS("login");
  const [modal, setModal] = useS(false);
  const [analysisOverlay, setAnalysisOverlay] = useS(false);

  const ITEMS = [
    { id: "login", label: "admin login" },
    { id: "begin", label: "begin transition (loading)" },
    { id: "invalid", label: "invalid token" },
    { id: "expired", label: "expired session" },
    { id: "used", label: "already submitted" },
    { id: "network", label: "network error (in-chat)" },
    { id: "empty", label: "empty admin (no clients)" },
    { id: "locked", label: "analysis locked (low respondents)" },
    { id: "modal", label: "new session modal" },
    { id: "running", label: "running analysis (overlay)" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", height: "100%", minHeight: "100%", background: "var(--kimba-paper-2)" }}>
      <aside style={{ borderRight: "1px solid var(--kimba-rule)", padding: "24px 0", display: "flex", flexDirection: "column", gap: 2, background: "var(--kimba-paper-2)" }}>
        <div className="k-mono k-slash" style={{ padding: "0 24px 12px" }}>edge & loading states</div>
        {ITEMS.map(it => (
          <button key={it.id} onClick={() => {
            if (it.id === "modal") { setModal(true); setPick("login"); }
            else if (it.id === "running") { setAnalysisOverlay(true); setPick("login"); }
            else setPick(it.id);
          }}
            className="admin-nav-item"
            style={{
              border: 0, background: pick === it.id ? "var(--kimba-rule-soft)" : "transparent",
              borderLeft: pick === it.id ? "2px solid var(--kimba-red)" : "2px solid transparent",
              fontWeight: pick === it.id ? 600 : 400, textAlign: "left", cursor: "pointer"
            }}>
            {it.label}
          </button>
        ))}
      </aside>
      <div style={{ position: "relative", overflow: "auto" }}>
        {pick === "login" && <AdminLogin />}
        {pick === "begin" && <BeginTransition />}
        {pick === "invalid" && <TokenError kind="invalid" />}
        {pick === "expired" && <TokenError kind="expired" />}
        {pick === "used" && <TokenError kind="used" />}
        {pick === "network" && (
          <div style={{ position: "relative", height: "100%", minHeight: 600 }}>
            <ChatSurface markVariant="circle" progressStyle="dots" density="comfortable" />
            <NetworkError onRetry={() => {}} />
          </div>
        )}
        {pick === "empty" && <EmptyAdmin onNew={() => setModal(true)} />}
        {pick === "locked" && (
          <div style={{ padding: 32 }}>
            <h3 className="admin-section-title">alignment analysis</h3>
            <AnalysisLocked count={1} />
          </div>
        )}
        {modal && <NewSessionModal onClose={() => setModal(false)} onCreate={() => setModal(false)} />}
        {analysisOverlay && <RunAnalysisOverlay />}
        {analysisOverlay && (
          <div style={{ position: "absolute", top: 16, right: 16, zIndex: 70 }}>
            <button className="k-btn k-btn-ghost" onClick={() => setAnalysisOverlay(false)}>dismiss overlay</button>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, {
  AdminLogin, TokenError, NetworkError, EmptyAdmin, AnalysisLocked,
  NewSessionModal, BeginTransition, RunAnalysisOverlay, StatesSurface,
});
