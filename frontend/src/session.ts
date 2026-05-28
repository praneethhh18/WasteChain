import { useEffect, useState } from "react";
import { api, User } from "./api";

const KEY_USER = "wc.user";
const KEY_FRESH = "wc.freshMode";  // "1" = show the persona as a brand-new user (empty)

export function setCurrentUser(u: User | null) {
  if (u) localStorage.setItem(KEY_USER, JSON.stringify(u));
  else localStorage.removeItem(KEY_USER);
  window.dispatchEvent(new Event("wc.user.changed"));
}

export function getCurrentUser(): User | null {
  try {
    const raw = localStorage.getItem(KEY_USER);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function useCurrentUser(): [User | null, (u: User | null) => void] {
  const [user, setUser] = useState<User | null>(getCurrentUser());
  useEffect(() => {
    const h = () => setUser(getCurrentUser());
    window.addEventListener("wc.user.changed", h);
    return () => window.removeEventListener("wc.user.changed", h);
  }, []);
  return [user, (u) => { setCurrentUser(u); setUser(u); }];
}

export function useAllUsers() {
  const [users, setUsers] = useState<User[]>([]);
  useEffect(() => { api.users().then(setUsers).catch(() => setUsers([])); }, []);
  return users;
}

// ─── Demo mode: "fresh user" simulation ────────────────────────────────
// When ON, the current persona is rendered as if they just signed up today —
// no historical batches, handoffs, matches, etc. Shows the empty state /
// onboarding view that a brand-new user in production would actually see.

export function getFreshMode(): boolean {
  return localStorage.getItem(KEY_FRESH) === "1";
}

export function setFreshMode(v: boolean) {
  if (v) localStorage.setItem(KEY_FRESH, "1");
  else localStorage.removeItem(KEY_FRESH);
  window.dispatchEvent(new Event("wc.freshmode.changed"));
}

export function useFreshMode(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState<boolean>(getFreshMode());
  useEffect(() => {
    const h = () => setV(getFreshMode());
    window.addEventListener("wc.freshmode.changed", h);
    return () => window.removeEventListener("wc.freshmode.changed", h);
  }, []);
  return [v, (val) => { setFreshMode(val); setV(val); }];
}

// ─── Judge-tools mode ─────────────────────────────────────────────────
// In Live mode (default) the signed-in user is locked to their role and
// only sees their own dashboard — no persona switcher, no judge tools.
// In Judge mode, the floating panel is open with persona switcher + admin
// tools (Trust Layer, Provenance, Workflow walkthrough). This makes the
// product feel like a real app, with judge access tucked behind one click.

const KEY_JUDGE = "wc.judgeMode";

export function getJudgeMode(): boolean {
  return localStorage.getItem(KEY_JUDGE) === "1";
}

export function setJudgeMode(v: boolean) {
  if (v) localStorage.setItem(KEY_JUDGE, "1");
  else localStorage.removeItem(KEY_JUDGE);
  window.dispatchEvent(new Event("wc.judgemode.changed"));
}

export function useJudgeMode(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState<boolean>(getJudgeMode());
  useEffect(() => {
    const h = () => setV(getJudgeMode());
    window.addEventListener("wc.judgemode.changed", h);
    return () => window.removeEventListener("wc.judgemode.changed", h);
  }, []);
  return [v, (val) => { setJudgeMode(val); setV(val); }];
}
