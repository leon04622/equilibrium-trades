import { AdminGuard } from "@/components/admin-guard";
import AdminDashboard from "@/pages/admin-dashboard";

/** Protected admin + CRM — master wallet only (`ADMIN_EQUILIBRIUM_MASTER_WALLET` + optional `VITE_ADMIN_MASTER_WALLET`). */
export default function AdminEquilibriumPage() {
  return (
    <AdminGuard>
      <AdminDashboard />
    </AdminGuard>
  );
}
