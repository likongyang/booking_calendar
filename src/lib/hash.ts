import { createHash } from 'crypto';

/**
 * Hash an access key using SHA-256.
 * Returns a hex-encoded hash string.
 */
export function hashAccessKey(plainKey: string): string {
  return createHash('sha256').update(plainKey).digest('hex');
}

/**
 * Verify an access key against a stored value.
 * Supports:
 *   1. Super access key — if hash(plainKey) matches SUPER_ACCESS_KEY env var, always grant access.
 *   2. Hashed comparison — if stored value is a 64-char hex string, compare hashes.
 *   3. Legacy plain-text fallback — compare raw strings.
 */
export function verifyAccessKey(plainKey: string, storedKey: string): boolean {
  const hashed = hashAccessKey(plainKey);

  // Check super access key (master override)
  const superKey = process.env.SUPER_ACCESS_KEY;
  if (superKey && hashed === superKey) {
    return true;
  }

  // New hashed keys are always 64-char hex (SHA-256)
  if (storedKey.length === 64 && /^[0-9a-f]{64}$/.test(storedKey)) {
    return hashed === storedKey;
  }

  // Legacy plain-text fallback
  return plainKey === storedKey;
}
