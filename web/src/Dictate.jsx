// A microphone button: hold a short recording, turn it into 16 kHz mono WAV in the browser, send it to the Worker's
// /api/transcribe (Muse Voice Transcribe), and hand the text back. Used by the goal field ("say what the model
// should do") and the demo chat's composer. Hidden where there's no microphone API; errors show beside the button.
import { useEffect, useRef, useState } from "react";

const RATE = 16000;        // what Muse Voice Transcribe takes: mono, 16-bit PCM, 16 kHz
const MAX_SECONDS = 60;    // a goal or a chat message, not a meeting

// Float32 samples at `from` Hz to 16-bit PCM at 16 kHz, in a RIFF/WAVE container
function wav(chunks, from) {
  const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  chunks.reduce((at, c) => (all.set(c, at), at + c.length), 0);
  const ratio = from / RATE, n = Math.floor(all.length / ratio);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {  // average the source samples each output sample covers: a cheap low-pass
    const start = Math.floor(i * ratio), end = Math.min(all.length, Math.floor((i + 1) * ratio) || start + 1);
    let sum = 0;
    for (let j = start; j < end; j++) sum += all[j];
    const s = Math.max(-1, Math.min(1, sum / (end - start)));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const text = (at, s) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); text(8, "WAVE");
  text(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, "data"); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}

export const canDictate = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia
  && !!(window.AudioContext || window.webkitAudioContext);

export default function Dictate({ onText, label = "Say it instead", disabled = false }) {
  const [state, setState] = useState("idle");   // idle | recording | sending
  const [error, setError] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef(null);                       // {stream, ctx, node, chunks, timer}

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(node);
      node.connect(ctx.destination);
      const began = Date.now();
      const timer = setInterval(() => {
        const s = Math.floor((Date.now() - began) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stop();
      }, 250);
      rec.current = { stream, ctx, node, source, chunks, timer };
      setSeconds(0);
      setState("recording");
    } catch (e) {
      setError(e?.name === "NotAllowedError" ? "The microphone was blocked; allow it in the browser to dictate."
                                             : "Couldn't open the microphone.");
    }
  }

  async function stop() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    clearInterval(r.timer);
    r.node.disconnect();
    r.source.disconnect();
    r.stream.getTracks().forEach((t) => t.stop());
    const rate = r.ctx.sampleRate;
    r.ctx.close().catch(() => {});
    if (r.chunks.length < 2) { setState("idle"); return; }
    setState("sending");
    try {
      const res = await fetch("/api/transcribe", { method: "POST", headers: { "Content-Type": "audio/wav" },
                                                   body: wav(r.chunks, rate) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "transcription failed");
      if (!data.transcript) setError("Nothing was heard; try again closer to the microphone.");
      else onText(data.transcript);
    } catch (e) {
      setError(e.message === "Failed to fetch" ? "Couldn't reach the site." : e.message);
    }
    setState("idle");
  }

  useEffect(() => () => { if (rec.current) stop(); }, []);  // leaving the page while recording: let the mic go

  if (!canDictate()) return null;
  const recording = state === "recording";
  return (
    <span className="dictate">
      <button type="button" className={`dictate-button${recording ? " recording" : ""}`}
              disabled={disabled || state === "sending"} aria-pressed={recording}
              aria-label={recording ? "Stop and transcribe" : label}
              title={recording ? "Stop" : `${label} (Muse Voice Transcribe)`}
              onClick={recording ? stop : start}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {recording ? <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /> : (
            <>
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
            </>
          )}
        </svg>
        <span className="dictate-text">
          {recording ? `Listening… ${seconds}s` : state === "sending" ? "Transcribing…" : label}
        </span>
      </button>
      {error && <span className="dictate-error small" role="alert">{error}</span>}
    </span>
  );
}
