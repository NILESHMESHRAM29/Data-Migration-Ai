import { VITE_ENCRYPTION_KEY } from '../config/env';

/**
 * Converts a hex-encoded string (optionally JSON-quoted with surrounding double-quotes) into a `Uint8Array`.
 * Used to decode the `VITE_ENCRYPTION_KEY` hex string into raw bytes for `SubtleCrypto.importKey`.
 * @param hex - A hex string where every two characters represent one byte (e.g. `'deadbeef'`)
 * @returns A `Uint8Array` of the decoded bytes
 * @throws `Error` if the input cannot be parsed as a valid hex string
 */
const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  const pairs = hex.replace(/^"(.*)"$/, '$1').match(/.{2}/g);
  if (!pairs) throw new Error('Invalid hex key');
  const arr = new Uint8Array(pairs.length);
  pairs.forEach((b, i) => { arr[i] = parseInt(b, 16); });
  return arr;
};

/**
 * Decodes a Base64 string into a `Uint8Array`.
 * Used to decode the combined IV + ciphertext blob received from the server or produced by `encrypt`.
 * @param b64 - A valid Base64 encoded string
 * @returns A `Uint8Array` containing the decoded binary data
 */
const fromBase64 = (b64: string): Uint8Array<ArrayBuffer> => {
  const str = atob(b64);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i);
  }
  return arr;
};

/**
 * Encodes a `Uint8Array` of binary data into a Base64 string.
 * Used to produce the wire format for the combined IV + ciphertext before writing to storage or the API.
 * @param bytes - Binary data to encode
 * @returns A Base64 encoded string representation of `bytes`
 */
const toBase64 = (bytes: Uint8Array<ArrayBuffer>): string => {
  let str = '';
  bytes.forEach(b => { str += String.fromCharCode(b); });
  return btoa(str);
};

/** sessionStorage key that holds the base64-encoded raw bytes of the per-session localStorage encryption key. */
const STORAGE_KEY_ID = '_sk';

/** Cached in-memory AES-GCM key for localStorage operations — sourced from sessionStorage, not the bundle. */
let cachedStorageKey: CryptoKey | null = null;

/** Cached in-memory AES-GCM key for API payload operations — sourced from VITE_ENCRYPTION_KEY. */
let cachedApiKey: CryptoKey | null = null;

/**
 * Returns the AES-256-GCM `CryptoKey` used exclusively for localStorage encryption and decryption.
 *
 * The key is **never derived from a bundle constant** — it is either restored from `sessionStorage`
 * (survives page refreshes within the same tab) or generated fresh via `crypto.getRandomValues`.
 * A fresh random key is stored in `sessionStorage` as base64 so it can be restored across page reloads
 * within the same tab without re-appearing in any source file or build artifact.
 *
 * When `sessionStorage` is empty (new tab, or after `clearStorageKey()` on logout), a new key is
 * generated. Any existing localStorage data encrypted with a prior key becomes unreadable —
 * `getItem` returns `null` which triggers a fresh login. This is intentional: each browser tab
 * is an independent authenticated session.
 *
 * @returns A Promise resolving to the cached AES-GCM CryptoKey for localStorage
 */
const getStorageKey = async (): Promise<CryptoKey> => {
  if (cachedStorageKey) return cachedStorageKey;

  const stored = sessionStorage.getItem(STORAGE_KEY_ID);
  if (stored) {
    cachedStorageKey = await globalThis.crypto.subtle.importKey(
      'raw',
      fromBase64(stored),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
    return cachedStorageKey;
  }

  // Generate a fresh random 256-bit key for this session.
  // Must be extractable here so we can export and persist the raw bytes to sessionStorage.
  const key = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const exported = await globalThis.crypto.subtle.exportKey('raw', key) as ArrayBuffer;
  sessionStorage.setItem(STORAGE_KEY_ID, toBase64(new Uint8Array(exported)));

  // Re-import as non-extractable for all subsequent in-memory operations.
  cachedStorageKey = await globalThis.crypto.subtle.importKey(
    'raw',
    exported,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
  return cachedStorageKey;
};

/**
 * Imports the AES-GCM `CryptoKey` from the hex-encoded `VITE_ENCRYPTION_KEY` env variable.
 * Used **only** for API payload encryption/decryption — the key must match what the backend holds.
 * The result is cached in module scope so `SubtleCrypto.importKey` is called at most once per session.
 * @returns A Promise resolving to the cached CryptoKey for API payload operations
 */
const getApiKey = async (): Promise<CryptoKey> => {
  if (!cachedApiKey) {
    cachedApiKey = await globalThis.crypto.subtle.importKey(
      'raw',
      hexToBytes(VITE_ENCRYPTION_KEY),
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    );
  }
  return cachedApiKey;
};

/**
 * Clears the per-session localStorage encryption key from both the in-memory cache and `sessionStorage`.
 * Called by `clearAll()` on logout so the next login generates a completely fresh key.
 */
export const clearStorageKey = (): void => {
  cachedStorageKey = null;
  sessionStorage.removeItem(STORAGE_KEY_ID);
};

/**
 * Shared AES-256-GCM encrypt implementation. Prepends a fresh random 12-byte IV to the ciphertext.
 * @param key - The CryptoKey to encrypt with
 * @param value - Plaintext string to encrypt
 * @returns Base64 string: 12-byte IV + ciphertext
 */
const _encryptWith = async (key: CryptoKey, value: string): Promise<string> => {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value),
  );
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);
  return toBase64(combined);
};

/**
 * Shared AES-256-GCM decrypt implementation. Reads the 12-byte IV from the start of the blob.
 * @param key - The CryptoKey to decrypt with
 * @param value - Base64 string produced by `_encryptWith` (IV + ciphertext)
 * @returns Decrypted plaintext string
 * @throws When the ciphertext is malformed or was encrypted with a different key
 */
const _decryptWith = async (key: CryptoKey, value: string): Promise<string> => {
  const combined = fromBase64(value);
  const plaintext = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.slice(0, 12) },
    key,
    combined.slice(12),
  );
  return new TextDecoder().decode(plaintext);
};

/**
 * AES-256-GCM encrypts a plaintext string for safe storage in localStorage.
 * Uses the per-session random key from `sessionStorage` — the key is never present in any bundle.
 * @param value - The plaintext string to encrypt
 * @returns A Base64 string containing the 12-byte IV followed by the AES-GCM ciphertext
 */
export const encrypt = async (value: string): Promise<string> =>
  _encryptWith(await getStorageKey(), value);

/**
 * AES-256-GCM decrypts a Base64-encoded string previously produced by `encrypt`.
 * Uses the per-session random key from `sessionStorage`.
 * @param value - Base64 string produced by `encrypt` (IV prepended to ciphertext)
 * @returns The decrypted plaintext string
 * @throws When the ciphertext is malformed or was encrypted with a different key
 */
export const decrypt = async (value: string): Promise<string> =>
  _decryptWith(await getStorageKey(), value);

/**
 * AES-256-GCM encrypts any JSON-serializable value for safe transmission to the API.
 * Uses `VITE_ENCRYPTION_KEY` — the key shared with the backend for request payload encryption.
 * @param data - Any JSON-serializable value (object, array, string, etc.) to encrypt
 * @returns A Base64 string containing the 12-byte IV followed by the AES-GCM ciphertext
 */
export const encryptPayload = async (data: unknown): Promise<string> =>
  _encryptWith(await getApiKey(), JSON.stringify(data));

/**
 * AES-256-GCM decrypts a Base64-encoded payload received from the API, then JSON-parses the result.
 * Uses `VITE_ENCRYPTION_KEY` — the key shared with the backend for response payload decryption.
 * @param encrypted - Base64 string produced by the server's AES-256-GCM encryption (IV + ciphertext)
 * @returns The decrypted value parsed from JSON — caller is responsible for casting to the expected type
 */
export const decryptPayload = async (encrypted: string): Promise<unknown> =>
  JSON.parse(await _decryptWith(await getApiKey(), encrypted)) as unknown;
