# dash-core-sdk
A Javascript SDK for Dash Core chain

## Shared masternode digests (Dash Core v24)

These reproduce Dash Core's consensus digests byte for byte and work in Node and browsers.

- `consentHash(tx: Transaction): string` — `CProRegTx::MakeSharedRegConsentHash`. The digest a
  participant signs with the owner key of their share. Requires a v3 `ProRegTX` payload with at least one
  share and one join signature per share; it deliberately does not cover `scriptSigs` or `joinSigs`.
  Reproduced by `protx shared_register_prepare`, which prints `consentHash`.
- `dissolveSignHash(tx: Transaction, sigCount: number): string` — `CProDisTx::MakeSignHash`. Binds the
  inputs, outputs, proTxHash, actor index and signature count (1 = unilateral, n = unanimous).
  Reproduced by `protx shared_dissolve_prepare`, which prints `signHash`.
- `signCompact(hash, privateKey)` / `recoverCompact(hash, signature)` / `verifyCompact(hash, signature, keyId)`
  — 65-byte compact ECDSA with the recovery id in the header, as Core's `CPubKey::CompactSign` and
  `RecoverCompact`. `verifyCompact` returns `false` for malformed or non-canonical (high-S) signatures;
  `recoverCompact` throws. Core rejects high-S signatures, so produce them with `lowS: true`.