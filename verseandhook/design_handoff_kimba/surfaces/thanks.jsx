/* global React */
/* Surface: THANKS — closing */

function ThanksSurface({ clientName = "altona coffee co.", markVariant = "circle" }) {
  return (
    <div className="surface-thanks">
      <div className="thanks-content">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <KimbaMark variant={markVariant} size={56} />
          <Wordmark size={22} />
        </div>

        <div>
          <div className="k-mono k-slash" style={{ marginBottom: 18 }}>conversation complete</div>
          <h1 className="k-display thanks-headline">
            thanks — that<br/>
            <span className="red">actually helped.</span>
          </h1>
          <p className="thanks-body" style={{ marginTop: 28 }}>
            the verse and hook team will read your responses as part of their work with <em>{clientName}</em>. you might recognize a phrase or two of yours later — that's the point.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 24, borderTop: "1px solid var(--kimba-rule)" }}>
          <span className="k-mono">/no further action required</span>
          <span className="k-mono" style={{ color: "var(--kimba-mute-2)" }}>session id · vh-2026-04-altona-7c2</span>
        </div>
      </div>
      <div className="thanks-image">
        <img src="assets/kimba-hero.jpg" alt="Kimba" />
      </div>
    </div>
  );
}

window.ThanksSurface = ThanksSurface;
