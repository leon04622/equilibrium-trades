import { getAddress } from "ethers";

/**
 * HyperEVM **CctpForwarder** hook payload for `TokenMessenger.depositForBurnWithHook` on the source chain.
 *
 * After Circle attestation, USDC is minted on HyperEVM to the forwarder; the forwarder reads this `hookData`
 * and credits **HyperCore** (perps vault by default) so funds do not sit idle on HyperEVM.
 *
 * Layout (bytes passed as `hookData`; built manually to match HL forwarder parsing):
 * - 24 bytes: UTF-8 magic `cctp-forward` (12 bytes) left-aligned, remainder zero-padded
 * - 4 bytes: version (uint32 big-endian, currently 0)
 * - 4 bytes: data length (uint32 big-endian, 0x18 = 24 bytes following)
 * - 20 bytes: HyperCore user address (the account that receives the credit)
 * - 4 bytes: destination dex id (uint32 big-endian; **0** = perps / trading account)
 *
 * @see https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore
 */
const HOOK_MAGIC = "cctp-forward";

function utf8ToHex(s: string): string {
  return Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Encode hook bytes for Circle CCTP burn → HyperEVM mint → HyperCore credit. */
export function encodeCctpForwardHookData(
  hyperCoreMintRecipient: string,
  hyperCoreDestinationDex: number = 0,
): `0x${string}` {
  const a = getAddress(hyperCoreMintRecipient);
  const magicHex = utf8ToHex(HOOK_MAGIC).padEnd(48, "0"); // 24-byte slot (must match HyperEVM forwarder)
  const version = "00000000";
  const dataLength = "00000018";
  const address = a.slice(2).toLowerCase();
  const dex = (hyperCoreDestinationDex >>> 0).toString(16).padStart(8, "0");
  return `0x${magicHex}${version}${dataLength}${address}${dex}` as `0x${string}`;
}
