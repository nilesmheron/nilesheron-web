/* global React */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

/* =====================================================
   KIMBA MARKS — 3 placeholder treatments for the dog
   variant: "photo" | "circle" | "mono"
   - photo:  the actual portrait, framed
   - circle: photo masked to a circle on red
   - mono:  abstract typographic mark (no photo)
   ===================================================== */

function KimbaMark({ variant = "photo", size = 96, tone = "auto" }) {
  // tone: auto | dark | light  — auto picks based on parent surface
  const dim = typeof size === "number" ? `${size}px` : size;
  if (variant === "mono") {
    return (
      <div
        className="kimba-mark kimba-mark-mono"
        style={{ width: dim, height: dim }}
        role="img"
        aria-label="Kimba"
      >
        <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
          <rect x="0" y="0" width="100" height="100" fill="var(--kimba-ink)" />
          <text
            x="50" y="58"
            textAnchor="middle"
            fontFamily="var(--kimba-display)"
            fontWeight="900"
            fontSize="44"
            fill="var(--kimba-paper)"
            letterSpacing="-2"
            style={{ textTransform: "lowercase" }}
          >k.</text>
          <circle cx="76" cy="24" r="4" fill="var(--kimba-red)" />
        </svg>
      </div>
    );
  }
  if (variant === "circle") {
    return (
      <div
        className="kimba-mark kimba-mark-circle"
        style={{ width: dim, height: dim }}
        role="img"
        aria-label="Kimba"
      >
        <div className="kimba-mark-circle-inner">
          <img src="assets/kimba-portrait.jpg" alt="" />
        </div>
      </div>
    );
  }
  // default: photo (rounded rect, kept tight)
  return (
    <div
      className="kimba-mark kimba-mark-photo"
      style={{ width: dim, height: dim }}
      role="img"
      aria-label="Kimba"
    >
      <img src="assets/kimba-portrait.jpg" alt="" />
    </div>
  );
}

/* =====================================================
   KIMBA WORDMARK — "kimba" set in the display face
   With a red period like V&H's heading rhythm
   ===================================================== */
function Wordmark({ size = 22, color = "var(--kimba-ink)" }) {
  return (
    <span
      className="k-display"
      style={{
        fontSize: size,
        color,
        letterSpacing: "-0.04em",
        fontWeight: 900,
        display: "inline-flex",
        alignItems: "baseline",
        gap: 0,
      }}
    >
      kimba<span style={{ color: "var(--kimba-red)" }}>.</span>
    </span>
  );
}

/* =====================================================
   GOAL BADGE — "/01 BRAND DISCOVERY"
   ===================================================== */
function GoalBadge({ goal, index = "01", inverse = false }) {
  return (
    <span
      className="k-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        color: inverse ? "var(--kimba-paper)" : "var(--kimba-ink)",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <span style={{ color: "var(--kimba-red)" }}>/{index}</span>
      <span style={{ width: 18, height: 1, background: inverse ? "var(--kimba-paper)" : "var(--kimba-ink)" }} />
      <span>{goal}</span>
    </span>
  );
}

/* =====================================================
   PROGRESS — three styles
   style: "bar" | "dots" | "fraction"
   ===================================================== */
function Progress({ style = "dots", value = 0, total = 8, label }) {
  const pct = Math.min(100, Math.max(0, (value / total) * 100));
  if (style === "bar") {
    return (
      <div className="kimba-progress kimba-progress-bar">
        <div className="k-mono" style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <span>{label || "exchange"}</span>
          <span>{value}/{total}</span>
        </div>
        <div className="track"><div className="fill" style={{ width: `${pct}%` }} /></div>
      </div>
    );
  }
  if (style === "fraction") {
    return (
      <div className="kimba-progress kimba-progress-fraction">
        <span className="k-mono" style={{ color: "var(--kimba-mute)" }}>{label || "exchange"}</span>
        <span className="k-display" style={{ fontSize: 22, lineHeight: 1, color: "var(--kimba-ink)" }}>
          {String(value).padStart(2,"0")}<span style={{ color: "var(--kimba-mute-2)" }}>/{String(total).padStart(2,"0")}</span>
        </span>
      </div>
    );
  }
  // dots (default)
  return (
    <div className="kimba-progress kimba-progress-dots" aria-label={`progress ${value} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`dot ${i < value ? "filled" : ""} ${i === value ? "current" : ""}`} />
      ))}
    </div>
  );
}

/* =====================================================
   TYPING INDICATOR — three soft dots, paced
   ===================================================== */
function TypingDots() {
  return (
    <div className="kimba-typing" aria-label="Kimba is typing">
      <span></span><span></span><span></span>
    </div>
  );
}

/* =====================================================
   PLACEHOLDER frame — for missing imagery
   ===================================================== */
function Placeholder({ label = "image", w = "100%", h = 240, dark = false }) {
  return (
    <div
      className="kimba-placeholder"
      style={{
        width: w,
        height: h,
        background: dark ? "var(--kimba-ink)" : "var(--kimba-paper-2)",
        color: dark ? "var(--kimba-paper)" : "var(--kimba-mute)",
        border: `1px solid ${dark ? "var(--kimba-ink)" : "var(--kimba-rule)"}`,
        backgroundImage: `repeating-linear-gradient(135deg, transparent 0 8px, ${dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)"} 8px 9px)`,
      }}
    >
      <span className="k-mono" style={{ color: "inherit" }}>/{label}</span>
    </div>
  );
}

Object.assign(window, { KimbaMark, Wordmark, GoalBadge, Progress, TypingDots, Placeholder });
