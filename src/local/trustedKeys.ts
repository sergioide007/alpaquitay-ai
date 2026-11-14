/**
 * Ed25519 public keys (raw 32 bytes, base64) allowed to sign model manifests.
 *
 * Generate the pair on YOUR machine:   npm run cdn:keygen -- --out ~/.alpaquitay/manifest-signing.pem
 * and paste the printed public key here. Keep the private key out of the repo and out of CI logs.
 * Several keys may be listed to rotate: add the new one, release, sign with it, drop the old one later.
 *
 * Empty = the local engine refuses every manifest (fails closed); scripts/verify-marketplace.js
 * refuses to certify a release in that state.
 */
export const PROJECT_PUBLIC_KEYS: readonly string[] = [
  // keyId 0150d2f28282ca35 — project signing key, generated 2026-11-14.
  'gR3JZlILGT1hqikFnIgGmQOkHkHvcLWDCpcNeEoF0rI=',
];
