import { describe, expect, it } from 'vitest';

import { assertValidWebhookUrl, validateWebhookUrl } from './url-validator';

describe('url-validator', () => {
  it('accepts a normal https URL', () => {
    expect(validateWebhookUrl('https://example.com/hook')).toEqual({ isValid: true });
  });

  it('rejects non-http(s) protocols', () => {
    expect(validateWebhookUrl('file:///etc/passwd').isValid).toBe(false);
    expect(validateWebhookUrl('file:///etc/passwd').error).toBe('Only HTTP and HTTPS URLs are allowed');
  });

  it('rejects blocked hostnames', () => {
    expect(validateWebhookUrl('https://localhost/hook').isValid).toBe(false);
    expect(validateWebhookUrl('https://localhost/hook').error).toBe('URL points to a blocked hostname');

    expect(validateWebhookUrl('https://api.localhost/hook').isValid).toBe(false);
  });

  it('rejects private IP ranges', () => {
    expect(validateWebhookUrl('http://127.0.0.1/hook').isValid).toBe(false);
    expect(validateWebhookUrl('http://10.0.0.5/hook').isValid).toBe(false);
    expect(validateWebhookUrl('http://192.168.0.1/hook').isValid).toBe(false);
    expect(validateWebhookUrl('http://169.254.169.254/latest/meta-data').isValid).toBe(false);
  });

  it('rejects URLs with credentials', () => {
    const result = validateWebhookUrl('https://user:pass@example.com/hook');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('URLs with credentials are not allowed');
  });

  it('rejects blocked ports', () => {
    const result = validateWebhookUrl('https://example.com:22/hook');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Port 22 is not allowed');
  });

  it('rejects invalid URL formats', () => {
    const result = validateWebhookUrl('not a url');
    expect(result.isValid).toBe(false);
    expect(result.error).toBe('Invalid URL format');
  });

  it('assertValidWebhookUrl throws on invalid URLs', () => {
    expect(() => assertValidWebhookUrl('http://127.0.0.1/hook')).toThrow();
  });
});
