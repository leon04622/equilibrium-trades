/**
 * On-screen proof of Hyperliquid ↔ UI mapping: raw frontendOpenOrders + parsed TP/SL for the selected coin.
 */
import { useMemo, useState } from "react";
import { useTrading } from "@/lib/trading-context";
import { selectTpSlOrders } from "@/lib/chart-tpsl-from-orders";
import { cn } from "@/lib/utils";

interface Props {
  coin: string;
  className?: string;
}

export function HlMirrorDebugPanel({ coin, className }: Props) {
  const [open, setOpen] = useState(true);
  const { positions, openOrders, hlFrontendOpenOrdersRaw, connected } = useTrading();

  const position = useMemo(() => positions.find((p) => p.coin === coin), [positions, coin]);
  const parsed = useMemo(
    () => selectTpSlOrders(coin, position, openOrders),
    [coin, position, openOrders],
  );

  const coinRaw = useMemo(() => {
    if (!Array.isArray(hlFrontendOpenOrdersRaw)) return [];
    return hlFrontendOpenOrdersRaw.filter((o: any) => o?.coin === coin);
  }, [hlFrontendOpenOrdersRaw, coin]);

  if (!connected) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-20 right-2 z-[100] max-w-[min(96vw,420px)] rounded-md border border-amber-500/40 bg-[#0d1117]/95 text-left shadow-xl backdrop-blur-sm font-mono text-[10px]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 border-b border-amber-500/30 px-2 py-1.5 text-amber-200/90 hover:bg-white/5"
      >
        <span className="font-semibold">HL mirror debug · {coin}</span>
        <span className="text-amber-400/80">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="max-h-[40vh] overflow-auto p-2 space-y-2 text-[#c9d1d9]">
          <div>
            <div className="text-amber-400/90 mb-0.5">Parsed (selectTpSlOrders)</div>
            <pre className="whitespace-pre-wrap break-all rounded bg-black/40 p-1.5 text-[9px]">
              {JSON.stringify(
                {
                  tpPrice: parsed.tpPrice,
                  slPrice: parsed.slPrice,
                  tpOid: parsed.tpOrder?.oid,
                  slOid: parsed.slOrder?.oid,
                  entry: position?.entryPrice,
                  size: position?.size,
                  side: position?.side,
                },
                null,
                2,
              )}
            </pre>
          </div>
          <div>
            <div className="text-amber-400/90 mb-0.5">Raw API — frontendOpenOrders (this coin only)</div>
            <pre className="whitespace-pre-wrap break-all rounded bg-black/40 p-1.5 text-[9px]">
              {coinRaw.length === 0 ? "(no rows for this coin)" : JSON.stringify(coinRaw, null, 2)}
            </pre>
          </div>
          <div>
            <div className="text-amber-400/90 mb-0.5">Full raw array length</div>
            <pre className="rounded bg-black/40 p-1.5 text-[9px]">
              {Array.isArray(hlFrontendOpenOrdersRaw) ? hlFrontendOpenOrdersRaw.length : "—"}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
