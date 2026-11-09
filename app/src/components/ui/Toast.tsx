import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

interface ToastApi {
  /** A short confirmation of a move ("Offer sent"). */
  info: (text: string) => void;
  /** Why a move didn't happen. */
  error: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (text: string, tone: Toast['tone']) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-3), { id, text, tone }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ info: (t) => push(t, 'info'), error: (t) => push(t, 'error') }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="g-toasts" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`g-toast${t.tone === 'error' ? ' g-toast--error' : ''}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span className="g-toast__text">{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast needs <ToastProvider>');
  return api;
}
