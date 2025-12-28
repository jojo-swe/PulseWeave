import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  allowedFileTypes,
  containsInjectionPatterns,
  escapeForQuery,
  isAllowedFileType,
  sanitizeFileName,
  sanitizePlainText,
  sanitizeRichText,
  sanitizeSearchQuery,
  schemas,
  validateBody,
} from './validation';

describe('validation service', () => {
  it('schemas.email normalizes casing and whitespace', () => {
    const result = schemas.email.parse('TEST@Example.COM');
    expect(result).toBe('test@example.com');
  });

  it('sanitizeRichText strips script tags and preserves allowed tags', () => {
    const input = '<p>Hello</p><script>alert(1)</script><b>World</b>';
    const output = sanitizeRichText(input);

    expect(output).toContain('<p>Hello</p>');
    expect(output).toContain('<b>World</b>');
    expect(output.toLowerCase()).not.toContain('<script');
    expect(output.toLowerCase()).not.toContain('alert(1)');
  });

  it('sanitizeRichText strips unsafe URL schemes from links', () => {
    const input = '<a href="javascript:alert(1)" title="x">link</a>';
    const output = sanitizeRichText(input);

    expect(output.toLowerCase()).not.toContain('javascript:');
  });

  it('sanitizePlainText strips all HTML', () => {
    const input = '<b>Hello</b> <i>World</i>';
    const output = sanitizePlainText(input);

    expect(output).toBe('Hello World');
  });

  it('escapeForQuery escapes common dangerous characters', () => {
    const input = "\\'\"\n\r\x00\x1a";
    const output = escapeForQuery(input);

    expect(output).toContain('\\\\');
    expect(output).toContain("\\'");
    expect(output).toContain('\\"');
    expect(output).toContain('\\n');
    expect(output).toContain('\\r');
    expect(output).toContain('\\0');
    expect(output).toContain('\\Z');
  });

  it('sanitizeFileName removes path segments and replaces unsafe characters', () => {
    const input = '../unsafe/..\\evil file\nname?.png';
    const output = sanitizeFileName(input);

    expect(output).not.toContain('..');
    expect(output).not.toContain('/');
    expect(output).not.toContain('\\');
    expect(output).toContain('evil_file_name_.png');
  });

  it('isAllowedFileType matches exact and wildcard patterns', () => {
    expect(isAllowedFileType('image/png', allowedFileTypes.images)).toBe(true);
    expect(isAllowedFileType('image/PNG', allowedFileTypes.images)).toBe(true);
    expect(isAllowedFileType('audio/mpeg', allowedFileTypes.media)).toBe(true);
    expect(isAllowedFileType('application/octet-stream', allowedFileTypes.all)).toBe(false);
  });

  it('validateBody returns parsed data on success', () => {
    const schema = z.object({ name: z.string().min(1).transform((v) => v.trim()) });
    const result = validateBody(schema, { name: '  Alice  ' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice');
    }
  });

  it('validateBody returns path-aware errors on failure', () => {
    const schema = z.object({ nested: z.object({ count: z.number().int().min(1) }) });
    const result = validateBody(schema, { nested: { count: 0 } });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]).toContain('nested.count');
    }
  });

  it('containsInjectionPatterns detects SQLi and XSS patterns', () => {
    expect(containsInjectionPatterns("' OR 1=1 --")).toBe(true);
    expect(containsInjectionPatterns('<script>alert(1)</script>')).toBe(true);
    expect(containsInjectionPatterns('javascript:alert(1)')).toBe(true);
    expect(containsInjectionPatterns('normal text')).toBe(false);
  });

  it('sanitizeSearchQuery strips HTML, removes SQL wildcards, and limits length', () => {
    const input = '<b>hi</b>%_'.padEnd(200, 'x');
    const output = sanitizeSearchQuery(input);

    expect(output).toBe('hi' + 'x'.repeat(98));
  });
});
