import { useEffect, useState, useRef } from "react";
import { api, SmsMessage } from "../api";
import { Btn, Eyebrow, Reveal } from "../components/ui";
import { useAllUsers } from "../session";
import clsx from "clsx";

export default function SmsSimulator() {
  const users = useAllUsers();
  const kabadis = users.filter(u => u.role === "kabadiwala");
  const [phone, setPhone] = useState<string>("");
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!phone && kabadis.length > 0) setPhone(kabadis[0].phone); }, [kabadis, phone]);

  const refresh = async (p: string) => {
    if (!p) return;
    try { setMessages(await api.smsHistory(p)); } catch { setMessages([]); }
  };
  useEffect(() => { if (phone) refresh(phone); }, [phone]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const send = async (text: string) => {
    if (!phone || !text.trim() || sending) return;
    setSending(true);
    try { await api.smsInbound(phone, text.trim()); await refresh(phone); setInput(""); }
    finally { setSending(false); }
  };

  const reset = async () => { if (!phone) return; await api.smsReset(phone); await refresh(phone); };
  const currentUser = users.find(u => u.phone === phone);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <Reveal>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Optional channel · SMS bot</Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight2 mt-3 leading-tight">
              Numbered menus.
              <br /><span className="text-muted/60 italic font-light">No data plan needed.</span>
            </h1>
            <p className="text-slate-300 max-w-2xl mt-4 leading-relaxed">
              For kabadiwalas who'd rather text than read a WhatsApp. Works on a ₹800 feature phone, no app, no internet. Same endpoint a real MSG91/Gupshup webhook would hit.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={phone} onChange={(e) => setPhone(e.target.value)}
              className="bg-bg/40 border border-line/60 rounded-lg px-3 py-2 text-sm">
              {kabadis.map(k => <option key={k.id} value={k.phone}>{k.name} · {k.language.toUpperCase()}</option>)}
            </select>
            <Btn variant="ghost" size="sm" onClick={reset}>Reset</Btn>
          </div>
        </header>
      </Reveal>

      <Reveal delay={150}>
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <div className="bg-panel/60 border border-line/60 rounded-3xl overflow-hidden shadow-card max-w-md mx-auto">
              <div className="bg-bg/60 px-4 py-3 flex items-center justify-between border-b border-line/60">
                <div className="text-xs text-muted">WasteChain · +91 99-WC-SMS</div>
                <div className="text-[10px] text-accent flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> live
                </div>
              </div>
              <div ref={scrollRef} className={clsx("p-4 h-[460px] overflow-y-auto bg-bg/40 space-y-2", `lang-${currentUser?.language}`)}>
                {messages.length === 0 && (
                  <div className="text-center text-muted text-sm py-16">
                    <div className="text-3xl mb-3">💬</div>
                    Send <span className="mono bg-bg/60 px-1.5 py-0.5 rounded">HI</span> to start.
                  </div>
                )}
                {messages.map(m => (
                  <div key={m.id} className={clsx("flex", m.direction === "IN" ? "justify-end" : "justify-start")}>
                    <div className={clsx(
                      "max-w-[78%] px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-line break-words",
                      m.direction === "IN" ? "bg-accent text-bg rounded-br-md" : "bg-bg/70 border border-line/60 rounded-bl-md"
                    )}>
                      {m.body}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-line/60 p-3 flex gap-2">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send(input)}
                  placeholder="Type 1, 2, 3…"
                  className="flex-1 bg-bg/60 border border-line/60 focus:border-accent rounded-lg px-3 py-2 text-sm outline-none" />
                <Btn onClick={() => send(input)} disabled={sending}>Send</Btn>
              </div>
              <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                {["HI", "1", "2", "3", "0", "9"].map(q => (
                  <button key={q} onClick={() => send(q)} className="text-[11px] mono bg-bg/60 hover:bg-accent/15 border border-line/60 px-2.5 py-1 rounded">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="bg-panel/40 border border-line/60 rounded-2xl p-6">
              <div className="text-[10px] uppercase tracking-[0.18em] text-accent">How it works</div>
              <ol className="text-sm space-y-2.5 text-slate-300 list-decimal pl-5 mt-3">
                <li>Kabadiwala texts <span className="mono bg-bg/60 px-1.5 py-0.5 rounded">HI</span> from any phone.</li>
                <li>Bot replies in their saved language with a numbered menu.</li>
                <li>They reply with numbers — pick material, type weight, confirm.</li>
                <li>Batch is created, SHA-256 chained, matched against live bids.</li>
                <li>Bot returns batch code + the best buyer's ₹/kg uplift.</li>
              </ol>
            </div>
            <div className="bg-panel/40 border border-line/60 rounded-2xl p-6">
              <div className="text-[10px] uppercase tracking-[0.18em] text-accent">Why SMS over WhatsApp</div>
              <ul className="text-sm space-y-2 text-slate-300 mt-3">
                <li>✓ Works on every GSM phone — no smartphone needed</li>
                <li>✓ Free inbound for the user — no data plan</li>
                <li>✓ Survives 2G dead zones</li>
                <li>✓ Numbered menus dodge literacy hurdles</li>
                <li>✓ Drop-in to any Indian provider (MSG91 / Gupshup) — same JSON shape</li>
              </ul>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
