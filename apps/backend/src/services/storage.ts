import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import multer from 'multer';
import multerS3 from 'multer-s3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

export type StorageDriver = 'local' | 's3';

// Configuration
const STORAGE_DRIVER = (process.env.STORAGE_DRIVER || 'local') as StorageDriver;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const AWS_S3_BUCKET = process.env.AWS_S3_BUCKET || 'pulseweave-uploads';
const API_URL = process.env.API_URL || 'http://localhost:9090';

// Initialize S3 Client if needed
let s3Client: S3Client | null = null;
if (STORAGE_DRIVER === 's3' && AWS_ACCESS_KEY_ID) {
  s3Client = new S3Client({
    region: AWS_REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  });
}

// Ensure local uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Generate unique filename
const generateFilename = (req: any, file: Express.Multer.File, cb: (error: any, filename: string) => void) => {
  const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const uniqueName = `${uuidv4()}${ext}`;
  cb(null, uniqueName);
};

export class StorageService {
  /**
   * Get Multer storage engine based on configuration
   */
  static getStorageEngine(): multer.StorageEngine {
    if (STORAGE_DRIVER === 's3' && s3Client) {
      return multerS3({
        s3: s3Client,
        bucket: AWS_S3_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: generateFilename,
        metadata: (
          req: any,
          file: Express.Multer.File,
          cb: (error: Error | null, metadata?: Record<string, string>) => void
        ) => {
          cb(null, {
            fieldName: file.fieldname,
            originalName: file.originalname,
            uploadedBy: (req as any).user?.userId || 'unknown'
          });
        }
      });
    }

    // Default to local storage
    return multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, uploadsDir);
      },
      filename: generateFilename,
    });
  }

  /**
   * Delete file from storage
   */
  static async deleteFile(filename: string): Promise<boolean> {
    if (STORAGE_DRIVER === 's3' && s3Client) {
      try {
        await s3Client.send(new DeleteObjectCommand({
          Bucket: AWS_S3_BUCKET,
          Key: filename,
        }));
        return true;
      } catch (error) {
        console.error('S3 Delete Error:', error);
        return false;
      }
    }

    // Local delete
    try {
      const filePath = path.join(uploadsDir, filename);
       // Path traversal check
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(uploadsDir))) {
        return false;
      }
      
      if (fs.existsSync(resolvedPath)) {
        fs.unlinkSync(resolvedPath);
        return true;
      }
    } catch (error) {
      console.error('Local Delete Error:', error);
    }
    return false;
  }

  /**
   * Read first N bytes of a file for validation
   */
  static async readFirstBytes(filename: string, length: number): Promise<Buffer | null> {
    if (STORAGE_DRIVER === 's3' && s3Client) {
      try {
        const command = new GetObjectCommand({
          Bucket: AWS_S3_BUCKET,
          Key: filename,
          Range: `bytes=0-${length - 1}`
        });
        const response = await s3Client.send(command);
        if (!response.Body) return null;
        
        // AWS SDK v3 Node.js: Body is IncomingMessage (Readable)
        const stream = response.Body as Readable;
        
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
      } catch (error) {
        console.error('S3 Read Error:', error);
        return null;
      }
    }

    // Local read
    try {
      const filePath = path.join(uploadsDir, filename);
       // Path traversal check
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(uploadsDir))) return null;
      
      if (!fs.existsSync(resolvedPath)) return null;
      
      const fd = fs.openSync(resolvedPath, 'r');
      const buffer = Buffer.alloc(length);
      const bytesRead = fs.readSync(fd, buffer, 0, length, 0);
      fs.closeSync(fd);
      return buffer.slice(0, bytesRead);
    } catch (error) {
      console.error('Local Read Error:', error);
      return null;
    }
  }

  /**
   * Get public URL for file
   */
  static getFileUrl(filename: string): string {
    return `${API_URL}/uploads/${filename}`;
  }

  /**
   * Gets a readable stream for a stored file.
   * Returns null if the file does not exist or cannot be accessed.
   */
  static async getFileStream(filename: string): Promise<Readable | null> {
    if (STORAGE_DRIVER === 's3' && s3Client) {
      try {
        const response = await s3Client.send(
          new GetObjectCommand({
            Bucket: AWS_S3_BUCKET,
            Key: filename,
          })
        );

        if (!response.Body) return null;
        return response.Body as Readable;
      } catch (error) {
        console.error('S3 Stream Error:', error);
        return null;
      }
    }

    try {
      const filePath = path.join(uploadsDir, filename);
      const resolvedPath = path.resolve(filePath);
      if (!resolvedPath.startsWith(path.resolve(uploadsDir))) return null;
      if (!fs.existsSync(resolvedPath)) return null;
      return fs.createReadStream(resolvedPath);
    } catch (error) {
      console.error('Local Stream Error:', error);
      return null;
    }
  }

  static getDriver(): StorageDriver {
    return STORAGE_DRIVER;
  }
}
