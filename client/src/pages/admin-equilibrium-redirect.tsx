import { useEffect } from "react";
import { useLocation } from "wouter";

/** Legacy signed CRM path — consolidated into `/admin` behind AdminGuard + master wallet. */
export default function AdminEquilibriumRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/admin");
  }, [setLocation]);
  return (
    <div className="p-6 text-sm text-muted-foreground">Opening Command Center…</div>
  );
}
