'use client';

import { useRef, useState } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Paperclip, X, File, Image, FileText, Loader2 } from 'lucide-react';

interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

interface FileUploadButtonProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  maxFiles?: number;
  className?: string;
}

/**
 * File upload button component for message input.
 */
export function FileUploadButton({
  onFilesUploaded,
  maxFiles = 5,
  className,
}: FileUploadButtonProps) {
  const { token } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const filesToUpload = files.slice(0, maxFiles);
    setUploading(true);

    try {
      if (filesToUpload.length === 1) {
        const result = await api.upload.single(filesToUpload[0], token!);
        onFilesUploaded([result]);
      } else {
        const result = await api.upload.multiple(filesToUpload, token!);
        onFilesUploaded(result);
      }
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setUploading(false);
      // Reset input
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleChange}
        className="hidden"
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip,.rar,.json,.js,.html,.css"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8 text-muted-foreground hover:text-foreground', className)}
        onClick={handleClick}
        disabled={uploading}
        title="Attach files"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
      </Button>
    </>
  );
}

interface FilePreviewProps {
  file: UploadedFile;
  onRemove: () => void;
}

/**
 * Preview component for an uploaded file.
 */
export function FilePreview({ file, onRemove }: FilePreviewProps) {
  const isImage = file.mimeType.startsWith('image/');
  const isPdf = file.mimeType === 'application/pdf';

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getIcon = () => {
    if (isImage) return <Image className="h-4 w-4" />;
    if (isPdf) return <FileText className="h-4 w-4" />;
    return <File className="h-4 w-4" />;
  };

  return (
    <div className="relative group flex items-center gap-2 p-2 rounded-lg bg-muted/50 border border-border/50">
      {isImage ? (
        <img
          src={api.upload.getUrl(file.filename)}
          alt={file.originalName}
          className="h-10 w-10 rounded object-cover"
        />
      ) : (
        <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary">
          {getIcon()}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.originalName}</p>
        <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

interface FilePreviewListProps {
  files: UploadedFile[];
  onRemove: (id: string) => void;
}

/**
 * List of file previews.
 */
export function FilePreviewList({ files, onRemove }: FilePreviewListProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 border-t border-border/50">
      {files.map((file) => (
        <FilePreview
          key={file.id}
          file={file}
          onRemove={() => onRemove(file.id)}
        />
      ))}
    </div>
  );
}
