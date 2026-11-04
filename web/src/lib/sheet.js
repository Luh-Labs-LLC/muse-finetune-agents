// What every sheet, drawer and panel on the site shares: the back button closes it, and on a touch screen it can be
// swiped away, following the finger and letting go (or being caught again) at any point.
import { useEffect, useRef } from "react";

// While `open`, the page has one more history entry, so the phone's back gesture (or the browser's back button)
// closes the sheet instead of leaving the site. Closing it any other way takes that entry back out.
export function useBackClose(open, close, name) {
  const pushed = useRef(false);
  useEffect(() => {
    if (open) {
      if (!pushed.current) {
        history.pushState({ ...(history.state ?? {}), sheet: name }, "");
        pushed.current = true;
      }
      const onPop = () => { pushed.current = false; close(); };
      addEventListener("popstate", onPop);
      return () => removeEventListener("popstate", onPop);
    }
    if (pushed.current) {
      pushed.current = false;
      if (history.state?.sheet === name) history.back();
    }
  }, [open, name]);  // eslint-disable-line react-hooks/exhaustive-deps
}

// Drag the element along `axis` ("x" or "y") towards `direction` (-1 or 1) to dismiss it. The element follows the
// finger with no easing; let go past a third of the way (or with a flick) and it leaves, otherwise it springs back.
// A drag that starts mid-animation takes over from wherever the element is: nothing has to finish first. Gestures
// that start inside `handle` (a selector) only, when given, so a scrolling list inside the sheet still scrolls.
export function useSwipeDismiss(ref, { axis = "x", direction = -1, onDismiss, enabled = true, handle = null }) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const prop = axis === "x" ? "clientX" : "clientY";
    const cross = axis === "x" ? "clientY" : "clientX";
    let start = null, startCross = 0, locked = null, moved = 0, last = 0, lastAt = 0, velocity = 0, from = 0;
    const size = () => (axis === "x" ? el.offsetWidth : el.offsetHeight);
    const translate = (d) => `translate${axis.toUpperCase()}(${d}px)`;

    function current() {  // how far it's already moved, if a previous release is still animating
      const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return axis === "x" ? m.m41 : m.m42;
    }
    function down(e) {
      if (e.pointerType === "mouse" || e.button > 0) return;
      if (handle && !e.target.closest(handle)) return;
      start = e[prop]; startCross = e[cross]; locked = null; moved = 0; velocity = 0; last = start; lastAt = e.timeStamp;
      from = current();
      el.style.transition = "none";
      el.style.transform = translate(from);
    }
    function move(e) {
      if (start == null) return;
      const d = e[prop] - start, c = e[cross] - startCross;
      if (locked == null) {
        if (Math.abs(d) < 8 && Math.abs(c) < 8) return;
        locked = Math.abs(d) > Math.abs(c) ? "ours" : "theirs";  // a mostly vertical swipe on a drawer is a scroll
        if (locked === "theirs") { reset(); return; }
        try { el.setPointerCapture(e.pointerId); } catch { /* fine */ }
      }
      e.preventDefault();
      moved = Math.max(0, d * direction);  // only towards dismissal; the other way stays put
      const dt = e.timeStamp - lastAt;
      if (dt > 0) velocity = ((e[prop] - last) * direction) / dt;
      last = e[prop]; lastAt = e.timeStamp;
      el.style.transform = translate(from + moved * direction);
    }
    function up() {
      if (start == null) return;
      const total = Math.abs(from) + moved;
      const go = locked === "ours" && (total > size() / 3 || velocity > 0.5);
      start = null;
      el.style.transition = "";
      if (go) {
        el.style.transform = translate(direction * (size() + 24));
        const done = () => { el.style.transform = ""; onDismiss(); };
        el.addEventListener("transitionend", done, { once: true });
        setTimeout(done, 300);  // in case no transition runs (reduced motion)
      } else {
        el.style.transform = "";  // back to where the stylesheet puts it
      }
    }
    function reset() { start = null; el.style.transition = ""; el.style.transform = ""; }

    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move, { passive: false });
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", reset);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", reset);
      reset();
    };
  }, [ref, axis, direction, onDismiss, enabled, handle]);
}
