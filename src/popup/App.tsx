import { useCallback, useEffect, useState } from "react";
import { getEnabled, setEnabled } from "../shared/settings";
import { getStatus, prepare, type Status } from "../shared/translator";

const LABEL: Record<Status["state"], string> = {
  unsupported: "Unsupported (Translator API not found in this Chrome)",
  unavailable: "Unavailable (ko → en not supported on this device)",
  downloadable: "Model not downloaded yet",
  downloading: "Downloading model…",
  available: "Ready",
  error: "Error",
};

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

  // Runs inside the click handler so Chrome sees user activation for the model download.
  const onPrepare = async () => {
    setProgress(0);
    setStatus(await prepare(setProgress));
    setProgress(null);
  };

  const canPrepare = status && (status.state === "downloadable" || status.state === "downloading" || status.state === "error");

  return (
    <main>
      <h1>WordsmithTranslations</h1>
      <p className="sub">Korean → English live chat</p>
      <label className="row">
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} />
        Translate chat messages
      </label>
      <p className={`status ${status?.state ?? ""}`}>
        {status ? LABEL[status.state] : "Checking…"}
        {status?.state === "error" && <small>{status.message}</small>}
        {progress !== null && <small>{Math.round(progress * 100)}%</small>}
      </p>
      <div className="row">
        {canPrepare && <button onClick={onPrepare}>Prepare translation</button>}
        <button onClick={refresh}>Check again</button>
      </div>
      <p className="sub">Chrome tracks the model per site. The first time on YouTube or CHZZK, click the “Enable translation” button that appears in the chat.</p>
    </main>
  );
}
