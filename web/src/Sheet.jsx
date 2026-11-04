// A sheet: a glass panel over the page for one task (teaching the model something), closed by its button, Escape,
// a click outside, or the back gesture.
import { useEffect, useRef } from "react";
import { Icon } from "./icons.jsx";
import { useBackClose } from "./lib/sheet.js";

export default function Sheet({ open, onClose, title, children }) {
  const panel = useRef(null);
  useBackClose(open, onClose, "sheet");
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", onKey);
    const shell = document.querySelector(".shell");
    if (shell) shell.inert = true;
    requestAnimationFrame(() => panel.current?.querySelector("textarea, input, button")?.focus());
    return () => { removeEventListener("keydown", onKey); if (shell) shell.inert = false; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className="sheet tile" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <header className="sheet-head">
          <h2 id="sheet-title">{title}</h2>
          <button type="button" className="chatpanel-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
