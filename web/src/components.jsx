// Small pieces both pages share.
import { useEffect, useRef, useState } from "react";

export function Stat({ label, value, note }) {
  return (
    <div className="stat tile">
      <dt>{label}</dt>
      <dd>
        <span className="stat-value">{value}</span>
        {note && <span className="stat-note">{note}</span>}
      </dd>
    </div>
  );
}

// A number that counts up to its value when it first appears, in under a second, unless motion is turned down.
export function CountUp({ to, ms = 900 }) {
  const [shown, setShown] = useState(() => (matchMedia("(prefers-reduced-motion: reduce)").matches ? to : 0));
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setShown(to); return; }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / ms), eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(to * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, ms]);
  return <span aria-label={String(to)}>{shown}</span>;
}

// Adds the "in" class once the element has scrolled into view, so bars can draw themselves in.
export function useReveal() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) { el.classList.add("in"); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { el.classList.add("in"); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

// The shape of what's coming, in place of a spinner: grey blocks where the title, numbers and rows will be, so the
// page doesn't jump when they arrive. Screen readers hear one word; the shimmer stops under reduced motion.
export function Skeleton({ lines = 3, className = "", widths }) {
  const w = widths ?? Array.from({ length: lines }, (_, i) => (i === lines - 1 ? "55%" : i % 2 ? "82%" : "95%"));
  return (
    <div className={`skel ${className}`} role="status" aria-label="Loading" aria-busy="true">
      {w.map((width, i) => <span key={i} className="skel-line" style={{ width }} />)}
    </div>
  );
}

// A small line chart. Screen readers get the label, which states the first and last values; the numbers themselves
// are always also in a table or text nearby.
export function Sparkline({ points, label, lowerIsBetter = false, height = 56 }) {
  if (points.length < 2) return null;
  const w = 240, pad = 4;
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const x = (i) => pad + (i / (points.length - 1)) * (w - 2 * pad);
  const y = (v) => pad + (hi === lo ? 0.5 : (hi - v) / (hi - lo)) * (height - 2 * pad);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  return (
    <svg className={`spark ${lowerIsBetter ? "down" : "up"}`} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={label}
         preserveAspectRatio="none">
      <path d={d} fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <p>
        Built for the Meta Global AI Developer Hackathon. Independent project, not affiliated with or endorsed by Meta.
        Code: <a href="https://github.com/Luh-Labs-LLC/muse-finetune-agents">github.com/Luh-Labs-LLC/muse-finetune-agents</a>.
      </p>
    </footer>
  );
}
