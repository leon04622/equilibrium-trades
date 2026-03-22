import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Users, Shield, Crown, Zap, Sparkles, Check, X, 
  RefreshCw, Search, Calendar, Mail, Download
} from "lucide-react";
import type { Lead } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useWallet } from "@/lib/wallet-context";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { isAdminWallet } from "@shared/schema";
import type { WalletUser } from "@shared/schema";
import { cn } from "@/lib/utils";

export default function Admin() {
  const { address } = useWallet();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingUser, setEditingUser] = useState<WalletUser | null>(null);
  const [editTier, setEditTier] = useState<'free' | 'pro' | 'elite'>('free');
  const [editActive, setEditActive] = useState(false);

  const isAdmin = address ? isAdminWallet(address) : false;

  const { data: leads = [], isLoading: leadsLoading, refetch: refetchLeads } = useQuery<Lead[]>({
    queryKey: ['/api/leads'],
    enabled: isAdmin && !!address,
    queryFn: async () => {
      const response = await fetch('/api/leads', {
        headers: { 'x-wallet-address': address || '' }
      });
      if (!response.ok) throw new Error('Failed to fetch leads');
      return response.json();
    }
  });

  const { data: users = [], isLoading, refetch } = useQuery<WalletUser[]>({
    queryKey: ['/api/admin/users'],
    enabled: isAdmin && !!address,
    queryFn: async () => {
      const response = await fetch('/api/admin/users', {
        headers: {
          'x-wallet-address': address || ''
        }
      });
      if (!response.ok) {
        throw new Error('Failed to fetch users');
      }
      return response.json();
    }
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: async ({ walletAddress, tier, active }: { walletAddress: string; tier: string; active: boolean }) => {
      const response = await fetch(`/api/admin/users/${walletAddress}/subscription`, {
        method: 'PATCH',
        body: JSON.stringify({ subscriptionTier: tier, subscriptionActive: active }),
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': address || ''
        }
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update subscription');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Subscription Updated",
        description: "User subscription has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      setEditingUser(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update subscription",
        variant: "destructive",
      });
    }
  });

  const handleEditUser = (user: WalletUser) => {
    setEditingUser(user);
    setEditTier(user.subscriptionTier);
    setEditActive(user.subscriptionActive);
  };

  const handleSaveSubscription = () => {
    if (!editingUser) return;
    updateSubscriptionMutation.mutate({
      walletAddress: editingUser.walletAddress,
      tier: editTier,
      active: editActive
    });
  };

  const filteredUsers = users.filter(user => 
    user.walletAddress.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'elite': return <Crown className="h-4 w-4 text-warning" />;
      case 'pro': return <Sparkles className="h-4 w-4 text-primary" />;
      default: return <Zap className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getTierBadge = (tier: string, active: boolean) => {
    if (!active && tier !== 'free') {
      return <Badge variant="secondary" className="text-muted-foreground">Inactive</Badge>;
    }
    switch (tier) {
      case 'elite':
        return <Badge className="bg-warning/15 text-warning border-warning/30">Elite</Badge>;
      case 'pro':
        return <Badge className="bg-primary/15 text-primary border-primary/30">AI Pro</Badge>;
      default:
        return <Badge variant="secondary">Free</Badge>;
    }
  };

  if (!address) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Connect Wallet</h2>
            <p className="text-muted-foreground">
              Please connect your admin wallet to access this panel.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-8 text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">
              You don't have admin privileges to access this panel.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-display font-bold">Admin Panel</h1>
        </div>
        <p className="text-muted-foreground">
          Manage user subscriptions and platform access
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{users.length}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {users.filter(u => u.subscriptionTier === 'pro' && u.subscriptionActive).length}
                </p>
                <p className="text-xs text-muted-foreground">AI Pro Subscribers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
                <Crown className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {users.filter(u => u.subscriptionTier === 'elite' && u.subscriptionActive).length}
                </p>
                <p className="text-xs text-muted-foreground">Elite Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/15">
                <Check className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {users.filter(u => u.builderCodeApproved).length}
                </p>
                <p className="text-xs text-muted-foreground">Onboarded Users</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/15">
                <Mail className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{leads.length}</p>
                <p className="text-xs text-muted-foreground">Email Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>View and manage all registered users</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by wallet or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                  data-testid="input-search-users"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetch()}
                disabled={isLoading}
                data-testid="button-refresh-users"
              >
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "No users match your search" : "No registered users yet"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet Address</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Subscribed On</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                      <TableCell className="font-mono text-xs">
                        {user.walletAddress.slice(0, 6)}...{user.walletAddress.slice(-4)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {user.email || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTierIcon(user.subscriptionTier)}
                          <span className="capitalize text-xs">{user.subscriptionTier === 'pro' ? 'AI Pro' : user.subscriptionTier}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getTierBadge(user.subscriptionTier, user.subscriptionActive)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.subscribedAt
                          ? new Date(user.subscribedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.subscriptionExpiresAt
                          ? new Date(user.subscriptionExpiresAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditUser(user)}
                          data-testid={`button-edit-${user.id}`}
                        >
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Email Leads Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-500" />
                Email Leads
              </CardTitle>
              <CardDescription>Captured email addresses from the wallet gate</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const csv = [
                    ["Email", "Name", "Source", "Wallet", "Date"].join(","),
                    ...leads.map(l => [
                      l.email,
                      l.name || "",
                      l.source || "",
                      l.walletAddress || "",
                      l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ""
                    ].join(","))
                  ].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "equilibrium-leads.csv";
                  a.click();
                }}
                data-testid="button-export-leads"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => refetchLeads()}
                disabled={leadsLoading}
                data-testid="button-refresh-leads"
              >
                <RefreshCw className={cn("h-4 w-4", leadsLoading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {leadsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading leads...</div>
          ) : leads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No email leads captured yet</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                      <TableCell className="font-medium">{lead.email}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {lead.source || "landing"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {lead.walletAddress ? `${lead.walletAddress.slice(0, 6)}...${lead.walletAddress.slice(-4)}` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent data-testid="modal-edit-subscription">
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>
              Update subscription settings for this user
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-6 py-4">
              <div>
                <Label className="text-muted-foreground">Wallet Address</Label>
                <p className="font-mono text-sm mt-1">
                  {editingUser.walletAddress}
                </p>
              </div>
              
              {editingUser.email && (
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="text-sm mt-1">{editingUser.email}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Subscription Tier</Label>
                <Select value={editTier} onValueChange={(v) => setEditTier(v as 'free' | 'pro' | 'elite')}>
                  <SelectTrigger data-testid="select-tier">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        Free (Starter)
                      </div>
                    </SelectItem>
                    <SelectItem value="pro">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        AI Pro (£50/mo)
                      </div>
                    </SelectItem>
                    <SelectItem value="elite">
                      <div className="flex items-center gap-2">
                        <Crown className="h-4 w-4" />
                        Elite Mentoring (£500/mo)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Subscription Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Enable or disable the subscription
                  </p>
                </div>
                <Switch
                  checked={editActive}
                  onCheckedChange={setEditActive}
                  data-testid="switch-active"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setEditingUser(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveSubscription}
                  disabled={updateSubscriptionMutation.isPending}
                  data-testid="button-save-subscription"
                >
                  {updateSubscriptionMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
