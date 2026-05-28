import clsx from "clsx";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export function Card({ children, className = "", title, action, padded = true }: {
  children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode; padded?: boolean;
}) {
  return (
    <section className={clsx(
      "bg-panel/60 border border-line/80 rounded-2xl shadow-card backdrop-blur",
      className
    )}>
      {(title || action) && (
        <header className="px-6 py-4 border-b border-line/60 flex items-center justify-between">
          <div className="text-sm font-semibold tracking-tightish">{title}</div>
          <div>{action}</div>
        </header>
      )}
      <div className={padded ? "p-6" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, accent, big = false }: {
  label: string; value: ReactNode; sub?: ReactNode;
  accent?: "green" | "yellow" | "red" | "cream"; big?: boolean;
}) {
  const color =
    accent === "yellow" ? "text-accent2" :
    accent === "red" ? "text-danger" :
    accent === "cream" ? "text-cream" : "text-accent";
  return (
    <div className="bg-bg/40 border border-line/60 rounded-xl p-5">
      <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted font-medium">{label}</div>
      <div className={clsx(
        "font-display tracking-tight2 mt-2",
        big ? "text-5xl" : "text-3xl",
        color
      )}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1.5">{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const tone = {
    AVAILABLE: "bg-accent/12 text-accent border-accent/30",
    MATCHED: "bg-accent2/12 text-accent2 border-accent2/30",
    IN_TRANSIT: "bg-blue-400/12 text-blue-300 border-blue-400/30",
    DELIVERED: "bg-emerald-500/12 text-emerald-300 border-emerald-500/30",
    DISPUTED: "bg-danger/12 text-danger border-danger/40",
    PENDING: "bg-slate-400/12 text-slate-300 border-slate-400/30",
    CONFIRMED: "bg-accent/12 text-accent border-accent/30",
    COMPLETED: "bg-accent/12 text-accent border-accent/30",
    IN_PROGRESS: "bg-accent2/12 text-accent2 border-accent2/30",
  }[status] || "bg-slate-500/12 text-slate-300 border-slate-500/30";
  return (
    <span className={clsx("inline-block text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border font-medium", tone)}>
      {t(`status_${status}` as any, { defaultValue: status })}
    </span>
  );
}

export function Btn({ children, className = "", variant = "primary", size = "md", ...rest }: any) {
  const styles = {
    primary: "bg-accent text-bg hover:brightness-110 shadow-sm",
    ghost: "bg-bg/40 border border-line/80 text-slate-100 hover:border-accent/60 hover:bg-bg/60",
    danger: "bg-danger text-bg hover:brightness-110",
    cream: "bg-cream text-bg hover:brightness-105",
    link: "text-accent hover:underline underline-offset-4 bg-transparent",
  }[variant];
  const sz = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3.5 py-1.5 text-sm",
    lg: "px-5 py-2.5 text-base",
    xl: "px-6 py-3.5 text-base font-semibold",
  }[size];
  return (
    <button {...rest}
      className={clsx("inline-flex items-center gap-1.5 rounded-lg font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed",
        styles, sz, className)}>
      {children}
    </button>
  );
}

export function Hash({ value, prefix = 12 }: { value: string; prefix?: number }) {
  return <span className="mono text-[11px] text-muted" title={value}>{value.slice(0, prefix)}…</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted py-10 text-center">{children}</div>;
}

export function Eyebrow({ children, dot = true }: { children: ReactNode; dot?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted">
      {dot && <span className="w-1 h-1 rounded-full bg-accent animate-pulse" />}
      {children}
    </div>
  );
}

/** Number that counts up on first reveal */
export function CountUp({ to, duration = 1200, format = (n) => n.toLocaleString(), className = "" }: {
  to: number; duration?: number; format?: (n: number) => string; className?: string;
}) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0; let start: number | null = null;
    const target = to;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);
  return <span ref={ref} className={className}>{format(value)}</span>;
}

/** Wraps children with a fade-up reveal once they enter the viewport */
export function Reveal({ children, delay = 0, className = "" }: {
  children: ReactNode; delay?: number; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          setTimeout(() => setShown(true), delay);
          io.disconnect();
          break;
        }
      }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);
  return (
    <div ref={ref} className={clsx("reveal", shown && "in", className)}>
      {children}
    </div>
  );
}

export function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-4 my-6">
      <div className="flex-1 h-px bg-line/60" />
      {label && <div className="text-[10px] uppercase tracking-[0.18em] text-muted">{label}</div>}
      <div className="flex-1 h-px bg-line/60" />
    </div>
  );
}
