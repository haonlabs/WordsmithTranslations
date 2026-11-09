import { useCallback, useEffect, useState } from "react";
import { getEnabled, setEnabled } from "../shared/settings";
import { getStatus, prepare, type Status } from "../shared/translator";
import { toView, type Tone } from "./view";

const GLYPH: Record<Tone, string> = { checking: "…", setup: "i", downloading: "↓", ready: "", paused: "", unavailable: "×", error: "!" };

function Icon({ tone }: { tone: Tone }) {
  return (
    <span className={`icon ${tone}`} aria-hidden="true">
      {tone === "ready" && (
        <svg width="12" height="10" viewBox="0 0 12 10" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 5l3.5 3.5L11 1.5" />
        </svg>
      )}
      {tone === "paused" && (
        <>
          <i />
          <i />
        </>
      )}
      {GLYPH[tone]}
    </span>
  );
}

export function App() {
  const [enabled, setOn] = useState(true);
  const [status, setStatus] = useState<Status | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const refresh = useCallback(() => getStatus().then(setStatus), []);
  useEffect(() => {
    getEnabled().then(setOn);
    refresh();
  }, [refresh]);

  const toggle = (v: boolean) => {
    setOn(v);
    setEnabled(v);
  };

  // Runs inside the click handler so Chrome sees user activation for the first-time model download.
  const onEnable = async () => {
    setProgress(0);
    const s = await prepare(setProgress);
    setProgress(null);
    setStatus(s);
  };

  const v = toView(status, enabled, progress);
  const version = chrome.runtime.getManifest().version;

  return (
    <main>
      <header>
        <img src="icons/icon-48.png" width="36" height="36" alt="" />
        <div>
          <h1>WordsmithTranslations</h1>
          <p className="muted">Korean → English live chat</p>
        </div>
      </header>

      <label className="row toggle">
        <span>Translate chat messages</span>
        <input type="checkbox" role="switch" checked={enabled} onChange={(e) => toggle(e.target.checked)} />
        <i className="track" aria-hidden="true" />
      </label>

      <section className={`card ${v.tone}`} aria-live="polite">
        <Icon tone={v.tone} />
        <div>
          <strong>{v.title}</strong>
          <p>{v.hint}</p>
          {v.progress !== null && (
            <div className="bar">
              <div style={{ width: `${Math.round(v.progress * 100)}%` }} />
            </div>
          )}
        </div>
      </section>

      {v.cta && (
        <button className="primary" disabled={v.cta.disabled} onClick={onEnable}>
          {v.cta.label}
        </button>
      )}

      <div className="row works">
        <span className="muted">Works on</span>
        <span className="chips">
          <b>YouTube Live</b>
          <b>CHZZK</b>
        </span>
      </div>

      <footer className="row">
        <span className="faint">v{version} · needs Chrome 138+</span>
        {v.check && <button onClick={refresh}>Check again</button>}
      </footer>
    </main>
  );
}
