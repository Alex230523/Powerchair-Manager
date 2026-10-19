"use client";
import { useEffect } from "react";

/** Registers the service worker that keeps pages usable without network (production only). */
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* The application keeps working online without it. */
    });
  }, []);
  return null;
}
