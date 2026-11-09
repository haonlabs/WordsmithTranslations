import { useCallback, useEffect, useRef, useState } from "react";
import { getEnabled, setEnabled } from "../shared/settings";
import { getStatus, prepare, type Lang, type Status } from "../shared/translator";
import { toView, type Tone } from "./view";
import { toPageView } from "./pageView";
import { getActiveTab, queryPage, startPage, stopPage } from "./page";

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

  // Page state
  const [tab, setTab] = useState<{ id?: number; url?: string } | null>(null);
  const [page, setPage] = useState<{ active: boolean; translated: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(() => Promise.all([getStatus("ko"), getStatus("ja")]).then(([ko, ja]) => setStatuses({ ko, ja })), []);

  useEffect(() => {
    getEnabled().then(setOn);
    refresh();

    // Load active tab and query page status
    getActiveTab().then((activeTab) => {
      setTab(activeTab);
      if (activeTab?.id != null) {
        queryPage(activeTab.id).then(setPage);
      }
    });
  }, [refresh]);

  // Polling queryPage every 1500 ms while tab.id is available
  useEffect(() => {
    if (tab?.id == null) return;
    const id = setInterval(() => {
      if (tab.id != null) {
        queryPage(tab.id).then(setPage);
      }
    }, 1500);
    intervalRef.current = id;
    return () => clearInterval(id);
  }, [tab?.id]);

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

  const onPageButton = async (action: "start" | "stop") => {
    if (tab?.id == null) return;
    const tabId = tab.id;
    if (action === "start") {
      setBusy(true);
      const ok = await startPage(tabId);
      if (!ok) {
        setFailed(true);
      } else {
        setFailed(false);
        const status = await queryPage(tabId);
        setPage(status);
      }
      setBusy(false);
    } else {
      setBusy(true);
      await stopPage(tabId);
      const status = await queryPage(tabId);
      setPage(status);
      setBusy(false);
    }
  };

  const v = toView(statuses, enabled, download);
  const pv = toPageView({ tab, statuses, page, busy, failed });
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
        <span>Translate live chat</span>
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

      <div className="page">
        <div className="row">
          <span>This page</span>
          <b className={`chip ${pv.chip.kind}`}>{pv.chip.text}</b>
        </div>
        <p className="hint">{pv.hint}</p>
        <button
          className={pv.button.variant}
          disabled={pv.button.disabled}
          onClick={() => pv.button.action && onPageButton(pv.button.action)}
        >
          {pv.button.label}
        </button>
      </div>

      <footer className="row">
        <span className="faint">v{version} · needs Chrome 138+</span>
        {v.check && <button onClick={refresh}>Check again</button>}
      </footer>
    </main>
  );
}
