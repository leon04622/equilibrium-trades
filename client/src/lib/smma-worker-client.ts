import type { Time } from "lightweight-charts";
import { calcSMMA } from "./smma-math";
import type { SmmaWorkerResult } from "../workers/smma.worker";

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("../workers/smma.worker.ts", import.meta.url), { type: "module" });
    return worker;
  } catch {
    return null;
  }
}

/** Same outputs as in-thread calcSMMA; prefers background worker when available. */
export function computeSmmaSeries(
  closes: number[],
  times: Time[],
): Promise<Omit<SmmaWorkerResult, "id">> {
  if (closes.length < 21) {
    return Promise.resolve({
      sma21: [],
      sma200: [],
      last21: null,
      last200: null,
      smaStatus: null,
    });
  }

  const w = getWorker();
  if (!w) {
    const sma21 = calcSMMA(closes, times, 21);
    const sma200 = closes.length >= 200 ? calcSMMA(closes, times, 200) : [];
    const last21 = sma21.length > 0 ? sma21[sma21.length - 1]! : null;
    const last200 = sma200.length > 0 ? sma200[sma200.length - 1]! : null;
    let smaStatus: SmmaWorkerResult["smaStatus"] = null;
    if (last21 && last200) {
      smaStatus = {
        sma21: last21.value,
        sma200: last200.value,
        isBullish: last21.value > last200.value,
      };
    }
    return Promise.resolve({ sma21, sma200, last21, last200, smaStatus });
  }

  const id = ++seq;
  const syncFallback = (): Omit<SmmaWorkerResult, "id"> => {
    const sma21 = calcSMMA(closes, times, 21);
    const sma200 = closes.length >= 200 ? calcSMMA(closes, times, 200) : [];
    const last21 = sma21.length > 0 ? sma21[sma21.length - 1]! : null;
    const last200 = sma200.length > 0 ? sma200[sma200.length - 1]! : null;
    let smaStatus: SmmaWorkerResult["smaStatus"] = null;
    if (last21 && last200) {
      smaStatus = {
        sma21: last21.value,
        sma200: last200.value,
        isBullish: last21.value > last200.value,
      };
    }
    return { sma21, sma200, last21, last200, smaStatus };
  };

  return new Promise((resolve) => {
    const onMsg = (ev: MessageEvent<SmmaWorkerResult>) => {
      if (ev.data?.id !== id) return;
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      const { id: _i, ...rest } = ev.data;
      resolve(rest);
    };
    const onErr = () => {
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      resolve(syncFallback());
    };
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
    try {
      w.postMessage({ id, closes, times });
    } catch {
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      resolve(syncFallback());
    }
  });
}
