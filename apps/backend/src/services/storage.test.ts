import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

const { mockS3Send } = vi.hoisted(() => ({
  mockS3Send: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send: mockS3Send })),
  DeleteObjectCommand: vi.fn((args) => args),
  GetObjectCommand: vi.fn((args) => args),
}));

vi.mock('multer-s3', () => ({
  default: vi.fn(() => ({}),
  ),
  AUTO_CONTENT_TYPE: 'AUTO_CONTENT_TYPE',
}));

vi.mock('multer', () => ({
  default: {
    diskStorage: vi.fn(() => ({})),
    memoryStorage: vi.fn(() => ({})),
  },
  diskStorage: vi.fn(() => ({})),
  memoryStorage: vi.fn(() => ({})),
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { StorageService } from './storage';

describe('StorageService', () => {
  const testDir = path.join(process.cwd(), 'uploads');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDriver', () => {
    it('should return local driver by default', () => {
      expect(StorageService.getDriver()).toBe('local');
    });
  });

  describe('getFileUrl', () => {
    it('should return the correct URL for a filename', () => {
      const url = StorageService.getFileUrl('test-file.png');
      expect(url).toContain('/uploads/test-file.png');
    });
  });

  describe('deleteFile', () => {
    afterEach(() => {
      // Clean up any test files
      const testFile = path.join(testDir, 'test-delete.txt');
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });

    it('should delete an existing local file', async () => {
      const testFile = path.join(testDir, 'test-delete.txt');
      fs.writeFileSync(testFile, 'test content');

      const result = await StorageService.deleteFile('test-delete.txt');
      expect(result).toBe(true);
      expect(fs.existsSync(testFile)).toBe(false);
    });

    it('should return false for non-existent file', async () => {
      const result = await StorageService.deleteFile('non-existent-file.txt');
      expect(result).toBe(false);
    });

    it('should return false for path traversal attempts', async () => {
      const result = await StorageService.deleteFile('../../../etc/passwd');
      expect(result).toBe(false);
    });
  });

  describe('readFirstBytes', () => {
    afterEach(() => {
      const testFile = path.join(testDir, 'test-read.txt');
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });

    it('should read first bytes of a local file', async () => {
      const testFile = path.join(testDir, 'test-read.txt');
      fs.writeFileSync(testFile, 'Hello World');

      const buffer = await StorageService.readFirstBytes('test-read.txt', 5);
      expect(buffer).not.toBeNull();
      expect(buffer!.toString()).toBe('Hello');
    });

    it('should return null for non-existent file', async () => {
      const buffer = await StorageService.readFirstBytes('non-existent.txt', 10);
      expect(buffer).toBeNull();
    });

    it('should return null for path traversal attempts', async () => {
      const buffer = await StorageService.readFirstBytes('../../../etc/passwd', 10);
      expect(buffer).toBeNull();
    });
  });

  describe('getFileStream', () => {
    afterEach(() => {
      const testFile = path.join(testDir, 'test-stream.txt');
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });

    it('should return a readable stream for an existing file', async () => {
      const testFile = path.join(testDir, 'test-stream.txt');
      fs.writeFileSync(testFile, 'stream content');

      const stream = await StorageService.getFileStream('test-stream.txt');
      expect(stream).not.toBeNull();
      expect(stream).toBeInstanceOf(Readable);

      // Consume the stream to release the file handle
      await new Promise<void>((resolve) => {
        stream!.on('data', () => {});
        stream!.on('end', () => resolve());
        stream!.on('error', () => resolve());
      });
    });

    it('should return null for non-existent file', async () => {
      const stream = await StorageService.getFileStream('non-existent.txt');
      expect(stream).toBeNull();
    });

    it('should return null for path traversal attempts', async () => {
      const stream = await StorageService.getFileStream('../../../etc/passwd');
      expect(stream).toBeNull();
    });
  });

  describe('getStorageEngine', () => {
    it('should return a storage engine (local by default)', () => {
      const engine = StorageService.getStorageEngine();
      expect(engine).toBeDefined();
    });
  });

  describe('S3 driver', () => {
    let originalDriver: string | undefined;
    let originalKeyId: string | undefined;

    beforeEach(() => {
      originalDriver = process.env.STORAGE_DRIVER;
      originalKeyId = process.env.AWS_ACCESS_KEY_ID;
      process.env.STORAGE_DRIVER = 's3';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_S3_BUCKET = 'test-bucket';
      mockS3Send.mockReset();
      vi.resetModules();
    });

    afterEach(() => {
      if (originalDriver === undefined) delete process.env.STORAGE_DRIVER;
      else process.env.STORAGE_DRIVER = originalDriver;
      if (originalKeyId === undefined) delete process.env.AWS_ACCESS_KEY_ID;
      else process.env.AWS_ACCESS_KEY_ID = originalKeyId;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      vi.resetModules();
    });

    it('should return S3 storage engine when configured', async () => {
      const { StorageService } = await import('./storage');
      const engine = StorageService.getStorageEngine();
      expect(engine).toBeDefined();
    });

    it('should delete file from S3', async () => {
      mockS3Send.mockResolvedValue({});
      const { StorageService } = await import('./storage');
      const result = await StorageService.deleteFile('test-file.txt');
      expect(result).toBe(true);
    });

    it('should return false on S3 delete error', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 error'));
      const { StorageService } = await import('./storage');
      const result = await StorageService.deleteFile('test-file.txt');
      expect(result).toBe(false);
    });

    it('should read first bytes from S3', async () => {
      mockS3Send.mockResolvedValue({
        Body: Readable.from(Buffer.from('hello world')),
      });
      const { StorageService } = await import('./storage');
      const buffer = await StorageService.readFirstBytes('test.txt', 5);
      expect(buffer).not.toBeNull();
      expect(buffer!.toString()).toBe('hello world');
    });

    it('should return null when S3 response has no body', async () => {
      mockS3Send.mockResolvedValue({ Body: null });
      const { StorageService } = await import('./storage');
      const buffer = await StorageService.readFirstBytes('test.txt', 5);
      expect(buffer).toBeNull();
    });

    it('should return null on S3 read error', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 error'));
      const { StorageService } = await import('./storage');
      const buffer = await StorageService.readFirstBytes('test.txt', 5);
      expect(buffer).toBeNull();
    });

    it('should get file stream from S3', async () => {
      mockS3Send.mockResolvedValue({
        Body: Readable.from('stream data'),
      });
      const { StorageService } = await import('./storage');
      const stream = await StorageService.getFileStream('test.txt');
      expect(stream).not.toBeNull();
    });

    it('should return null on S3 stream error', async () => {
      mockS3Send.mockRejectedValue(new Error('S3 error'));
      const { StorageService } = await import('./storage');
      const stream = await StorageService.getFileStream('test.txt');
      expect(stream).toBeNull();
    });

    it('should return S3 driver type', async () => {
      const { StorageService } = await import('./storage');
      expect(StorageService.getDriver()).toBe('s3');
    });
  });
});
