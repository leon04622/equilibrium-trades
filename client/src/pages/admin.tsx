import { AdminGuard } from "@/components/admin-guard";
import AdminDashboard from "@/pages/admin-dashboard";

export default function Admin() {
  return (
    <AdminGuard>
      <AdminDashboard />
    </AdminGuard>
  );
}
