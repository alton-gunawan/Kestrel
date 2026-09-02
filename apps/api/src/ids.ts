/**
 * ID factory — opaque prefixed IDs (docs/02: "IDs are opaque strings").
 * Deterministic prefix, random suffix; never used as authorization.
 */
export function idFactory(prefix: string): string {
  const rand = globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${rand}`;
}

export function hashString(input: string): string {
  // FNV-1a — deterministic non-cryptographic hash for idempotency request
  // fingerprints. Collisions don't weaken security: keys are scoped per actor
  // and the stored response is only replayed when the hash matches.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
