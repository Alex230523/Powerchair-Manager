"use client";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/locale";
import type { IconName } from "./icons";
import { Toast } from "./ui";
import { toastCopy } from "./toast-copy";

/**
 * Toasts of the whole application (wave 15, C10). Any page calls
 * showToast(); the host in the shell shows the latest one for 8 seconds,
 * paused while hovered or focused. undoToast() adds "Annuler", which asks
 * the server to put the action back (POST /api/undo) and reloads the page's
 * data.
 */
export type ToastInput = { message: string; icon?: IconName; action?: { label: string; run: () => Promise<void> } };
const event = "pfm-toast";
const duration = 8000;

export function showToast(input: ToastInput) {
  window.dispatchEvent(new CustomEvent<ToastInput>(event, { detail: input }));
}

/** After an action the server offered to undo: "Équipe archivée · Annuler". */
export function undoToast(locale: Locale, message: string, undo: string | undefined, organizationId: string | null | undefined, after: () => unknown, icon: IconName = "check") {
  const t = toastCopy[locale];
  showToast({
    message,
    icon,
    ...(undo && organizationId
      ? {
          action: {
            label: t.undo,
            run: async () => {
              const r = await fetch("/api/undo", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ organizationId, id: undo }),
              });
              const v = await r.json().catch(() => ({}));
              if (!r.ok) {
                showToast({ message: v.error === "UNDO_EXPIRED" || v.error === "UNDO_USED" ? t.tooLate : t.failed, icon: "alert" });
                return;
              }
              await after();
              showToast({ message: t.undone, icon: "back" });
            },
          },
        }
      : {}),
  });
}

export function ToastHost({ locale }: { locale: Locale }) {
  const t = toastCopy[locale];
  const [toast, setToast] = useState<(ToastInput & { key: number }) | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const left = useRef(duration),
    started = useRef(0);
  useEffect(() => {
    const show = (e: Event) => {
      left.current = duration;
      setPaused(false);
      setBusy(false);
      setToast({ ...(e as CustomEvent<ToastInput>).detail, key: Date.now() });
    };
    window.addEventListener(event, show);
    return () => window.removeEventListener(event, show);
  }, []);
  // The timer runs only while the message is neither hovered nor focused.
  useEffect(() => {
    if (!toast || paused) return;
    started.current = Date.now();
    const handle = window.setTimeout(() => setToast(null), left.current);
    return () => {
      window.clearTimeout(handle);
      left.current = Math.max(0, left.current - (Date.now() - started.current));
    };
  }, [toast, paused]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast && (
        <Toast
          key={toast.key}
          message={toast.message}
          icon={toast.icon}
          actionLabel={toast.action?.label}
          busy={busy}
          onAction={
            toast.action
              ? () => {
                  const run = toast.action!.run;
                  setBusy(true);
                  setToast(null);
                  void run().finally(() => setBusy(false));
                }
              : undefined
          }
          closeLabel={t.close}
          onClose={() => setToast(null)}
          onPause={() => setPaused(true)}
          onResume={() => setPaused(false)}
        />
      )}
    </div>
  );
}
