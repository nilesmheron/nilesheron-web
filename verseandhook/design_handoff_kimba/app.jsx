/* global React, ReactDOM */
/* App shell — surface routing + tweaks integration */

const { useState, useEffect, useRef, useMemo } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "surface": "landing",
  "markVariant": "circle",
  "progressStyle": "dots",
  "chatDensity": "comfortable",
  "showMobile": true
}/*EDITMODE-END*/;

const SURFACES = [
  { id: "landing", label: "landing" },
  { id: "chat", label: "chat" },
  { id: "thanks", label: "thanks" },
  { id: "admin", label: "admin" },
  { id: "states", label: "states" },
];

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const surface = tweaks.surface;
  const isAdmin = surface === "admin" || surface === "states";

  const goNext = () => {
    if (surface === "landing") setTweak("surface", "chat");
    else if (surface === "chat") setTweak("surface", "thanks");
    else if (surface === "thanks") setTweak("surface", "landing");
  };

  const renderSurface = (mobile = false) => {
    if (surface === "landing") return <LandingSurface markVariant={tweaks.markVariant} onBegin={goNext} />;
    if (surface === "chat") return <ChatSurface markVariant={tweaks.markVariant} progressStyle={tweaks.progressStyle} density={tweaks.chatDensity} onComplete={goNext} />;
    if (surface === "thanks") return <ThanksSurface markVariant={tweaks.markVariant} />;
    if (surface === "admin") return <AdminSurface markVariant={tweaks.markVariant} />;
    if (surface === "states") return <StatesSurface />;
    return null;
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--kimba-paper-2)" }}>
      {/* Surface segmented switcher — always visible at top */}
      <div style={{
        position: "sticky", top: 0, zIndex: 30,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        background: "var(--kimba-ink)",
        color: "var(--kimba-paper)",
        borderBottom: "1px solid var(--kimba-ink)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <KimbaMark variant="mono" size={22} />
          <span className="k-mono" style={{ color: "var(--kimba-mute-2)", fontSize: 10 }}>/kimba prototype · v1 draft</span>
        </div>
        <div style={{ display: "flex", gap: 0, border: "1px solid var(--kimba-mute)" }}>
          {SURFACES.map(s => (
            <button key={s.id}
              onClick={() => setTweak("surface", s.id)}
              className="k-mono"
              style={{
                padding: "6px 14px",
                background: surface === s.id ? "var(--kimba-red)" : "transparent",
                color: surface === s.id ? "var(--kimba-paper)" : "var(--kimba-mute-2)",
                border: 0,
                fontFamily: "var(--kimba-mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >/{s.label}</button>
          ))}
        </div>
        <a href="canvas.html" className="k-mono" style={{ color: "var(--kimba-mute-2)", fontSize: 10, textDecoration: "none" }}>
          /open brand canvas →
        </a>
      </div>

      {/* Stage */}
      {isAdmin || !tweaks.showMobile ? (
        <div className="kimba-app" data-screen-label={surface} style={{ minHeight: "calc(100vh - 41px)" }}>
          {renderSurface(false)}
        </div>
      ) : (
        <DualStage left={renderSurface(false)} right={renderSurface(true)} />
      )}

      {/* Tweaks panel */}
      <TweaksPanel title="tweaks">
        <TweakSection label="surface" />
        <TweakRadio
          label="active surface"
          value={tweaks.surface}
          onChange={v => setTweak("surface", v)}
          options={["landing", "chat", "thanks", "admin", "states"]}
        />
        <TweakToggle
          label="show mobile preview"
          value={tweaks.showMobile}
          onChange={v => setTweak("showMobile", v)}
        />

        <TweakSection label="kimba mark" />
        <TweakRadio
          label="variant"
          value={tweaks.markVariant}
          onChange={v => setTweak("markVariant", v)}
          options={["photo", "circle", "mono"]}
        />

        <TweakSection label="chat" />
        <TweakRadio
          label="density"
          value={tweaks.chatDensity}
          onChange={v => setTweak("chatDensity", v)}
          options={["comfortable", "compact"]}
        />
        <TweakRadio
          label="progress style"
          value={tweaks.progressStyle}
          onChange={v => setTweak("progressStyle", v)}
          options={["dots", "bar", "fraction"]}
        />
      </TweaksPanel>
    </div>
  );
}

function DualStage({ left, right }) {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "1.55fr 0.45fr",
      gap: 28,
      padding: "28px",
      alignItems: "start",
      background: "var(--kimba-paper-2)",
      minHeight: "calc(100vh - 41px)",
    }}>
      {/* Desktop frame */}
      <div>
        <div className="k-mono" style={{ marginBottom: 10, color: "var(--kimba-mute)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span><span style={{ color: "var(--kimba-red)" }}>/</span>desktop · 1440</span>
          <span style={{ fontSize: 9 }}>kimba.vh/s/altona-7c2-{`{token}`}</span>
        </div>
        <div style={{
          background: "var(--kimba-paper)",
          border: "1px solid var(--kimba-ink)",
          minHeight: 720,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
        }}>
          {left}
        </div>
      </div>

      {/* Mobile frame */}
      <div>
        <div className="k-mono" style={{ marginBottom: 10, color: "var(--kimba-mute)" }}>
          <span style={{ color: "var(--kimba-red)" }}>/</span>mobile · 390
        </div>
        <PhoneFrame>{right}</PhoneFrame>
      </div>
    </div>
  );
}

function PhoneFrame({ children }) {
  return (
    <div style={{
      width: 390,
      height: 800,
      maxWidth: "100%",
      background: "var(--kimba-ink)",
      borderRadius: 44,
      padding: 12,
      boxShadow: "0 30px 60px -20px rgba(0,0,0,0.25)",
    }}>
      <div className="mobile-frame" style={{
        width: "100%",
        height: "100%",
        background: "var(--kimba-paper)",
        borderRadius: 32,
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* status bar */}
        <div style={{
          height: 28,
          background: "var(--kimba-paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 22px",
          fontFamily: "var(--kimba-mono)",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--kimba-ink)",
          flexShrink: 0,
        }}>
          <span>9:41</span>
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ width: 14, height: 8, border: "1px solid var(--kimba-ink)", borderRadius: 2 }}>
              <span style={{ display: "block", width: 10, height: 4, background: "var(--kimba-ink)", margin: "1px" }} />
            </span>
          </span>
        </div>
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
