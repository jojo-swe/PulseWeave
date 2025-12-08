import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@pulseweave/database';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { uploadLimiter } from '../middleware/security';

const router = Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Magic byte signatures for file type validation.
 * Validates actual file content, not just MIME headers.
 */
const MAGIC_BYTES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xFF, 0xD8, 0xFF])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  'image/gif': [Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])],
  'image/webp': [Buffer.from([0x52, 0x49, 0x46, 0x46])], // RIFF header (WebP starts with RIFF)
  'application/pdf': [Buffer.from([0x25, 0x50, 0x44, 0x46])], // %PDF
};

/**
 * Validates file content against magic bytes.
 * @param filePath - Path to the file
 * @param mimeType - Expected MIME type
 * @returns True if file content matches expected type
 */
async function validateFileContent(filePath: string, mimeType: string): Promise<boolean> {
  const signatures = MAGIC_BYTES[mimeType];
  
  // For types without magic byte validation (text/plain, application/json), allow
  if (!signatures) {
    return true;
  }

  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    return signatures.some(sig => buffer.slice(0, sig.length).equals(sig));
  } catch {
    return false;
  }
}

/**
 * Validates filename to prevent path traversal attacks.
 * @param filename - The filename to validate
 * @returns True if filename is safe
 */
function isValidFilename(filename: string): boolean {
  // Reject if contains path separators or parent directory references
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return false;
  }
  // Reject if contains null bytes
  if (filename.includes('\0')) {
    return false;
  }
  // Reject if starts with a dot (hidden files)
  if (filename.startsWith('.')) {
    return false;
  }
  // Only allow alphanumeric, dash, underscore, and dot
  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) {
    return false;
  }
  return true;
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    // Generate a secure unique filename
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// Allowed MIME types
const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/json',
];

// File filter for allowed types
const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} not allowed`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

// Upload single file (with rate limiting)
router.post('/', authenticateToken, uploadLimiter, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.workspaceId) {
      return res.status(400).json({ error: 'Workspace context required for uploads' });
    }

    const file = req.file;
    const filePath = path.join(uploadsDir, file.filename);

    // Validate file content matches claimed MIME type (magic bytes check)
    const isValidContent = await validateFileContent(filePath, file.mimetype);
    if (!isValidContent) {
      // Delete the uploaded file
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'File content does not match declared type' });
    }

    const fileUrl = `/uploads/${file.filename}`;

    // Store file record in database for ownership tracking
    const attachment = await prisma.attachment.create({
      data: {
        type: file.mimetype.startsWith('image/') ? 'image' : 'file',
        url: fileUrl,
        name: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        workspaceId: req.workspaceId,
        uploadedById: req.userId!,
      },
    });

    res.json({
      id: attachment.id,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: fileUrl,
      uploadedBy: req.userId,
      uploadedAt: attachment.createdAt,
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Upload multiple files (with rate limiting and validation)
router.post('/multiple', authenticateToken, uploadLimiter, upload.array('files', 5), async (req: AuthRequest, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    if (!req.workspaceId) {
      return res.status(400).json({ error: 'Workspace context required for uploads' });
    }

    const results = [];
    for (const file of files) {
      const filePath = path.join(uploadsDir, file.filename);
      
      // Validate file content
      const isValidContent = await validateFileContent(filePath, file.mimetype);
      if (!isValidContent) {
        fs.unlinkSync(filePath);
        continue; // Skip invalid files
      }

      const fileUrl = `/uploads/${file.filename}`;
      
      // Store in database
      const attachment = await prisma.attachment.create({
        data: {
          type: file.mimetype.startsWith('image/') ? 'image' : 'file',
          url: fileUrl,
          name: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          workspaceId: req.workspaceId,
          uploadedById: req.userId!,
        },
      });

      results.push({
        id: attachment.id,
        filename: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        url: fileUrl,
        uploadedBy: req.userId,
        uploadedAt: attachment.createdAt,
      });
    }

    res.json(results);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// Delete file (with ownership verification and path traversal protection)
router.delete('/:filename', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { filename } = req.params;

    // SECURITY: Validate filename to prevent path traversal
    if (!isValidFilename(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // SECURITY: Verify ownership - find attachment by URL
    const fileUrl = `/uploads/${filename}`;
    const attachment = await prisma.attachment.findFirst({
      where: { url: fileUrl },
    });

    if (!attachment) {
      return res.status(404).json({ error: 'File not found' });
    }

    // SECURITY: Only allow owner to delete their files
    if (attachment.uploadedById !== req.userId) {
      return res.status(403).json({ error: 'You can only delete your own files' });
    }

    // Construct safe file path
    const filePath = path.join(uploadsDir, filename);
    
    // Double-check the resolved path is within uploads directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(uploadsDir))) {
      return res.status(400).json({ error: 'Invalid file path' });
    }

    // Delete from filesystem
    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);
    }

    // Delete from database
    await prisma.attachment.delete({ where: { id: attachment.id } });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;
