import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '@pulseweave/database';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { uploadLimiter } from '../middleware/security';
import { StorageService } from '../services/storage';

const router = Router();

// Configure multer with StorageService
// Note: limits are applied here
const upload = multer({
  storage: StorageService.getStorageEngine(),
  fileFilter: (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ALLOWED_MIMES = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'text/plain',
      'application/json',
    ];
    
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} not allowed`));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

/**
 * Helper to normalize file object attributes across Local/S3 providers
 */
const normalizeFile = (file: any) => {
  const filename = file.filename || file.key;
  const url = StorageService.getFileUrl(filename);
  return {
    filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    url,
    path: file.path // Only defined for local storage
  };
};

/**
 * Magic byte signatures for file type validation.
 * Validates actual file content, not just MIME headers.
 * Note: Only works for local storage where we have direct file access
 */
const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  'image/gif': [Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])],
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])],
};

async function validateFileContent(filename: string, mimeType: string): Promise<boolean> {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return true;

  try {
    const buffer = await StorageService.readFirstBytes(filename, 16);
    if (!buffer) return false;
    return signatures.some(sig => buffer.slice(0, sig.length).equals(sig));
  } catch {
    return false;
  }
}

// Upload single file (with rate limiting)
router.post('/', authenticateToken, uploadLimiter, upload.single('file'), async (req: AuthRequest, res) => {
  const uploadedFile = req.file;
  
  try {
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.workspaceId) {
      // Clean up if workspace missing
      const norm = normalizeFile(uploadedFile);
      await StorageService.deleteFile(norm.filename);
      return res.status(400).json({ error: 'Workspace context required for uploads' });
    }

    const { filename, originalName, mimeType, size, url } = normalizeFile(uploadedFile);

    // Validate content (Works for Local & S3)
    const isValidContent = await validateFileContent(filename, mimeType);
    if (!isValidContent) {
      await StorageService.deleteFile(filename);
      return res.status(400).json({ error: 'File content does not match declared type' });
    }

    // Store file record in database
    const attachment = await prisma.attachment.create({
      data: {
        type: mimeType.startsWith('image/') ? 'image' : 'file',
        url,
        name: originalName,
        size,
        mimeType,
        workspaceId: req.workspaceId,
        uploadedById: req.userId!,
      },
    });

    res.json({
      id: attachment.id,
      filename,
      originalName,
      mimeType,
      size,
      url,
      uploadedBy: req.userId,
      uploadedAt: attachment.createdAt,
    });
  } catch (error) {
    console.error('Upload error:', error);
    // Attempt cleanup
    if (uploadedFile) {
      const filename = uploadedFile.filename || (uploadedFile as any).key;
      if (filename) await StorageService.deleteFile(filename).catch(console.error);
    }
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Upload multiple files
router.post('/multiple', authenticateToken, uploadLimiter, upload.array('files', 5), async (req: AuthRequest, res) => {
  const uploadedFiles = req.files as Express.Multer.File[];

  try {
    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    if (!req.workspaceId) {
      // Cleanup all
      for (const file of uploadedFiles) {
        const norm = normalizeFile(file);
        await StorageService.deleteFile(norm.filename);
      }
      return res.status(400).json({ error: 'Workspace context required for uploads' });
    }

    const results = [];
    
    for (const file of uploadedFiles) {
      const { filename, originalName, mimeType, size, url } = normalizeFile(file);
      
      // Validate content (Works for Local & S3)
      const isValidContent = await validateFileContent(filename, mimeType);
      if (!isValidContent) {
        await StorageService.deleteFile(filename);
        continue; // Skip invalid files
      }

      // Store in database
      const attachment = await prisma.attachment.create({
        data: {
          type: mimeType.startsWith('image/') ? 'image' : 'file',
          url,
          name: originalName,
          size,
          mimeType,
          workspaceId: req.workspaceId,
          uploadedById: req.userId!,
        },
      });

      results.push({
        id: attachment.id,
        filename,
        originalName,
        mimeType,
        size,
        url,
        uploadedBy: req.userId,
        uploadedAt: attachment.createdAt,
      });
    }

    res.json(results);
  } catch (error) {
    console.error('Upload error:', error);
    // Cleanup on catastrophe
    if (uploadedFiles) {
      for (const file of uploadedFiles) {
        const norm = normalizeFile(file);
        await StorageService.deleteFile(norm.filename).catch(console.error);
      }
    }
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Delete file
router.delete('/:filename', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { filename } = req.params;

    // Use StorageService URL generation to match
    const fileUrl = StorageService.getFileUrl(filename);
    
    // Security: verify ownership by looking up attachment
    // Note: We search by URL endswith because S3 URLs might vary slightly if bucket changes
    // But practically, exact match on what we stored is best.
    const attachment = await prisma.attachment.findFirst({
      where: { url: fileUrl },
    });
    
    // Fallback search by filename if URL doesn't match
    const attachmentByFilename = !attachment ? await prisma.attachment.findFirst({
        where: { url: { contains: filename } } 
    }) : null;

    const targetAttachment = attachment || attachmentByFilename;

    if (!targetAttachment) {
      return res.status(404).json({ error: 'File not found' });
    }

    // SECURITY: Only allow owner to delete their files
    if (targetAttachment.uploadedById !== req.userId) {
      // Unless admin? For now rigid ownership.
      return res.status(403).json({ error: 'You can only delete your own files' });
    }

    // Delete from storage
    const deleted = await StorageService.deleteFile(filename);
    if (!deleted && StorageService.getDriver() === 'local') {
        // If local delete failed, it might be gone already or permission error
        // We log but continue to delete DB record if it was "not found"
        console.warn(`File ${filename} not found on disk during delete`);
    }

    // Delete from database
    await prisma.attachment.delete({ where: { id: targetAttachment.id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
