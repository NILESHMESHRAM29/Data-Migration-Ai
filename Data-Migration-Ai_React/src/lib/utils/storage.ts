import { encrypt, decrypt, clearStorageKey } from './crypto';

const TOKEN_KEY = 'token';
const SESSION_KEY = 'session';

/**
 * JSON-serializes, AES-256 encrypts, and writes a value to localStorage under the given key.
 * All typed write helpers (`setToken`, `setAgentSession`) delegate here.
 * Pair with `getItem<T>` — only stores values that can round-trip through JSON.stringify.
 * @param key - The localStorage key to write to
 * @param value - The value to serialize and store
 */
export const setItem = async <T>(key: string, value: T): Promise<void> => {
  const encrypted = await encrypt(JSON.stringify(value));
  localStorage.setItem(key, encrypted);
};

/**
 * Reads, AES-256 decrypts, and JSON-parses a value stored under the given key.
 * All typed read helpers (`getToken`, `getAgentSession`) delegate here.
 * Returns `null` when the key is absent, the value is corrupt, or decryption fails
 * (e.g. data written before encryption was enabled — treated as a forced re-login).
 * @param key - The localStorage key to read from
 * @returns The deserialized value cast to `T`, or `null` if absent or unreadable
 */
export const getItem = async <T>(key: string): Promise<T | null> => {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(await decrypt(raw)) as T;
  } catch {
    return null;
  }
};

/**
 * Reads the JWT from localStorage, decrypts it, and returns it.
 * Returns `null` when no token has been stored (i.e. the user is not authenticated).
 * @returns A Promise resolving to the decrypted JWT string, or `null` if absent
 */
export const getToken = (): Promise<string | null> => getItem<string>(TOKEN_KEY);

/**
 * AES-256 encrypts the given JWT and writes it to localStorage under the token key.
 * Called once immediately after a successful login API response.
 * @param token - The raw JWT string returned by the login endpoint
 */
export const setToken = (token: string): Promise<void> => setItem(TOKEN_KEY, token);


/**
 * Clears all entries from localStorage and wipes the per-session encryption key from sessionStorage.
 * After this call, any existing localStorage ciphertext becomes permanently unreadable — the next
 * login generates a fresh random key, ensuring old session data cannot be decrypted by a future session.
 * Must be called on logout and on any 401 refresh failure to ensure no sensitive data is left behind.
 */
export const clearAll = (): void => {
  clearStorageKey();
  localStorage.clear();
};
