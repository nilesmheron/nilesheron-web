/* global React */
/* Surface: LANDING — folded identity form, single Begin */

function LandingSurface({ goal = "brand discovery", goalIndex = "01", clientName = "altona coffee co.", markVariant = "circle", onBegin }) {
  const [name, setName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [email, setEmail] = React.useState("");
  const canBegin = name.trim() && email.trim();

  return (
    <div className="surface-landing">
      <div className="landing-inner">
        {/* Meta row — what / for whom */}
        <div className="landing-meta">
          <GoalBadge goal={goal} index={goalIndex} />
          <span className="k-mono" style={{ color: "var(--kimba-mute)" }}>
            for <span style={{ color: "var(--kimba-ink)", fontWeight: 600 }}>{clientName}</span>
          </span>
        </div>

        {/* Mark + headline */}
        <div className="landing-mark-wrap">
          <KimbaMark variant={markVariant} size={140} />
        </div>

        <div>
          <h1 className="k-display landing-headline">
            hey — i'm kimba<span style={{ color: "var(--kimba-red)" }}>.</span>
          </h1>
          <p className="landing-lede" style={{ marginTop: 18 }}>
            i'm here to ask you a few questions about <em>{clientName}</em> on behalf of the verse and hook team. it's a real conversation, not a form — about ten minutes, and there are no right answers.
          </p>
        </div>

        <hr className="k-rule-soft k-rule" />

        {/* Identity form folded in */}
        <div>
          <div className="k-mono k-slash" style={{ marginBottom: 14 }}>before we start</div>
          <div className="landing-form">
            <div className="landing-field">
              <label htmlFor="lf-name">name</label>
              <input id="lf-name" className="k-input" placeholder="first and last" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="landing-field">
              <label htmlFor="lf-title">role / title</label>
              <input id="lf-title" className="k-input" placeholder="head of marketing" value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="landing-field full">
              <label htmlFor="lf-email">email</label>
              <input id="lf-email" className="k-input" type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
        </div>

        {/* CTA row */}
        <div className="landing-cta-row">
          <p className="landing-fineprint">
            this is for attribution only. no marketing list, no follow-up email.
          </p>
          <button
            className={`k-btn ${canBegin ? "k-btn-red" : ""}`}
            disabled={!canBegin}
            style={{ opacity: canBegin ? 1 : 0.45, cursor: canBegin ? "pointer" : "not-allowed" }}
            onClick={() => canBegin && onBegin && onBegin({ name, title, email })}
          >
            begin
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7H12M12 7L8 3M12 7L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
          </button>
        </div>

        <div className="landing-attribution-row">
          <span className="k-mono">/operated by verse and hook</span>
          <span className="k-mono">/session expires in 6d</span>
        </div>
      </div>
    </div>
  );
}

window.LandingSurface = LandingSurface;
