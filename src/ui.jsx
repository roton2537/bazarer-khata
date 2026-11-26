import { createPortal } from 'react-dom';
import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';

export function Spinner() { return <span className="spin" aria-label="লোড হচ্ছে" />; }

export function Btn({ busy, children, className = '', ...p }) {
  return (
    <button className={`btn ${className}`} {...p} disabled={busy || p.disabled}>
      {busy ? <Spinner /> : null}{children}
    </button>
  );
}

export function Field({ label, children, hint }) {
  // type না দেওয়া input স্টাইল পায় না; তাই ডিফল্ট "text"
  const kids = React.Children.map(children, (c) => (React.isValidElement(c) && c.type === 'input' && !c.props.type ? React.cloneElement(c, { type: 'text' }) : c));
  return (
    <label className="field">
      <span>{label}</span>{kids}
      {hint ? <span className="small muted" style={{ marginTop: 4 }}>{hint}</span> : null}
    </label>
  );
}

export function Sheet({ title, onClose, children, role = 'dialog' }) {
  const panel = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!panel.current.contains(previous)) panel.current.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const handleKeys = (event) => {
    if (event.key === 'Escape') { onClose?.(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(panel.current.querySelectorAll('a[href], button:enabled, input:enabled, select:enabled, textarea:enabled, summary'))
      .filter(control => control.getClientRects().length > 0);
    const edge = event.shiftKey ? controls[0] : controls.at(-1);
    if (document.activeElement === edge || document.activeElement === panel.current) {
      event.preventDefault();
      (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
    }
  };
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="sheet" ref={panel} role={role} tabIndex={-1} aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeys}>
        <div className="grab" />
        <h2 id={titleId} style={{ marginBottom: 8 }}>{title}</h2>
        {children}
      </div>
    </div>, document.body
  );
}

// নিশ্চিতকরণ: ask({title, body, confirmText, danger, requireText}) → Promise<boolean>
export function useConfirm() {
  const [st, setSt] = useState(null);
  const [typed, setTyped] = useState('');
  const ask = useCallback((opts) => new Promise((resolve) => { setTyped(''); setSt({ ...opts, resolve }); }), []);
  const done = (v) => { st.resolve(v); setSt(null); };
  const node = st ? (
    <Sheet title={st.title} onClose={() => done(false)}>
      <div className="stack">
        {typeof st.body === 'string' ? <p className="break" style={{ whiteSpace: 'pre-line' }}>{st.body}</p> : st.body}
        {st.requireText ? (
          <Field label={`নিশ্চিত করতে “${st.requireText}” লিখুন`}>
            <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        ) : null}
      </div>
      <div className="btn-row">
        <button className="btn secondary" onClick={() => done(false)}>না, থাক</button>
        <button className={`btn ${st.danger ? 'danger' : ''}`} disabled={st.requireText ? typed.trim() !== st.requireText : false} onClick={() => done(true)}>
          {st.confirmText || 'হ্যাঁ'}
        </button>
      </div>
    </Sheet>
  ) : null;
  return [ask, node];
}

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const timer = useRef();
  const show = useCallback((msg, err = false) => {
    clearTimeout(timer.current); setT({ msg, err });
    timer.current = setTimeout(() => setT(null), err ? 5000 : 2500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t ? <div className={`toast ${t.err ? 'err' : ''}`} role="status">{t.msg}</div> : null}
    </ToastCtx.Provider>
  );
}

// দ্বিতীয়বার চাপলেও যেন একই কাজ দুবার না চলে
export function useAction() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const toast = useToast();
  const run = useCallback(async (fn, okMsg) => {
    if (lock.current) return undefined;
    lock.current = true; setBusy(true);
    try { const r = await fn(); if (okMsg) toast(okMsg); return r === undefined ? true : r; }
    catch (e) { toast(e.message || 'কিছু একটা ভুল হয়েছে।', true); return undefined; }
    finally { lock.current = false; setBusy(false); }
  }, [toast]);
  return [busy, run];
}

export function Tag({ kind = '', children }) { return <span className={`tag ${kind}`}>{children}</span>; }
