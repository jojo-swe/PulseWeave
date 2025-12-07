import { URL } from 'url';

/**
 * Private/internal IP ranges that should be blocked for SSRF prevention.
 */
const BLOCKED_IP_RANGES = [
  // Loopback
  /^127\./,
  /^::1$/,
  /^localhost$/i,
  // Private networks (RFC 1918)
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  // Link-local
  /^169\.254\./,
  /^fe80:/i,
  // Multicast
  /^224\./,
  /^ff/i,
  // Reserved
  /^0\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,
  // Cloud metadata endpoints
  /^169\.254\.169\.254$/,
  /^metadata\.google\.internal$/i,
  /^metadata\.azure\.internal$/i,
];

/**
 * Blocked hostnames for SSRF prevention.
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '[::]',
  '[::1]',
  // Cloud metadata
  'metadata.google.internal',
  'metadata.azure.internal',
  'instance-data',
  // Common internal hostnames
  'internal',
  'intranet',
  'corp',
  'private',
];

/**
 * Validates a URL to prevent SSRF attacks.
 * Blocks requests to internal/private IP addresses and cloud metadata endpoints.
 *
 * @param urlString - The URL to validate
 * @returns Object with isValid boolean and optional error message
 */
export function validateWebhookUrl(urlString: string): { isValid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // Only allow HTTP and HTTPS
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { isValid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }

    const hostname = url.hostname.toLowerCase();

    // Check against blocked hostnames
    for (const blocked of BLOCKED_HOSTNAMES) {
      if (hostname === blocked || hostname.endsWith(`.${blocked}`)) {
        return { isValid: false, error: 'URL points to a blocked hostname' };
      }
    }

    // Check against blocked IP ranges
    for (const pattern of BLOCKED_IP_RANGES) {
      if (pattern.test(hostname)) {
        return { isValid: false, error: 'URL points to a private or internal IP address' };
      }
    }

    // Block URLs with credentials
    if (url.username || url.password) {
      return { isValid: false, error: 'URLs with credentials are not allowed' };
    }

    // Block non-standard ports that might be used for internal services
    const port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);
    const blockedPorts = [22, 23, 25, 110, 143, 445, 3306, 5432, 6379, 27017];
    if (blockedPorts.includes(port)) {
      return { isValid: false, error: `Port ${port} is not allowed for webhooks` };
    }

    return { isValid: true };
  } catch (error) {
    return { isValid: false, error: 'Invalid URL format' };
  }
}

/**
 * Validates a URL and throws an error if invalid.
 * Use this in route handlers for cleaner code.
 *
 * @param urlString - The URL to validate
 * @throws Error if URL is invalid or blocked
 */
export function assertValidWebhookUrl(urlString: string): void {
  const result = validateWebhookUrl(urlString);
  if (!result.isValid) {
    throw new Error(result.error);
  }
}
