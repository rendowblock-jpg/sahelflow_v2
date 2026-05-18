"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface ToastInput {
  type: "success" | "error" | "warning" | "info";
  title: string;
  description?: string;
}

interface Toast extends ToastInput {
  id: string;
  createdAt: number;
  _exiting?: boolean;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => {},
  dismiss: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4000;

const ICON_MAP = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const { t: tx } = useI18n();

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) =>
      prev.map((t): Toast => (t.id === id ? { ...t, _exiting: true } : t)),
    );
    // 300 ms matches the sf-toast exit transition duration in CSS
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = crypto.randomUUID();
      const newToast: Toast = { ...input, id, createdAt: Date.now() };

      setToasts((prev) => {
        const next = [...prev, newToast];
        if (next.length > MAX_VISIBLE) {
          const oldest = next[0];
          const timer = timersRef.current.get(oldest.id);
          if (timer) clearTimeout(timer);
          timersRef.current.delete(oldest.id);
          return next.slice(1);
        }
        return next;
      });

      const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div className="sf-toast-container">
        {toasts.map((t) => {
          const Icon = ICON_MAP[t.type];
          return (
            <div
              key={t.id}
              className={`sf-toast sf-toast--${t.type}${t._exiting ? " sf-toast--exiting" : ""}`}
              role="alert"
            >
              <Icon size={18} className="sf-toast__icon" />
              <div className="sf-toast__content">
                <p className="sf-toast__title">{t.title}</p>
                {t.description && (
                  <p className="sf-toast__desc">{t.description}</p>
                )}
              </div>
              <button
                className="sf-toast__dismiss"
                onClick={() => dismiss(t.id)}
                aria-label={tx.common.dismiss}
              >
                <X size={14} />
              </button>
              <div
                className="sf-toast__progress"
                style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
              />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
