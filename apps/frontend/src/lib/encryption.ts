/**
 * E2E Encryption Utilities
 *
 * Client-side encryption/decryption using Web Crypto API.
 * Uses ECDH for key exchange and AES-256-GCM for symmetric encryption.
 *
 * Key storage: Private keys are stored in IndexedDB, never sent to server.
 * Public keys: Stored on server for key exchange with other users.
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const ECDH_CURVE = 'P-256';

/**
 * IndexedDB database name and store for key storage.
 */
const DB_NAME = 'pulseweave-encryption';
const KEY_STORE = 'keys';

/**
 * Key pair structure stored locally.
 */
interface StoredKeyPair {
  keyId: string;
  publicKey: string; // Base64 encoded
  privateKey: CryptoKey;
  createdAt: number;
}

/**
 * Opens the IndexedDB database for key storage.
 */
function openKeyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        db.createObjectStore(KEY_STORE, { keyPath: 'keyId' });
      }
    };
  });
}

/**
 * Stores a key pair in IndexedDB.
 */
async function storeKeyPair(keyPair: StoredKeyPair): Promise<void> {
  const db = await openKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readwrite');
    const store = tx.objectStore(KEY_STORE);
    const request = store.put(keyPair);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Retrieves the current key pair from IndexedDB.
 */
async function getStoredKeyPair(): Promise<StoredKeyPair | null> {
  const db = await openKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readonly');
    const store = tx.objectStore(KEY_STORE);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const keys = request.result as StoredKeyPair[];
      // Return most recent key
      if (keys.length === 0) {
        resolve(null);
      } else {
        resolve(keys.sort((a, b) => b.createdAt - a.createdAt)[0]);
      }
    };
  });
}

/**
 * Helper to convert ArrayBuffer to Base64 to avoid stack overflow with spread operator.
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  let binary = '';
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Generates a new ECDH key pair for key exchange.
 *
 * @returns Object containing keyId, public key (base64), and the private CryptoKey.
 */
export async function generateKeyPair(): Promise<{
  keyId: string;
  publicKey: string;
  privateKey: CryptoKey;
}> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: ECDH_CURVE,
    },
    true, // extractable for public key export
    ['deriveKey', 'deriveBits']
  );

  // Export public key as base64
  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const publicKeyBase64 = arrayBufferToBase64(publicKeyBuffer);

  // Generate key ID
  const keyId = `key_${crypto.randomUUID().replace(/-/g, '')}`;

  // Store the key pair
  const storedPair: StoredKeyPair = {
    keyId,
    publicKey: publicKeyBase64,
    privateKey: keyPair.privateKey,
    createdAt: Date.now(),
  };

  await storeKeyPair(storedPair);

  return {
    keyId,
    publicKey: publicKeyBase64,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Gets the current key pair or generates a new one if none exists.
 */
export async function getOrCreateKeyPair(): Promise<{
  keyId: string;
  publicKey: string;
  privateKey: CryptoKey;
}> {
  const stored = await getStoredKeyPair();
  if (stored) {
    return stored;
  }
  return generateKeyPair();
}

/**
 * Imports a public key from base64 string.
 */
async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  const keyBuffer = Uint8Array.from(atob(publicKeyBase64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'spki',
    keyBuffer,
    {
      name: 'ECDH',
      namedCurve: ECDH_CURVE,
    },
    false,
    []
  );
}

/**
 * Derives a shared secret using ECDH.
 */
async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a random symmetric key for message encryption.
 */
async function generateSymmetricKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    true, // extractable for wrapping
    ['encrypt', 'decrypt']
  );
}

/**
 * Generates a random initialization vector.
 */
function generateIV(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_LENGTH));
}

/**
 * Encrypts a message for a recipient.
 *
 * @param message - Plain text message to encrypt.
 * @param recipientPublicKey - Recipient's public key (base64).
 * @param senderPrivateKey - Sender's private key.
 * @returns Encrypted message data.
 */
export async function encryptMessage(
  message: string,
  recipientPublicKey: string,
  senderPrivateKey: CryptoKey
): Promise<{
  encryptedContent: string;
  wrappedKey: string;
  iv: string;
}> {
  // Import recipient's public key
  const recipientKey = await importPublicKey(recipientPublicKey);

  // Derive shared secret for key wrapping
  const sharedKey = await deriveSharedKey(senderPrivateKey, recipientKey);

  // Generate a random symmetric key for this message
  const messageKey = await generateSymmetricKey();

  // Generate IV
  const iv = generateIV();

  // Encrypt the message with the symmetric key
  const encoder = new TextEncoder();
  const messageData = encoder.encode(message);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv as any,
    },
    messageKey,
    messageData
  );

  // Export and wrap the symmetric key with shared secret
  const exportedKey = await crypto.subtle.exportKey('raw', messageKey);
  const wrappedKeyBuffer = await crypto.subtle.encrypt(
    {
      name: ALGORITHM,
      iv: iv as any,
    },
    sharedKey,
    exportedKey
  );

  // Convert to base64
  const encryptedContent = arrayBufferToBase64(encryptedBuffer);
  const wrappedKey = arrayBufferToBase64(wrappedKeyBuffer);
  const ivBase64 = arrayBufferToBase64(iv);

  return {
    encryptedContent,
    wrappedKey,
    iv: ivBase64,
  };
}

/**
 * Decrypts a message from a sender.
 *
 * @param encryptedContent - Encrypted message content (base64).
 * @param wrappedKey - Wrapped symmetric key (base64).
 * @param iv - Initialization vector (base64).
 * @param senderPublicKey - Sender's public key (base64).
 * @param recipientPrivateKey - Recipient's private key.
 * @returns Decrypted plain text message.
 */
export async function decryptMessage(
  encryptedContent: string,
  wrappedKey: string,
  iv: string,
  senderPublicKey: string,
  recipientPrivateKey: CryptoKey
): Promise<string> {
  // Import sender's public key
  const senderKey = await importPublicKey(senderPublicKey);

  // Derive shared secret
  const sharedKey = await deriveSharedKey(recipientPrivateKey, senderKey);

  // Decode base64
  const ivBuffer = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));
  const wrappedKeyBuffer = Uint8Array.from(atob(wrappedKey), (c) => c.charCodeAt(0));
  const encryptedBuffer = Uint8Array.from(atob(encryptedContent), (c) => c.charCodeAt(0));

  // Unwrap the symmetric key
  const unwrappedKeyBuffer = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: ivBuffer,
    },
    sharedKey,
    wrappedKeyBuffer
  );

  // Import the unwrapped key
  const messageKey = await crypto.subtle.importKey(
    'raw',
    unwrappedKeyBuffer,
    {
      name: ALGORITHM,
      length: KEY_LENGTH,
    },
    false,
    ['decrypt']
  );

  // Decrypt the message
  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: ALGORITHM,
      iv: ivBuffer,
    },
    messageKey,
    encryptedBuffer
  );

  // Decode to string
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Checks if encryption is supported in the current browser.
 */
export function isEncryptionSupported(): boolean {
  return (
    typeof crypto !== 'undefined' &&
    typeof crypto.subtle !== 'undefined' &&
    typeof indexedDB !== 'undefined'
  );
}

/**
 * Clears all stored encryption keys.
 * Use with caution - this will make previously encrypted messages unreadable.
 */
export async function clearKeys(): Promise<void> {
  const db = await openKeyDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE, 'readwrite');
    const store = tx.objectStore(KEY_STORE);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Placeholder for decrypted message content.
 */
export const ENCRYPTED_MESSAGE_PLACEHOLDER = '🔒 Encrypted message';

/**
 * Placeholder for failed decryption.
 */
export const DECRYPTION_FAILED_PLACEHOLDER = '🔒 Unable to decrypt message';
