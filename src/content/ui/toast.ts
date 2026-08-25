// src/content/ui/toast.ts — ephemeral toasts (bottom-right, 6 s, error sticky).
// FR4 / §2.7.

import { ensureHost } from "./root.js";

export type ToastVariant = "info" | "error" | "dedupe" | "cooldown";

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  actionLabel?: string;
  actionHref?: string;
  /** Auto-dismiss in ms. Default 6000. Error toasts are sticky when omitted. */
  durationMs?: number;
  onAction?: () => void;
}

const Z = 2147483647;

export function showToast(opts: ToastOptions): () => void {
  const { shadow } = ensureHost();
  const el = document.createElement("div");
  el.className = `nx-toast nx-toast-${opts.variant ?? "info"}`;
  el.style.zIndex = String(Z);
  const msg = document.createElement("span");
  msg.textContent = opts.message;
  el.appendChild(msg);
  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.remove();
  };
  if (opts.actionLabel) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nx-btn";
    btn.style.marginLeft = "8px";
    btn.textContent = opts.actionLabel;
    btn.addEventListener("click", () => {
      if (opts.onAction) opts.onAction();
      if (opts.actionHref) window.location.assign(opts.actionHref);
      dismiss();
    });
    el.appendChild(btn);
  }
  shadow.appendChild(el);
  const sticky = opts.variant === "error" && opts.durationMs === undefined;
  if (!sticky) {
    const ms = opts.durationMs ?? 6000;
    setTimeout(dismiss, ms);
  }
  return dismiss;
}
