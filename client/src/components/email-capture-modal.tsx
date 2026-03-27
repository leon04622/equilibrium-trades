import { useEffect, useState } from "react";
import { useWallet } from "@/lib/wallet-context";
import { CRM_EMAIL_KEY, crmEmailPromptDismissedStorageKey } from "@/components/wallet-crm-sync";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

/**
 * After wallet connect, if the user has no email on file, prompt once to capture it for CRM (Mongo + Postgres).
 */
export function EmailCaptureModal() {
  const { address, isConnected } = useWallet();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const stored = (() => {
          try {
            return localStorage.getItem(CRM_EMAIL_KEY)?.trim() || "";
          } catch {
            return "";
          }
        })();
        if (stored) return;

        try {
          if (localStorage.getItem(crmEmailPromptDismissedStorageKey(address)) === "1") return;
        } catch {
          /* ignore */
        }

        const res = await fetch(`/api/wallet-user/${encodeURIComponent(address)}`);
        if (!res.ok || cancelled) return;
        const j = (await res.json()) as { exists?: boolean; email?: string | null };
        if (cancelled) return;
        if (j.exists && !(j.email && String(j.email).trim())) {
          setOpen(true);
        }
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const submit = async () => {
    const trimmed = email.trim();
    if (!address || !trimmed) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    const basic = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basic.test(trimmed)) {
      toast({ title: "Invalid email", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      let ok = false;
      const reg = await fetch("/api/wallet-user/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, email: trimmed }),
      });
      if (reg.ok) ok = true;
      const patch = await fetch(`/api/wallet-user/${encodeURIComponent(address)}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (patch.ok) ok = true;
      if (!ok) {
        throw new Error("Could not save email");
      }
      try {
        localStorage.setItem(CRM_EMAIL_KEY, trimmed);
        localStorage.setItem(crmEmailPromptDismissedStorageKey(address), "1");
      } catch {
        /* ignore */
      }
      toast({ title: "Thanks!", description: "Your email was saved to your profile." });
      setOpen(false);
    } catch {
      toast({ title: "Save failed", description: "Try again or add email in Settings.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const persistDismiss = () => {
    if (!address) return;
    try {
      localStorage.setItem(crmEmailPromptDismissedStorageKey(address), "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) persistDismiss();
        setOpen(next);
      }}
    >
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Stay in touch</DialogTitle>
          <DialogDescription>
            Add an email for your account so we can reach you about billing, support, and product updates. You can
            change it anytime in Settings.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="crm-email-capture">Email</Label>
          <Input
            id="crm-email-capture"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              persistDismiss();
              setOpen(false);
            }}
            disabled={busy}
          >
            Not now
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
