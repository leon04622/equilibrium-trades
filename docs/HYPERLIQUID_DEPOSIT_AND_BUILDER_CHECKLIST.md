# Hyperliquid Deposit And Builder Checklist

This is the source-of-truth checklist for Equilibrium's Hyperliquid funding and builder-fee wiring.

Official references:

- Circle CCTP HyperCore guide: `https://developers.circle.com/cctp/howtos/transfer-usdc-from-arbitrum-to-hypercore`
- Circle HyperCore contract addresses: `https://developers.circle.com/cctp/references/hypercore-contract-addresses`
- Hyperliquid builder codes: `https://hyperliquid.gitbook.io/hyperliquid-docs/trading/builder-codes`

## 1. Deposit flow that should be live

Equilibrium should use this exact route for deposits:

1. User connects wallet on Arbitrum One.
2. Portfolio signs an EIP-3009 `ReceiveWithAuthorization` message on Arbitrum USDC.
3. Portfolio calls Circle's `CctpExtension.batchDepositForBurnWithAuth` on Arbitrum.
4. Circle emits `MessageSent`, Iris returns the attestation, and the app polls for it.
5. Portfolio switches the wallet to HyperEVM and calls `receiveMessage(...)`.
6. The HyperEVM `CctpForwarder` forwards the minted USDC into HyperCore.
7. By default, `destinationDex = 0`, so the credit goes to perps. Use `4294967295` for spot.

Important:

- Do not use transfer-to-bridge patterns.
- Do not rely on a look-alike bridge recipient.
- `mintRecipient` and `destinationCaller` must both be the HyperEVM `CctpForwarder`.
- The forward fee is deducted from the transferred amount.

## 2. Mainnet values currently expected

These are the official mainnet defaults the code now expects unless env vars override them:

- `CCTP_EXTENSION_ADDRESS`: `0xA95d9c1F655341597C94393fDdc30cf3c08E4fcE`
- `CCTP_FORWARDER_ADDRESS`: `0xb21D281DEdb17AE5B501F6AA8256fe38C4e45757`
- `CCTP_USDC_ADDRESS`: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
- `CCTP_SOURCE_DOMAIN`: `3` for Arbitrum
- `CCTP_DESTINATION_DOMAIN`: `19` for HyperEVM
- `CCTP_ARBITRUM_CHAIN_ID`: `42161`
- `CCTP_HYPEREVM_CHAIN_ID`: `999`
- `CCTP_USDC_EIP712_NAME`: `USD Coin`
- `CCTP_USDC_EIP712_VERSION`: `2`

Hyperliquid safety reference:

- Verified Hyperliquid Bridge2 on Arbitrum: `0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7`
- Known wrong legacy address to avoid: `0x2df1c51e09a4ab13229630fc358d49776d67093e`

## 3. Builder fee wiring that should be live

Builder fees are separate from deposits. They apply to routed orders only.

Required builder:

- Builder address: `0xad9be64fd7a35d99a138b87cb212baefbcdcf045`
- Max fee approval used by Equilibrium: `0.0003`
- Order wire fee `f`: `3` tenths of a basis point = `0.03%`

Correct Hyperliquid behavior:

1. The user signs Hyperliquid `approveBuilderFee` with their main wallet.
2. Orders include `builder: { b, f }` only after approval is confirmed.
3. Builder fees are not attached before approval.
4. Builder approval can be queried from Hyperliquid's Info API.

Important:

- Hyperliquid requires the builder to have at least 100 USDC in perps account value.
- Builder codes do not affect deposits.
- Builder codes should never be confused with the plain Equilibrium sign-in message.

## 4. Equilibrium-specific split of responsibilities

This project uses two different approval concepts:

- Equilibrium sign-in message:
  Used to verify wallet ownership and mark the CRM/user profile as linked in the app.
- Hyperliquid `approveBuilderFee`:
  The actual on-chain Hyperliquid builder-fee approval required before routed orders can include the builder field.

Both are expected:

- The app sign-in message helps Equilibrium track onboarding and account state.
- The Hyperliquid approval is what enables builder fee attribution on exchange orders.

## 5. Files to audit when something breaks

- `client/src/lib/cctp-deposit.ts`
- `client/src/lib/cctp-forwarder-hook.ts`
- `client/src/lib/hyperliquid-client.ts`
- `client/src/lib/hyperliquid-platform-config.ts`
- `server/deposit-service.ts`
- `server/routes.ts`

## 6. Quick manual verification

Deposit:

1. Open Portfolio with a wallet on Arbitrum One.
2. Confirm the app loads deposit config successfully.
3. Start a deposit and verify the wallet prompts for EIP-3009 authorization.
4. Confirm the Arbitrum transaction targets `CctpExtension`, not TokenMessenger directly.
5. Confirm attestation polling starts after `MessageSent`.
6. Confirm the wallet switches to HyperEVM for `receiveMessage`.
7. Confirm funds appear in HyperCore perps balance after forwarding.

Builder:

1. Trigger the trading setup flow.
2. Confirm Hyperliquid `approveBuilderFee` is signed by the main wallet.
3. Place an order after approval.
4. Confirm the order payload includes `builder: { b: 0xad9be64fd7a35d99a138b87cb212baefbcdcf045, f: 3 }`.
5. Confirm users without approval can still trade, but without the `builder` field attached.
