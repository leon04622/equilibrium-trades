import { SubscriptionGuard } from "@/components/SubscriptionGuard";
import { PatternScannerUI } from "@/components/PatternScannerUI";

export default function Signals() {
  return (
    <SubscriptionGuard>
      <PatternScannerUI />
    </SubscriptionGuard>
  );
}
