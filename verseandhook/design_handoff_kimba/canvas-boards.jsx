/* global React */
/* canvas-boards.jsx — boards rendered inside DCArtboards on canvas.html */

function BoardTokens() {
  return (
    <div className="ab-frame" style={{ padding: 36, display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 className="k-display" style={{ fontSize: 56, margin: 0, letterSpacing: "-0.03em" }}>
          tokens<span style={{ color: "var(--kimba-red)" }}>.</span>
        </h2>
        <span className="k-mono">/v1 draft · apr 2026</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Color */}
        <div>
          <h3 className="admin-section-title">color</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, border: "1px solid var(--kimba-ink)" }}>
            <Swatch color="#D9181E" name="red"      hex="#D9181E" inverse />
            <Swatch color="#0D0D0D" name="ink"      hex="#0D0D0D" inverse />
            <Swatch color="#F6F2EC" name="paper"    hex="#F6F2EC" />
            <Swatch color="#A6121A" name="red-deep" hex="#A6121A" inverse />
            <Swatch color="#2E2E2E" name="ink-3"    hex="#2E2E2E" inverse />
            <Swatch color="#FFFFFF" name="white"    hex="#FFFFFF" />
          </div>

          <h3 className="admin-section-title" style={{ marginTop: 18 }}>scale ·  rules</h3>
          <div style={{ display: "flex", gap: 8 }}>
            {["hairline 1px", "rule 2px", "card 1px"].map((t,i) => (
              <div key={i} style={{ flex: 1, border: "1px solid var(--kimba-rule)", padding: "12px 14px", background: "var(--kimba-white)" }}>
                <div className="k-mono" style={{ fontSize: 10, color: "var(--kimba-mute)" }}>/{t.split(" ")[0]}</div>
                <div style={{ height: 1, background: "var(--kimba-ink)", marginTop: 12, transform: i===1 ? "scaleY(2)" : "none" }} />
              </div>
            ))}
          </div>
        </div>

        {/* Type */}
        <div>
          <h3 className="admin-section-title">typography</h3>
          <div style={{ border: "1px solid var(--kimba-rule)", padding: 18, background: "var(--kimba-white)" }}>
            <div className="k-mono" style={{ fontSize: 10, color: "var(--kimba-mute)", marginBottom: 8 }}>/display · archivo 800, condensed, lowercase</div>
            <div className="k-display" style={{ fontSize: 64, lineHeight: 0.92 }}>kimba<span style={{ color: "var(--kimba-red)" }}>.</span></div>
            <div className="k-mono" style={{ fontSize: 10, color: "var(--kimba-mute)", marginTop: 18, marginBottom: 6 }}>/serif · fraunces, regular</div>
            <div className="k-serif" style={{ fontSize: 22 }}>i'm here to ask a few questions.</div>
            <div className="k-mono" style={{ fontSize: 10, color: "var(--kimba-mute)", marginTop: 18, marginBottom: 6 }}>/body · archivo 400</div>
            <div style={{ fontSize: 15 }}>this is for attribution only — no marketing list.</div>
            <div className="k-mono" style={{ fontSize: 10, color: "var(--kimba-mute)", marginTop: 18, marginBottom: 6 }}>/mono · jetbrains mono 500</div>
            <div className="k-mono" style={{ color: "var(--kimba-ink)" }}>/01 brand discovery · session expires 6d</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <div className="k-card" style={{ padding: 16 }}>
          <div className="k-mono" style={{ marginBottom: 10 }}>/buttons</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
            <button className="k-btn">begin →</button>
            <button className="k-btn k-btn-red">begin →</button>
            <button className="k-btn k-btn-ghost">copy link</button>
          </div>
        </div>
        <div className="k-card" style={{ padding: 16 }}>
          <div className="k-mono" style={{ marginBottom: 10 }}>/badges</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            <span className="k-badge">/01 brand discovery</span>
            <span className="k-badge k-badge-red">conflict</span>
            <span className="k-badge k-badge-solid">complete</span>
          </div>
        </div>
        <div className="k-card" style={{ padding: 16 }}>
          <div className="k-mono" style={{ marginBottom: 10 }}>/inputs</div>
          <input className="k-input" placeholder="your name" />
          <div style={{ height: 12 }} />
          <input className="k-input" placeholder="email" />
        </div>
      </div>
    </div>
  );
}

function Swatch({ color, name, hex, inverse }) {
  return (
    <div style={{ background: color, color: inverse ? "var(--kimba-paper)" : "var(--kimba-ink)", padding: 18, aspectRatio: "1.6/1", display: "flex", flexDirection: "column", justifyContent: "space-between", borderRight: "1px solid rgba(0,0,0,0.05)" }}>
      <span className="k-mono" style={{ color: "inherit", opacity: 0.85 }}>/{name}</span>
      <span className="k-mono" style={{ color: "inherit", fontWeight: 600 }}>{hex}</span>
    </div>
  );
}

/* =============================================================
   BOARD: Kimba mark variants
============================================================= */
function BoardMarks() {
  return (
    <div className="ab-frame" style={{ padding: 36, display: "flex", flexDirection: "column", gap: 28 }}>
      <div>
        <div className="k-mono k-slash">kimba marks</div>
        <h2 className="k-display" style={{ fontSize: 48, margin: "8px 0 0", letterSpacing: "-0.03em" }}>
          three placeholders<span style={{ color: "var(--kimba-red)" }}>.</span>
        </h2>
        <p className="k-serif" style={{ marginTop: 10, fontSize: 18, color: "var(--kimba-ink-2)", maxWidth: "60ch" }}>
          the dog is the warmth anchor. until the editorial illustration is ready, here are three working treatments. the photo crop carries the most personality; the circle reads more product-like; the mono mark is the typographic fallback for tight spaces.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {[
          { v: "photo", t: "photo · square crop", note: "for hero, full-bleed slots, splash" },
          { v: "circle", t: "circle · masked on red", note: "for app chrome, avatars, chat header" },
          { v: "mono", t: "mono · k. wordmark", note: "for favicons, dense lockups, footer" },
        ].map(m => (
          <div key={m.v} className="k-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
            <KimbaMark variant={m.v} size={140} />
            <div>
              <div className="k-mono" style={{ marginBottom: 4 }}>/{m.v}</div>
              <div className="k-display" style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{m.t}</div>
              <div className="k-serif" style={{ fontSize: 15, color: "var(--kimba-ink-2)", marginTop: 6 }}>{m.note}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 24, alignItems: "center", paddingTop: 18, borderTop: "1px solid var(--kimba-rule)" }}>
        <span className="k-mono">/wordmark · in use</span>
        <Wordmark size={28} />
        <Wordmark size={20} />
        <Wordmark size={14} />
        <span className="k-mono" style={{ color: "var(--kimba-mute-2)", marginLeft: "auto" }}>↳ pairs with the mark, never replaces it</span>
      </div>
    </div>
  );
}

/* =============================================================
   BOARD: System in use
============================================================= */
function BoardSystem() {
  return (
    <div className="ab-frame" style={{ padding: 36, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div className="k-mono k-slash">brand voice</div>
          <h2 className="k-display" style={{ fontSize: 48, margin: "8px 0 0", letterSpacing: "-0.03em" }}>
            warm. direct.<br/><span style={{ color: "var(--kimba-red)" }}>not a chatbot.</span>
          </h2>
        </div>
        <p className="k-serif" style={{ fontSize: 19, color: "var(--kimba-ink-2)", margin: 0 }}>
          kimba talks like a person who's actually paying attention. lowercase as default. one question at a time. no filler, no hedging, no "great question!"
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Voice good="when someone outside the company asks what altona does, what do you tell them?" bad="please describe altona coffee co. in your own words." />
          <Voice good="say more — honest about what, exactly?" bad="that's interesting! could you elaborate on what you mean by 'honest'?" />
          <Voice good="thanks. that actually helped." bad="thank you for completing this survey." />
        </div>
      </div>

      {/* Right: poster-style lockup using kimba photo */}
      <div style={{ background: "var(--kimba-red)", color: "var(--kimba-paper)", display: "grid", gridTemplateRows: "auto 1fr auto", padding: 28, gap: 18, position: "relative", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 2 }}>
          <Wordmark size={22} color="var(--kimba-paper)" />
          <span className="k-mono" style={{ color: "var(--kimba-paper)" }}>/poster · 02</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", position: "relative", zIndex: 1, minHeight: 260 }}>
          <img src="assets/kimba-hero.jpg" alt="" style={{ maxHeight: 380, width: "auto", maxWidth: "100%", objectFit: "contain", display: "block" }} />
        </div>
        <div className="k-display" style={{ fontSize: 64, color: "var(--kimba-paper)", letterSpacing: "-0.03em", lineHeight: 0.9, zIndex: 2 }}>
          good dog.<br/>
          <span style={{ color: "var(--kimba-ink)" }}>better intake.</span>
        </div>
      </div>
    </div>
  );
}

function Voice({ good, bad }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12, alignItems: "start" }}>
      <span className="k-mono" style={{ color: "var(--kimba-ink)", marginTop: 4 }}>/yes</span>
      <div className="k-serif" style={{ fontSize: 17, color: "var(--kimba-ink)" }}>"{good}"</div>
      <span className="k-mono" style={{ color: "var(--kimba-mute-2)", marginTop: 4, textDecoration: "line-through" }}>/no</span>
      <div style={{ fontSize: 14, color: "var(--kimba-mute-2)", textDecoration: "line-through", textDecorationColor: "var(--kimba-mute-2)" }}>{bad}</div>
    </div>
  );
}

/* =============================================================
   BOARDS: Landing variants
============================================================= */
function LandingA() {
  return (
    <div className="ab-frame" style={{ padding: "48px 60px", display: "flex", flexDirection: "column", gap: 28 }}>
      <ChromeBar />
      <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "left", display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <GoalBadge goal="brand discovery" index="01" />
          <span className="k-mono">for <b style={{ color: "var(--kimba-ink)" }}>altona coffee co.</b></span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
          <KimbaMark variant="circle" size={140} />
        </div>
        <div>
          <h1 className="k-display" style={{ fontSize: 64, margin: 0, lineHeight: 0.95 }}>hey — i'm kimba<span style={{ color: "var(--kimba-red)" }}>.</span></h1>
          <p className="k-serif" style={{ fontSize: 19, marginTop: 14 }}>i'm here to ask a few questions about altona on behalf of verse and hook. real conversation, ten minutes, no right answers.</p>
        </div>
        <button className="k-btn k-btn-red" style={{ alignSelf: "flex-start" }}>begin →</button>
      </div>
    </div>
  );
}

function LandingB() {
  return (
    <div className="ab-frame" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100%" }}>
      <div style={{ background: "var(--kimba-red)", position: "relative", overflow: "hidden" }}>
        <img src="assets/kimba-portrait.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <span className="k-mono" style={{ position: "absolute", left: 22, bottom: 22, color: "var(--kimba-paper)" }}>/kimba · the dog. the product.</span>
      </div>
      <div style={{ padding: "60px 48px", display: "flex", flexDirection: "column", gap: 22 }}>
        <Wordmark size={22} />
        <GoalBadge goal="brand discovery · altona coffee co." index="01" />
        <h1 className="k-display" style={{ fontSize: 64, margin: 0, lineHeight: 0.95, letterSpacing: "-0.03em" }}>
          ten minutes,<br/>
          <span style={{ color: "var(--kimba-red)" }}>real conversation.</span>
        </h1>
        <p className="k-serif" style={{ fontSize: 18, margin: 0, color: "var(--kimba-ink-2)" }}>i'll ask a few questions about altona — no right answers, just how you actually see things. verse and hook will read your responses.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          <input className="k-input" placeholder="name" />
          <input className="k-input" placeholder="email" />
        </div>
        <button className="k-btn k-btn-red" style={{ alignSelf: "flex-start", marginTop: 8 }}>begin →</button>
        <span className="k-mono" style={{ color: "var(--kimba-mute-2)", marginTop: "auto" }}>/operated by verse and hook</span>
      </div>
    </div>
  );
}

function LandingC() {
  return (
    <div className="ab-frame red" style={{ padding: 0, display: "flex", flexDirection: "column", height: "100%", color: "var(--kimba-paper)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "22px 36px", borderBottom: "1px solid rgba(255,255,255,0.18)" }}>
        <Wordmark size={22} color="var(--kimba-paper)" />
        <span className="k-mono" style={{ color: "rgba(255,255,255,0.7)" }}>/verse and hook · session vh-altona-7c2</span>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, alignItems: "stretch" }}>
        <div style={{ padding: "60px 48px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 32 }}>
          <span className="k-mono" style={{ color: "var(--kimba-paper)" }}><span style={{ color: "var(--kimba-ink)" }}>/01</span> brand discovery</span>
          <h1 className="k-display" style={{ fontSize: 88, margin: 0, lineHeight: 0.9, color: "var(--kimba-paper)", letterSpacing: "-0.04em" }}>
            hey<span style={{ color: "var(--kimba-ink)" }}>.</span><br/>
            i'm kimba.
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p className="k-serif" style={{ fontSize: 20, color: "var(--kimba-paper)", margin: 0, opacity: 0.92 }}>
              ten minutes, real conversation, no right answers. ready when you are.
            </p>
            <button className="k-btn" style={{ alignSelf: "flex-start", background: "var(--kimba-ink)", borderColor: "var(--kimba-ink)" }}>begin →</button>
          </div>
        </div>
        <div style={{ position: "relative", overflow: "hidden", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <img src="assets/kimba-hero.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 30%" }} />
        </div>
      </div>
    </div>
  );
}

/* =============================================================
   BOARDS: Thanks variants
============================================================= */
function ThanksA() {
  return (
    <div className="ab-frame" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100%" }}>
      <div style={{ padding: "60px 48px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <Wordmark size={22} />
        <div>
          <span className="k-mono k-slash">conversation complete</span>
          <h1 className="k-display" style={{ fontSize: 76, lineHeight: 0.9, margin: "16px 0 0", letterSpacing: "-0.04em" }}>
            thanks — that<br/>
            <span style={{ color: "var(--kimba-red)" }}>actually helped.</span>
          </h1>
          <p className="k-serif" style={{ fontSize: 18, marginTop: 18, color: "var(--kimba-ink-2)", maxWidth: "40ch" }}>
            v&h will read your responses as part of their work with altona. you might recognize a phrase or two of yours later — that's the point.
          </p>
        </div>
        <span className="k-mono" style={{ color: "var(--kimba-mute-2)" }}>/no further action required</span>
      </div>
      <div style={{ background: "var(--kimba-red)", overflow: "hidden" }}>
        <img src="assets/kimba-hero.jpg" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    </div>
  );
}

function ThanksB() {
  return (
    <div className="ab-frame red" style={{ padding: 0, height: "100%", position: "relative", color: "var(--kimba-paper)" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 0 }}>
        <img src="assets/kimba-portrait.jpg" alt="" style={{ height: "92%", width: "auto", objectFit: "contain", opacity: 0.55 }} />
      </div>
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "44px 56px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Wordmark size={22} color="var(--kimba-paper)" />
          <span className="k-mono" style={{ color: "var(--kimba-paper)" }}>/conversation complete</span>
        </div>
        <h1 className="k-display" style={{ fontSize: 96, margin: 0, lineHeight: 0.88, letterSpacing: "-0.04em", color: "var(--kimba-paper)", textAlign: "center" }}>
          good talk<span style={{ color: "var(--kimba-ink)" }}>.</span>
        </h1>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <p className="k-serif" style={{ fontSize: 18, margin: 0, maxWidth: "32ch", color: "var(--kimba-paper)" }}>
            v&h will read your responses as part of their work with altona.
          </p>
          <span className="k-mono" style={{ color: "var(--kimba-paper)" }}>/session vh-altona-7c2 · closed</span>
        </div>
      </div>
    </div>
  );
}

/* =============================================================
   BOARD: Chat density study
============================================================= */
function ChatStudy({ density = "comfortable", progress = "dots" }) {
  return (
    <div className={`ab-frame density-${density}`} style={{ padding: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="chat-header">
        <div className="chat-header-left">
          <KimbaMark variant="circle" size={36} />
          <div className="chat-header-name">
            <Wordmark size={18} />
            <span className="k-mono" style={{ fontSize: 10 }}>
              <span style={{ color: "var(--kimba-red)" }}>/01</span> brand discovery · altona
            </span>
          </div>
        </div>
        <Progress style={progress} value={3} total={8} />
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div className="chat-thread" style={{ paddingBottom: 100 }}>
          <div className="chat-msg chat-msg-ai">
            <div className="chat-msg-meta kimba">
              <KimbaMark variant="circle" size={16} />
              <span className="who">kimba</span>
            </div>
            <div className="body">okay — let's start somewhere broad. when someone outside the company asks what altona actually does, what do you tell them?</div>
          </div>
          <div className="chat-msg chat-msg-user">
            <div className="body">we roast small-batch coffee from single-origin farms and sell it through our cafes plus subscription. but really we're trying to build the most honest coffee company in the midwest.</div>
          </div>
          <div className="chat-msg chat-msg-ai">
            <div className="chat-msg-meta kimba">
              <KimbaMark variant="circle" size={16} />
              <span className="who">kimba</span>
            </div>
            <div className="body">"honest" is interesting word for coffee. say more — honest about what, exactly?</div>
          </div>
        </div>
      </div>
      <div style={{ position: "relative", padding: "16px 20px 18px", borderTop: "1px solid var(--kimba-rule)" }}>
        <div style={{ display: "flex", border: "1px solid var(--kimba-ink)", padding: "10px 14px", background: "var(--kimba-white)", alignItems: "center", gap: 12 }}>
          <span style={{ flex: 1, color: "var(--kimba-mute-2)" }}>type your reply…</span>
          <span style={{ width: 32, height: 32, background: "var(--kimba-ink)", color: "var(--kimba-paper)", display: "flex", alignItems: "center", justifyContent: "center" }}>→</span>
        </div>
      </div>
    </div>
  );
}

function ChromeBar() {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 14, borderBottom: "1px solid var(--kimba-rule)" }}>
      <Wordmark size={20} />
      <span className="k-mono">/operated by verse and hook</span>
    </div>
  );
}

Object.assign(window, {
  BoardTokens, BoardMarks, BoardSystem,
  LandingA, LandingB, LandingC,
  ThanksA, ThanksB,
  ChatStudy,
});
