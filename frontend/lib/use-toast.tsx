import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { AnimatedToastStack, useAnimatedToastStack, type ToastInput } from "../components/motion/animated-toast-stack";
import { frontendText, type LocaleRuntime } from "./i18n";

export interface ToastApi {
  /** Queue a transient confirmation. Returns the toast id. */
  show: (input: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Global transient feedback channel.
 *
 * Only feedback that is safe to miss belongs here: confirmations for a write that
 * already resolved, and outcomes whose inline affordance is already unmounted by
 * the time the result arrives. Durable state — failures, blocked records and
 * recovery intents — stays inline so a refresh never erases it.
 */
export function ToastProvider({ children, locale }: { children: ReactNode; locale: LocaleRuntime }) {
  const stack = useAnimatedToastStack({ limit: 3 });
  const show = useCallback((input: ToastInput) => stack.showToast(input), [stack.showToast]);
  const value = useMemo<ToastApi>(() => ({ show, dismiss: stack.dismissToast }), [show, stack.dismissToast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <AnimatedToastStack toasts={stack.toasts} onDismiss={stack.dismissToast} dismissLabel={frontendText(locale, "COMMON_DISMISS")} fixed position="bottom-right" maxVisible={3} />
    </ToastContext.Provider>
  );
}

const NO_TOASTS: ToastApi = { show: () => "", dismiss: () => undefined };

/**
 * Falls back to a no-op outside a provider. Rendered shells and tests mount
 * components without one, and a missing toast channel must never break an
 * action that already succeeded.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NO_TOASTS;
}
