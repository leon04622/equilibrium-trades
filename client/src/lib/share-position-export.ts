import type { SharePositionSnapshot } from "@/lib/share-position-types";

const W = 1040;
const H = 600;

function fmtPrice(p: number): string {
  if (p >= 10000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return p.toFixed(4);
}

/** Rasterize branded share card to PNG (no html2canvas). */
export function renderSharePositionPng(data: SharePositionSnapshot): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas not supported"));
      return;
    }

    const profit = data.roePct >= 0;
    const accent = profit ? "#22c55e" : "#ef4444";
    const accentDim = profit ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)";
    const primary = "#3b82f6";

    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, W, H);

    // Decorative rings (right)
    const cx = W * 0.82;
    const cy = H * 0.48;
    for (let i = 5; i >= 1; i--) {
      ctx.beginPath();
      ctx.arc(cx, cy, 40 + i * 42, 0, Math.PI * 2);
      ctx.strokeStyle = profit ? `rgba(34,197,94,${0.08 + i * 0.04})` : `rgba(239,68,68,${0.08 + i * 0.04})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Brand row
    ctx.fillStyle = "rgba(59,130,246,0.2)";
    ctx.fillRect(48, 48, 56, 56);
    ctx.strokeStyle = "rgba(59,130,246,0.4)";
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 48, 56, 56);
    ctx.fillStyle = primary;
    ctx.font = "bold 28px system-ui, sans-serif";
    ctx.fillText("E", 64, 88);

    ctx.fillStyle = "#f1f5f9";
    ctx.font = "600 32px system-ui, sans-serif";
    ctx.fillText("Equilibrium", 120, 88);

    // Coin + side
    ctx.font = "bold 44px ui-monospace, monospace";
    ctx.fillText(data.coin, 48, 160);

    const sideLabel = `${data.side === "long" ? "LONG" : "SHORT"} ${data.leverage}x`;
    ctx.font = "bold 22px system-ui, sans-serif";
    const badgeW = ctx.measureText(sideLabel).width + 32;
    ctx.fillStyle = accentDim;
    ctx.fillRect(48, 172, badgeW, 40);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(48, 172, badgeW, 40);
    ctx.fillStyle = accent;
    ctx.fillText(sideLabel, 64, 200);

    // PnL (USD + ROE)
    ctx.font = "bold 72px ui-monospace, monospace";
    ctx.fillStyle = accent;
    const pnlAbs = Math.abs(data.unrealizedPnl);
    const pnlStr =
      pnlAbs >= 1000
        ? pnlAbs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : pnlAbs.toFixed(2);
    const pnlText = `${data.unrealizedPnl >= 0 ? "+" : "-"}$${pnlStr}`;
    ctx.fillText(pnlText, 48, 290);

    ctx.font = "bold 44px ui-monospace, monospace";
    ctx.fillStyle = accent;
    const roeText = `${data.roePct >= 0 ? "+" : ""}${data.roePct.toFixed(1)}% ROE`;
    ctx.fillText(roeText, 48, 350);

    // Prices
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillText("ENTRY PRICE", 48, H - 100);
    ctx.fillText("MARK PRICE", 280, H - 100);
    ctx.fillStyle = "#f1f5f9";
    ctx.font = "500 28px ui-monospace, monospace";
    ctx.fillText(fmtPrice(data.entryPrice), 48, H - 60);
    ctx.fillText(fmtPrice(data.markPrice), 280, H - 60);

    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to create image"));
      },
      "image/png",
      1,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
