'use client';

/**
 * E2E Encryption Hook
 *
 * Provides encryption/decryption functionality for messages.
 * Manages key registration and retrieval from the server.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  generateKeyPair,
  getOrCreateKeyPair,
  encryptMessage,
  decryptMessage,
  isEncryptionSupported,
  ENCRYPTED_MESSAGE_PLACEHOLDER,
  DECRYPTION_FAILED_PLACEHOLDER,
} from '@/lib/encryption';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090/api';

/**
 * Public key info from server.
 */
interface PublicKeyInfo {
  userId: string;
  username: string;
  publicKey: string;
  keyId: string;
}

/**
 * Encryption status for a channel or conversation.
 */
interface EncryptionStatus {
  enabled: boolean;
  allMembersHaveKeys: boolean;
  membersWithoutKeys: string[];
}

/**
 * Encrypted message data.
 */
interface EncryptedMessageData {
  content: string;
  isEncrypted: true;
  encryptionKey: string;
  keyId: string;
  iv: string;
}

/**
 * Hook for managing E2E encryption.
 */
export function useEncryption() {
  const [isSupported, setIsSupported] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasRegisteredKey, setHasRegisteredKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const privateKeyRef = useRef<CryptoKey | null>(null);
  const keyIdRef = useRef<string | null>(null);
  const publicKeyCacheRef = useRef<Map<string, PublicKeyInfo>>(new Map());

  /**
   * Gets auth token from localStorage.
   */
  const getAuthToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('token');
  }, []);

  /**
   * Initializes encryption on mount.
   */
  useEffect(() => {
    const initialize = async () => {
      if (typeof window === 'undefined') return;

      const supported = isEncryptionSupported();
      setIsSupported(supported);

      if (!supported) {
        setError('E2E encryption is not supported in this browser');
        setIsLoading(false);
        return;
      }

      try {
        // Get or create local key pair
        const keyPair = await getOrCreateKeyPair();
        privateKeyRef.current = keyPair.privateKey;
        keyIdRef.current = keyPair.keyId;

        // Check if key is registered on server
        const token = getAuthToken();
        if (token) {
          const response = await fetch(`${API_BASE}/encryption/keys/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (response.ok) {
            const data = await response.json();
            setHasRegisteredKey(data.hasKey);

            // If no key registered, register it
            if (!data.hasKey) {
              await registerPublicKey(keyPair.publicKey);
            }
          }
        }

        setIsInitialized(true);
      } catch (err) {
        console.error('Encryption initialization error:', err);
        setError('Failed to initialize encryption');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [getAuthToken]);

  /**
   * Registers the public key with the server.
   */
  const registerPublicKey = useCallback(
    async (publicKey?: string): Promise<boolean> => {
      try {
        let keyToRegister = publicKey;

        if (!keyToRegister) {
          const keyPair = await getOrCreateKeyPair();
          keyToRegister = keyPair.publicKey;
          privateKeyRef.current = keyPair.privateKey;
          keyIdRef.current = keyPair.keyId;
        }

        const token = getAuthToken();
        if (!token) {
          setError('Not authenticated');
          return false;
        }

        const response = await fetch(`${API_BASE}/encryption/keys`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ publicKey: keyToRegister }),
        });

        if (!response.ok) {
          throw new Error('Failed to register public key');
        }

        setHasRegisteredKey(true);
        return true;
      } catch (err) {
        console.error('Key registration error:', err);
        setError('Failed to register encryption key');
        return false;
      }
    },
    [getAuthToken]
  );

  /**
   * Rotates the encryption key pair.
   */
  const rotateKeys = useCallback(async (): Promise<boolean> => {
    try {
      const keyPair = await generateKeyPair();
      privateKeyRef.current = keyPair.privateKey;
      keyIdRef.current = keyPair.keyId;

      return await registerPublicKey(keyPair.publicKey);
    } catch (err) {
      console.error('Key rotation error:', err);
      setError('Failed to rotate encryption keys');
      return false;
    }
  }, [registerPublicKey]);

  /**
   * Fetches public keys for specified users.
   */
  const fetchPublicKeys = useCallback(
    async (userIds: string[]): Promise<PublicKeyInfo[]> => {
      const token = getAuthToken();
      if (!token) return [];

      // Check cache first
      const uncachedIds = userIds.filter(
        (id) => !publicKeyCacheRef.current.has(id)
      );

      if (uncachedIds.length > 0) {
        try {
          const response = await fetch(`${API_BASE}/encryption/keys/batch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ userIds: uncachedIds }),
          });

          if (response.ok) {
            const data = await response.json();
            // Update cache
            data.keys.forEach((key: PublicKeyInfo) => {
              publicKeyCacheRef.current.set(key.userId, key);
            });
          }
        } catch (err) {
          console.error('Failed to fetch public keys:', err);
        }
      }

      return userIds
        .map((id) => publicKeyCacheRef.current.get(id))
        .filter((k): k is PublicKeyInfo => k !== undefined);
    },
    [getAuthToken]
  );

  /**
   * Gets encryption status for a channel.
   */
  const getChannelEncryptionStatus = useCallback(
    async (
      channelId: string
    ): Promise<{ isEncrypted: boolean; status: EncryptionStatus; keys: PublicKeyInfo[] } | null> => {
      const token = getAuthToken();
      if (!token) return null;

      try {
        const response = await fetch(
          `${API_BASE}/encryption/channel/${channelId}/keys`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!response.ok) return null;

        const data = await response.json();

        // Update cache with fetched keys
        data.keys.forEach((key: PublicKeyInfo) => {
          publicKeyCacheRef.current.set(key.userId, key);
        });

        return {
          isEncrypted: data.isEncrypted,
          status: data.encryptionStatus,
          keys: data.keys,
        };
      } catch (err) {
        console.error('Failed to get channel encryption status:', err);
        return null;
      }
    },
    [getAuthToken]
  );

  /**
   * Encrypts a message for a recipient.
   */
  const encrypt = useCallback(
    async (
      message: string,
      recipientUserId: string
    ): Promise<EncryptedMessageData | null> => {
      if (!privateKeyRef.current || !keyIdRef.current) {
        setError('Encryption not initialized');
        return null;
      }

      // Get recipient's public key
      const keys = await fetchPublicKeys([recipientUserId]);
      if (keys.length === 0) {
        setError('Recipient has not registered encryption keys');
        return null;
      }

      const recipientKey = keys[0];

      try {
        const result = await encryptMessage(
          message,
          recipientKey.publicKey,
          privateKeyRef.current
        );

        return {
          content: result.encryptedContent,
          isEncrypted: true,
          encryptionKey: result.wrappedKey,
          keyId: keyIdRef.current,
          iv: result.iv,
        };
      } catch (err) {
        console.error('Encryption error:', err);
        setError('Failed to encrypt message');
        return null;
      }
    },
    [fetchPublicKeys]
  );

  /**
   * Encrypts a message for multiple recipients (e.g., channel).
   * Returns encrypted data for each recipient.
   */
  const encryptForMultiple = useCallback(
    async (
      message: string,
      recipientUserIds: string[]
    ): Promise<Map<string, EncryptedMessageData> | null> => {
      if (!privateKeyRef.current || !keyIdRef.current) {
        setError('Encryption not initialized');
        return null;
      }

      const keys = await fetchPublicKeys(recipientUserIds);
      if (keys.length === 0) {
        setError('No recipients have registered encryption keys');
        return null;
      }

      const results = new Map<string, EncryptedMessageData>();

      for (const recipientKey of keys) {
        try {
          const result = await encryptMessage(
            message,
            recipientKey.publicKey,
            privateKeyRef.current
          );

          results.set(recipientKey.userId, {
            content: result.encryptedContent,
            isEncrypted: true,
            encryptionKey: result.wrappedKey,
            keyId: keyIdRef.current!,
            iv: result.iv,
          });
        } catch (err) {
          console.error(`Failed to encrypt for ${recipientKey.userId}:`, err);
        }
      }

      return results;
    },
    [fetchPublicKeys]
  );

  /**
   * Decrypts a message from a sender.
   */
  const decrypt = useCallback(
    async (
      encryptedContent: string,
      wrappedKey: string,
      iv: string,
      senderUserId: string
    ): Promise<string> => {
      if (!privateKeyRef.current) {
        return DECRYPTION_FAILED_PLACEHOLDER;
      }

      // Get sender's public key
      const keys = await fetchPublicKeys([senderUserId]);
      if (keys.length === 0) {
        return DECRYPTION_FAILED_PLACEHOLDER;
      }

      const senderKey = keys[0];

      try {
        return await decryptMessage(
          encryptedContent,
          wrappedKey,
          iv,
          senderKey.publicKey,
          privateKeyRef.current
        );
      } catch (err) {
        console.error('Decryption error:', err);
        return DECRYPTION_FAILED_PLACEHOLDER;
      }
    },
    [fetchPublicKeys]
  );

  return {
    // State
    isSupported,
    isInitialized,
    hasRegisteredKey,
    isLoading,
    error,

    // Actions
    registerPublicKey,
    rotateKeys,
    fetchPublicKeys,
    getChannelEncryptionStatus,
    encrypt,
    encryptForMultiple,
    decrypt,

    // Constants
    ENCRYPTED_MESSAGE_PLACEHOLDER,
    DECRYPTION_FAILED_PLACEHOLDER,
  };
}

export type UseEncryptionReturn = ReturnType<typeof useEncryption>;
