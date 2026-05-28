import { ReactNode } from "react";
import { Btn } from "./ui";

/** Onboarding-style empty state for a brand-new user.
 * Honest about what they'll see once the network grows around them. */
export function EmptyOnboarding({ emoji, title, body, next, secondary }: {
  emoji: string;
  title: string;
  body: ReactNode;
  next?: { label: string; onClick?: () => void; to?: string };
  secondary?: ReactNode;
}) {
  return (
    <div className="bg-panel/30 border border-dashed border-accent2/40 rounded-3xl p-10 md:p-14 text-center">
      <div className="text-6xl mb-5">{emoji}</div>
      <h3 className="font-display text-3xl tracking-tight2 text-cream">{title}</h3>
      <div className="text-sm text-slate-300 leading-relaxed mt-3 max-w-xl mx-auto">
        {body}
      </div>
      {next && (
        <div className="mt-7">
          {next.to ? (
            <a href={next.to}><Btn size="lg">{next.label}</Btn></a>
          ) : (
            <Btn size="lg" onClick={next.onClick}>{next.label}</Btn>
          )}
        </div>
      )}
      {secondary && (
        <div className="mt-5 text-[11px] text-muted">{secondary}</div>
      )}
    </div>
  );
}

/** Tiny callout used inside a dashboard when ONE specific panel is empty. */
export function EmptyPanel({ emoji = "✨", text, hint }: { emoji?: string; text: string; hint?: string }) {
  return (
    <div className="text-center py-10">
      <div className="text-3xl mb-2">{emoji}</div>
      <div className="text-sm text-slate-300">{text}</div>
      {hint && <div className="text-[11px] text-muted mt-1.5 max-w-xs mx-auto">{hint}</div>}
    </div>
  );
}
