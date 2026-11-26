"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  X, ChevronLeft, ChevronRight, Loader2, AlertCircle, RefreshCw, CheckCircle2, Inbox,
} from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// ---------- Button ----------
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: "bg-brand text-brand-fg shadow-[var(--shadow-xs)] hover:bg-brand-hover active:scale-[0.99]",
    secondary: "bg-surface text-ink border border-line shadow-[var(--shadow-xs)] hover:bg-surface-2 hover:border-line-strong active:scale-[0.99]",
    outline: "bg-transparent text-brand border border-brand/30 hover:bg-brand-soft active:scale-[0.99]",
    ghost: "text-body hover:bg-surface-2 hover:text-ink",
    danger: "bg-danger text-white shadow-[var(--shadow-xs)] hover:bg-red-700 active:scale-[0.99]",
  }[variant];
  const s = size === "sm" ? "h-8 px-3 text-xs font-medium" : "h-9 px-3.5 text-sm font-medium";
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50",
        v,
        s,
        className,
      )}
    >
      {loading && <Loader2 className="size-3.5 animate-spin" />}
      {children}
    </button>
  );
}

// ---------- Form fields ----------
const fieldCls =
  "w-full rounded-lg border border-line bg-surface px-3 h-9.5 text-sm text-ink shadow-[var(--shadow-xs)] placeholder:text-muted/70 transition hover:border-line-strong focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60";

export function Field({ label, error, children, hint }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-body">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-danger">{error}</span>}
    </label>
  );
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(fieldCls, props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(fieldCls, "h-auto py-2 leading-relaxed", props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(fieldCls, "pr-8", props.className)} />;
}

// ---------- Card / page header ----------
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-xl border border-line bg-surface shadow-[var(--shadow-xs)]", className)}>
      {children}
    </div>
  );
}
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Badge ----------
const tones: Record<string, string> = {
  green: "bg-green-50 text-ok ring-green-600/20",
  red: "bg-red-50 text-danger ring-red-600/20",
  amber: "bg-amber-50 text-warn ring-amber-600/20",
  blue: "bg-sky-50 text-info ring-sky-600/20",
  gray: "bg-slate-100 text-body ring-slate-500/15",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};
const statusTone: Record<string, string> = {
  active: "green", present: "green", approved: "green", done: "green", wfh: "blue",
  onboarding: "blue", in_progress: "blue", normal: "blue", pending: "amber", on_notice: "amber",
  half_day: "amber", important: "amber", blocked: "red", rejected: "red", absent: "red",
  exited: "gray", cancelled: "gray", todo: "gray", leave: "violet", holiday: "violet",
  urgent: "red", high: "amber", medium: "blue", low: "gray",
};
export function Badge({ children, tone, className }: { children: React.ReactNode; tone?: string; className?: string }) {
  const t = tone || statusTone[String(children)] || "gray";
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset whitespace-nowrap", tones[t], className)}>
      {typeof children === "string" ? children.replace(/_/g, " ") : children}
    </span>
  );
}

// ---------- Modal ----------
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#142D4E]/45 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          "animate-modal-in flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-xl border border-line bg-surface shadow-[var(--shadow-lg)]",
          wide ? "max-w-3xl" : "max-w-lg",
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

// ---------- ErrorBanner ----------
export function ErrorBanner({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cx(
        "flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="text-sm">
          <p className="font-semibold text-red-950">Unable to load data</p>
          <p className="mt-0.5 text-xs text-red-800/90">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button type="button" size="sm" variant="secondary" onClick={onRetry} className="self-start sm:self-center">
          <RefreshCw className="size-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}

// ---------- Table ----------
export function Table({
  head, children, empty, loading, error, onRetry,
}: {
  head: React.ReactNode[]; children: React.ReactNode; empty?: boolean; loading?: boolean; error?: string | null; onRetry?: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
            {head.map((h, i) => (
              <th key={i} className="px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line text-body">
          {loading ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-12 text-center text-muted">
                <Loader2 className="mx-auto size-5 animate-spin text-brand" />
                <p className="mt-2 text-xs">Loading records…</p>
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={head.length} className="p-4">
                <ErrorBanner message={error} onRetry={onRetry} />
              </td>
            </tr>
          ) : empty ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-12 text-center text-muted">
                <Inbox className="mx-auto size-7 opacity-35" />
                <p className="mt-2 text-sm font-medium text-ink">No records found</p>
                <p className="mt-0.5 text-xs text-muted">Try adjusting your filters or create a new entry.</p>
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <td className={cx("px-4 py-3 align-middle", className)}>{children}</td>
);

export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2 px-4 py-3 text-xs text-muted">
      <span className="font-medium">
        {total} record{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-3.5" /> Prev
        </Button>
        <span className="px-2 font-medium text-ink tabular-nums">
          {page} / {pages}
        </span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          Next <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ---------- Toasts ----------
type Toast = { id: number; msg: string; kind: "ok" | "err" };
const ToastCtx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = ++n.current;
    setItems((x) => [...x, { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === "err" ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-4 right-4 z-[60] flex w-84 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "animate-modal-in flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-[var(--shadow-md)]",
              t.kind === "ok"
                ? "border-green-200 bg-green-50 text-green-950"
                : "border-red-200 bg-red-50 text-red-950",
            )}
          >
            {t.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
            ) : (
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
            )}
            <span className="leading-snug">{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- misc ----------
export function StatCard({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: string; icon?: React.ReactNode }) {
  return (
    <Card className="p-5 transition hover:border-line-strong hover:shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-medium text-muted">{label}</span>
          <div className="mt-2 text-2xl font-bold tracking-tight text-ink tabular-nums">{value}</div>
          {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
        </div>
        {icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}

export const fmtDate = (s?: string | null) =>
  s ? new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
export const fmtTime = (s?: string | null) =>
  s ? new Date(s).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
export const fmtDateTime = (s?: string | null) => (s ? `${fmtDate(s)} ${fmtTime(s)}` : "—");
export const fmtBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
