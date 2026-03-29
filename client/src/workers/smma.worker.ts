import { calcSMMA } from "../lib/smma-math";
import type { Time } from "lightweight-charts";

export type SmmaWorkerResult = {
  id: number;
  sma21: { time: Time; value: number }[];
  sma200: { time: Time; value: number }[];
  last21: { time: Time; value: number } | null;
  last200: { time: Time; value: number } | null;
  smaStatus: { sma21: number; sma200: number; isBullish: boolean } | null;
};

self.onmessage = (e: MessageEvent<{ id: number; closes: number[]; times: Time[] }>) => {
  const { id, closes, times } = e.data;
  if (!closes?.length || closes.length < 21) {
    const empty: SmmaWorkerResult = {
      id,
      sma21: [],
      sma200: [],
      last21: null,
      last200: null,
      smaStatus: null,
    };
    self.postMessage(empty);
    return;
  }
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
  const out: SmmaWorkerResult = { id, sma21, sma200, last21, last200, smaStatus };
  self.postMessage(out);
};
