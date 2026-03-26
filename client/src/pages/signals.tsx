import { ProSubscriptionRoute } from "@/components/protected-route";
import { PatternScannerUI } from "@/components/PatternScannerUI";

export default function Signals() {
  return (
    <ProSubscriptionRoute
      feature="ai_signals"
      title="Upgrade to Pro"
      description="Unlock Morning Star and AI pattern signals across all timeframes."
    >
      <PatternScannerUI />
    </ProSubscriptionRoute>
  );
}
