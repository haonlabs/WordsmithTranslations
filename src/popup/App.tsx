import { useCallback, useEffect, useState } from "react";
import { getEnabled, setEnabled } from "../shared/settings";
import { getStatus, prepare, type Lang, type Status } from "../shared/translator";
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

const CHIP: Record<string, string> = { ready: "ready", setup: "setup", checking: "setup", downloading: "busy", unavailable: "error", error: "error" };

export function App() {
  const [enabled, setOn] = useState(true);
  const [statuses, setStatuses] = useState<Record<Lang, Status | null>>({ ko: null, ja: null });
  const [download, setDownload] = useState<{ lang: Lang; ratio: number } | null>(null);

  const refresh = useCallback(() => Promise.all([getStatus("ko"), getStatus("ja")]).then(([ko, ja]) => setStatuses({ ko, ja })), []);
  useEffect(() => {
    getEnabled().then(setOn);
    refresh();
  }, [refresh]);

  const toggle = (v: boolean) => {
    setOn(v);
    setEnabled(v);
  };

  // Runs inside the click handler so Chrome sees user activation for the first-time model download.
  const onCta = async (lang: Lang) => {
    setDownload({ lang, ratio: 0 });
    const s = await prepare(lang, (ratio) => setDownload({ lang, ratio }));
    setDownload(null);
    setStatuses((prev) => ({ ...prev, [lang]: s }));
  };

  const v = toView(statuses, enabled, download);
  const version = chrome.runtime.getManifest().version;

  return (
    <main>
      <header>
        <img src="icons/icon-48.png" width="36" height="36" alt="" />
        <div>
          <h1>WordsmithTranslations</h1>
          <p className="muted">Korean · Japanese → English live chat</p>
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
        <button className={v.cta.variant} disabled={v.cta.disabled} onClick={() => onCta(v.cta!.lang)}>
          {v.cta.label}
        </button>
      )}

      <div className="langs">
        {v.languages.map((row) => (
          <div className="row" key={row.lang}>
            <span>{row.label}</span>
            <b className={`chip ${CHIP[row.state]}`}>{row.text}</b>
          </div>
        ))}
      </div>

      <footer className="row">
        <span className="faint">v{version} · needs Chrome 138+</span>
        {v.check && <button onClick={refresh}>Check again</button>}
      </footer>
    </main>
  );
}
