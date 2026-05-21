import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SharePositionCard } from "@/components/share-position-card";
import {
  defaultShareCaption,
  tradingPageShareUrl,
  type SharePositionSnapshot,
} from "@/lib/share-position-types";
import { downloadBlob, renderSharePositionPng } from "@/lib/share-position-export";
import { Download, Link2, Loader2 } from "lucide-react";
import type { Position } from "@/lib/trading-context";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: SharePositionSnapshot | null;
};

export function positionToShareSnapshot(
  pos: Position,
  markPrice: number,
): SharePositionSnapshot {
  const roe = pos.margin > 0 ? (pos.unrealizedPnl / pos.margin) * 100 : pos.unrealizedPnlPercent;
  return {
    coin: pos.coin,
    side: pos.side,
    leverage: pos.leverage,
    entryPrice: pos.entryPrice,
    markPrice,
    unrealizedPnl: pos.unrealizedPnl,
    roePct: roe,
  };
}

export function SharePositionDialog({ open, onOpenChange, position }: Props) {
  const { toast } = useToast();
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (position && open) {
      setCaption(defaultShareCaption(position));
    }
  }, [position, open]);

  if (!position) return null;

  const shareUrl = tradingPageShareUrl(position.coin);

  const handleSaveImage = async () => {
    setSaving(true);
    try {
      const blob = await renderSharePositionPng(position);
      downloadBlob(blob, `equilibrium-${position.coin}-${position.side}-roe.png`);
      toast({ title: "Image saved", description: "Share card downloaded to your device." });
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Could not create image",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async () => {
    const text = `${caption.trim()}\n${shareUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Caption and trading link copied." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleShareX = () => {
    const text = encodeURIComponent(`${caption.trim()}\n${shareUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[min(96vw,900px)] gap-0 overflow-hidden p-0 sm:max-w-[900px]"
        data-testid="share-position-dialog"
      >
        <DialogHeader className="border-b px-4 py-3 sm:px-6">
          <DialogTitle>Share position</DialogTitle>
          <DialogDescription className="sr-only">
            Preview and export your open position with Equilibrium branding.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 p-4 sm:grid-cols-[1fr_minmax(240px,300px)] sm:p-6">
          <SharePositionCard data={position} className="mx-auto w-full" />

          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label htmlFor="share-caption" className="text-xs text-muted-foreground">
                Customize your text
              </Label>
              <Textarea
                id="share-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                className="resize-none text-sm"
                data-testid="input-share-caption"
              />
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <Button
                type="button"
                className="w-full gap-2"
                onClick={() => void handleSaveImage()}
                disabled={saving}
                data-testid="button-share-save-image"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Save image
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full gap-2"
                onClick={() => void handleCopyLink()}
                data-testid="button-share-copy-link"
              >
                <Link2 className="h-4 w-4" />
                Copy link
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={handleShareX}
                data-testid="button-share-on-x"
              >
                Share on X
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
