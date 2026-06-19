"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/shared/Toast";

const STORAGE_KEY = "mtc-last-activity";
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

interface IdleTimeoutProps {
  /** Inactivity before auto-logout. Default 30 minutes. */
  timeoutMs?: number;
  /** How long before logout to warn the user. Default 2 minutes. */
  warnMs?: number;
}

/**
 * Signs the user out after a period of inactivity and redirects to
 * /login?reason=idle. Activity is shared across tabs via localStorage, so the
 * session only expires when ALL tabs have been idle. Complements the server-side
 * inactivity/time-box settings configured in the Supabase dashboard.
 */
export function IdleTimeout({
  timeoutMs = 30 * 60 * 1000,
  warnMs = 2 * 60 * 1000,
}: IdleTimeoutProps) {
  const router = useRouter();
  const { toast } = useToast();
  const lastActivity = useRef(0);
  const warned = useRef(false);
  const loggingOut = useRef(false);

  useEffect(() => {
    lastActivity.current = Date.now();
    let lastWrite = 0;

    const markActivity = () => {
      const now = Date.now();
      lastActivity.current = now;
      warned.current = false;
      // Throttle cross-tab writes to once every 5s.
      if (now - lastWrite > 5000) {
        lastWrite = now;
        try {
          localStorage.setItem(STORAGE_KEY, String(now));
        } catch {
          // ignore storage failures (private mode, quota)
        }
      }
    };

    // Activity in another tab keeps this tab alive too.
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        lastActivity.current = Math.max(lastActivity.current, Number(e.newValue));
        warned.current = false;
      }
    };

    const logout = async () => {
      if (loggingOut.current) return;
      loggingOut.current = true;
      try {
        await createClient().auth.signOut();
      } finally {
        router.replace("/login?reason=idle");
      }
    };

    const tick = () => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= timeoutMs) {
        void logout();
      } else if (idle >= timeoutMs - warnMs && !warned.current) {
        warned.current = true;
        toast("سيتم تسجيل خروجك قريبًا بسبب عدم النشاط", "warning");
      }
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, markActivity, { passive: true })
    );
    window.addEventListener("storage", onStorage);
    const interval = window.setInterval(tick, 15000);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActivity));
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
    };
  }, [router, toast, timeoutMs, warnMs]);

  return null;
}
