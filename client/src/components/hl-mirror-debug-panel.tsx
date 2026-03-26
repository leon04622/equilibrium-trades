/**
 * Diagnostic panel: compares Hyperliquid `frontendOpenOrders` (raw JSON) to parsed TP/SL used by the chart.
 *
 * How to use:
 * 1. Wallet connected + Hyperliquid session ready (banner cleared).
 * 2. Trading page → chart engine **AI** (not TV). You must be on /trading with the chart visible.
 * 3. Raw rows filtered by `coin` must match the symbol in the header (e.g. BTC). If HL uses a different `coin` string, parsed will be empty.
 * 4. If raw shows TP/SL triggers but parsed tpPrice/slPrice are null → classification bug in chart-tpsl-from-orders / trading-context mapping.
 * 5. If raw is empty but hl.xyz shows orders → wrong wallet address or fetch error (see error line).
 *
 * Hide: `localStorage.setItem("hl_mirror_debug","0")` and reload. Show again: remove key or set to `1`.
 */
import { useMemo, useState, useEffect } from "react";
import { useTrading } from "@/lib/trading-context";
import { selectTpSlOrders } from "@/lib/chart-tpsl-from-orders";
import { cn } from "@/lib/utils";

interface Props {
  coin: string;
  className?: string;
}

function fmtAddr(a: string): string {
  if (!a || a.length < 10) return a || "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function relTime(ms: number | null): string {
  if (ms == null) return "never";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export function HlMirrorDebugPanel({ coin, className }: Props) {
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("hl_mirror_debug") === "0");
    } catch {
      setDismissed(false);
    }
  }, []);

  const {
    positions,
    openOrders,
    hlFrontendOpenOrdersRaw,
    hlAccountSyncAt,
    hlAccountFetchError,
    connected,
    address,
    isLoadingAccount,
    refreshAccount,
  } = useTrading();

  const position = useMemo(() => positions.find((p) => p.coin === coin), [positions, coin]);
  const parsed = useMemo(
    () => selectTpSlOrders(coin, position, openOrders),
    [coin, position, openOrders],
  );

  const coinRaw = useMemo(() => {
    if (!Array.isArray(hlFrontendOpenOrdersRaw)) return [];
    return hlFrontendOpenOrdersRaw.filter((o: any) => o?.coin === coin);
  }, [hlFrontendOpenOrdersRaw, coin]);

  const allCoinsInRaw = useMemo(() => {
    if (!Array.isArray(hlFrontendOpenOrdersRaw)) return [] as string[];
    const s = new Set<string>();
    for (const o of hlFrontendOpenOrdersRaw as any[]) {
      if (o && typeof o.coin === "string") s.add(o.coin);
    }
    return [...s].sort();
  }, [hlFrontendOpenOrdersRaw]);

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-32 right-2 z-[200] max-w-[min(96vw,440px)] rounded-md border border-amber-500/50 bg-[#0d1117]/98 text-left shadow-2xl backdrop-blur-sm font-mono text-[10px] text-[#c9d1d9]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 border-b border-amber-500/30 px-2 py-1.5 text-left text-amber-200/95 hover:bg-white/5"
      >
        <span className="font-semibold">HL mirror debug · chart coin: {coin}</span>
        <span className="shrink-0 text-amber-400/80">{open ? "▼" : "▶"}</span>
      </button>
      {open && (
        <div className="max-h-[min(52vh,420px)] overflow-auto p-2 space-y-2">
          {!connected && (
            <p className="rounded border border-amber-600/40 bg-amber-950/40 p-2 text-amber-100/90 leading-snug">
              <strong>Wallet not connected.</strong> The panel only loads after you connect — then we poll{" "}
              <code className="text-amber-300/90">frontendOpenOrders</code> for your address. Nothing here is local TP/SL
              fiction; if you see this, the chart also has no HL data.
            </p>
          )}

          {connected && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[9px]">
                <span>
                  Wallet <code className="text-cyan-300/90">{fmtAddr(address)}</code>
                </span>
                <span className="text-white/50">|</span>
                <span>Sync {relTime(hlAccountSyncAt)}</span>
                {isLoadingAccount && <span className="text-amber-400">loading…</span>}
                <button
                  type="button"
                  className="rounded border border-white/20 px-1.5 py-0.5 text-[9px] hover:bg-white/10"
                  onClick={() => void refreshAccount()}
                >
                  Refresh now
                </button>
              </div>
              {hlAccountFetchError && (
                <p className="rounded border border-red-500/40 bg-red-950/50 p-2 text-red-200/95 text-[9px] leading-snug">
                  <strong>Fetch error:</strong> {hlAccountFetchError}
                </p>
              )}
              <p className="text-[9px] leading-snug text-white/55">
                <strong className="text-white/70">Read this:</strong> “Raw (this coin)” = HL rows where{" "}
                <code className="text-white/80">coin === &quot;{coin}&quot;</code>. If your orders use another symbol, they
                appear under “All coin fields in raw” only — then we need to align chart symbol with HL.
              </p>
            </>
          )}

          <div>
            <div className="text-amber-400/90 mb-0.5">Parsed → chart (selectTpSlOrders)</div>
            <pre className="whitespace-pre-wrap break-all rounded bg-black/50 p-1.5 text-[9px]">
              {JSON.stringify(
                {
                  tpPrice: parsed.tpPrice,
                  slPrice: parsed.slPrice,
                  tpOid: parsed.tpOrder?.oid,
                  slOid: parsed.slOrder?.oid,
                  hasPosition: !!position,
                  entry: position?.entryPrice,
                  size: position?.size,
                  side: position?.side,
                },
                null,
                2,
              )}
            </pre>
            {!position && connected && (
              <p className="mt-1 text-[9px] text-amber-200/70">
                No position for <code>{coin}</code> in app state — parsed TP/SL can still be null even if you have trigger
                orders (parser ties some logic to position). Check raw rows below.
              </p>
            )}
          </div>

          <div>
            <div className="text-amber-400/90 mb-0.5">Raw API — frontendOpenOrders (coin === &quot;{coin}&quot;)</div>
            <pre className="whitespace-pre-wrap break-all rounded bg-black/50 p-1.5 text-[9px]">
              {coinRaw.length === 0
                ? "(no rows — HL returned no open orders for this exact coin string)"
                : JSON.stringify(coinRaw, null, 2)}
            </pre>
          </div>

          <div>
            <div className="text-amber-400/90 mb-0.5">Context openOrders count (normalized) / raw array length</div>
            <pre className="rounded bg-black/50 p-1.5 text-[9px]">
              {openOrders.length} / {Array.isArray(hlFrontendOpenOrdersRaw) ? hlFrontendOpenOrdersRaw.length : "—"}
            </pre>
          </div>

          <div>
            <div className="text-amber-400/90 mb-0.5">All coin fields in raw response</div>
            <pre className="whitespace-pre-wrap break-all rounded bg-black/50 p-1.5 text-[9px]">
              {allCoinsInRaw.length ? allCoinsInRaw.join(", ") : "(empty or not loaded)"}
            </pre>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-2 text-[9px]">
            <button
              type="button"
              className="text-white/45 underline hover:text-white/75"
              onClick={() => {
                try {
                  localStorage.setItem("hl_mirror_debug", "0");
                } catch {
                  /* ignore */
                }
                setDismissed(true);
              }}
            >
              Hide panel (set hl_mirror_debug=0)
            </button>
            <span className="text-white/35">·</span>
            <span className="text-white/45">Show again: clear localStorage key or set to 1</span>
          </div>
        </div>
      )}
    </div>
  );
}
