import { describe, expect, it } from 'vitest';

import {
  checkEncryptionReadiness,
  encryptedMessageSchema,
  generateKeyId,
  isValidPublicKey,
  maskEncryptedContent,
  validateEncryptedMessage,
} from './encryption';

describe('encryption service', () => {
  it('generateKeyId returns a stable prefix and a hex id', () => {
    const id = generateKeyId();
    expect(id.startsWith('key_')).toBe(true);
    expect(id).toMatch(/^key_[0-9a-f]{32}$/);
  });

  it('isValidPublicKey validates base64 and length constraints', () => {
    const valid = Buffer.from('a'.repeat(33)).toString('base64');
    const tooShort = Buffer.from('a'.repeat(10)).toString('base64');

    expect(isValidPublicKey(valid)).toBe(true);
    expect(isValidPublicKey(tooShort)).toBe(false);
    expect(isValidPublicKey('not-base64!!!')).toBe(false);
  });

  it('validateEncryptedMessage returns parsed data or null', () => {
    const data = {
      content: 'ciphertext',
      isEncrypted: true,
      encryptionKey: 'wrapped',
      keyId: 'kid',
      iv: 'iv',
    };

    expect(validateEncryptedMessage(data)).toEqual(data);
    expect(validateEncryptedMessage({ ...data, iv: '' })).toBeNull();
  });

  it('encryptedMessageSchema enforces isEncrypted literal true', () => {
    const result = encryptedMessageSchema.safeParse({
      content: 'ciphertext',
      isEncrypted: false,
      encryptionKey: 'wrapped',
      keyId: 'kid',
      iv: 'iv',
    });

    expect(result.success).toBe(false);
  });

  it('maskEncryptedContent masks length only', () => {
    expect(maskEncryptedContent('abcd')).toBe('[ENCRYPTED:4 chars]');
  });

  it('checkEncryptionReadiness returns members without keys and enabled flag', () => {
    const status = checkEncryptionReadiness([
      { userId: '1', username: 'a', publicKey: 'pk' },
      { userId: '2', username: 'b', publicKey: null },
      { userId: '3', username: 'c', publicKey: null },
    ]);

    expect(status.enabled).toBe(false);
    expect(status.allMembersHaveKeys).toBe(false);
    expect(status.membersWithoutKeys).toEqual(['b', 'c']);
  });
});
