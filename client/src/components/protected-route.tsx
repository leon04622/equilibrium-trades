import type { ReactNode } from "react";
import { SubscriptionGate } from "@/components/subscription-gate";
import type { PremiumFeature } from "@/hooks/use-subscription";

type ProSubscriptionRouteProps = {
  feature: PremiumFeature;
  children: ReactNode;
  title?: string;
  description?: string;
};

/**
 * Freemium wrapper: renders children with a blurred Pro overlay when the wallet is not on an active Pro plan.
 * Prefer this over the legacy full-page `SubscriptionGate` card for Signals, Videos, and similar browse-first pages.
 */
export function ProSubscriptionRoute({
  feature,
  children,
  title,
  description,
}: ProSubscriptionRouteProps) {
  return (
    <SubscriptionGate feature={feature} variant="overlay" title={title} description={description}>
      {children}
    </SubscriptionGate>
  );
}
