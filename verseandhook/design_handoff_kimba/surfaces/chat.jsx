/* global React */
/* Surface: CHAT — the heart of kimba */

const KIMBA_SCRIPT = [
  {
    role: "ai",
    text: "okay — let's start somewhere broad. when someone outside the company asks what altona coffee co. actually does, what do you tell them?"
  },
  {
    role: "user",
    text: "we roast small-batch coffee from single-origin farms and we sell it through our own three cafes plus subscription. but really we're trying to build the most honest coffee company in the midwest."
  },
  {
    role: "ai",
    text: "honest is interesting word for coffee. say more — honest about what, exactly?"
  },
  {
    role: "user",
    text: "honest about pricing, about where the beans come from, about the fact that being a small roaster is hard. we don't pretend we're a movement."
  },
  {
    role: "ai",
    text: "got it. so when you imagine the person who's most loyal to altona — the one who tells their friends about you — what do you think they'd say it's really about for them?"
  },
];

function ChatSurface({
  goal = "brand discovery",
  goalIndex = "01",
  clientName = "altona coffee co.",
  markVariant = "circle",
  density = "comfortable",       // comfortable | compact
  progressStyle = "dots",         // dots | bar | fraction
  onComplete,
}) {
  const [messages, setMessages] = React.useState(() => KIMBA_SCRIPT.slice(0, 3));
  const [input, setInput] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const stageRef = React.useRef(null);

  const total = 8;
  const exchanges = Math.ceil(messages.filter(m => m.role === "user").length);

  React.useEffect(() => {
    if (stageRef.current) {
      stageRef.current.scrollTo({ top: stageRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, typing]);

  function send(text) {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { role: "user", text }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      // Pull next AI line from script if available, otherwise wrap up
      const nextIdx = messages.length + 1;
      const next = KIMBA_SCRIPT[nextIdx];
      if (next && next.role === "ai") {
        setMessages(prev => [...prev, next]);
      } else {
        setMessages(prev => [...prev, {
          role: "ai",
          text: "this has been really useful. one last thing — anything you wish i'd asked but didn't?"
        }]);
        setClosing(true);
      }
    }, 1400);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className={`surface-chat density-${density}`}>
      <div className="chat-header">
        <div className="chat-header-left">
          <KimbaMark variant={markVariant} size={36} />
          <div className="chat-header-name">
            <Wordmark size={18} />
            <span className="k-mono" style={{ fontSize: 10 }}>
              <span style={{ color: "var(--kimba-red)" }}>/{goalIndex}</span> {goal} · {clientName}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Progress style={progressStyle} value={exchanges} total={total} label="exchange" />
        </div>
      </div>

      <div className="chat-stage" ref={stageRef}>
        <div className="chat-thread">
          {messages.map((m, i) => {
            if (m.role === "ai") {
              return (
                <div key={i} className="chat-msg chat-msg-ai">
                  <div className="chat-msg-meta kimba">
                    <KimbaMark variant={markVariant} size={16} />
                    <span className="who">kimba</span>
                  </div>
                  <div className="body">{m.text}</div>
                </div>
              );
            }
            return (
              <div key={i} className="chat-msg chat-msg-user">
                <div className="body">{m.text}</div>
              </div>
            );
          })}
          {typing && (
            <div className="chat-msg chat-msg-ai">
              <div className="chat-msg-meta kimba">
                <KimbaMark variant={markVariant} size={16} />
                <span className="who">kimba</span>
              </div>
              <TypingDots />
            </div>
          )}
          {closing && (
            <button className="chat-skip" onClick={() => onComplete && onComplete()}>
              nothing more to add — wrap up →
            </button>
          )}
        </div>
      </div>

      <div className="chat-composer-wrap">
        <div className="chat-composer">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="type your reply…"
            rows={1}
          />
          <button className="send" disabled={!input.trim()} onClick={() => send(input)}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8H14M14 8L9 3M14 8L9 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

window.ChatSurface = ChatSurface;
