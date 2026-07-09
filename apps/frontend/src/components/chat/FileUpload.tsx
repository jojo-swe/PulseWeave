'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, X, File, Image, FileText, Film, Music, Archive } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  accept?: string;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  image: Image,
  video: Film,
  audio: Music,
  application: FileText,
  text: FileText,
  default: File,
};

function getFileIcon(type: string) {
  const category = type.split('/')[0];
  return FILE_ICONS[category] || FILE_ICONS.default;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function FileUpload({ onFilesSelected, maxFiles = 5, maxSizeMB = 10, accept }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFiles = useCallback((files: File[]): File[] => {
    setError(null);
    const maxSize = maxSizeMB * 1024 * 1024;
    const validFiles: File[] = [];

    for (const file of files) {
      if (validFiles.length >= maxFiles) {
        setError(`Maximum ${maxFiles} files allowed`);
        break;
      }
      if (file.size > maxSize) {
        setError(`${file.name} exceeds ${maxSizeMB}MB limit`);
        continue;
      }
      validFiles.push(file);
    }

    return validFiles;
  }, [maxFiles, maxSizeMB]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const validFiles = validateFiles(files);
    if (validFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...validFiles].slice(0, maxFiles));
    }
  }, [validateFiles, maxFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles = validateFiles(files);
      if (validFiles.length > 0) {
        setSelectedFiles(prev => [...prev, ...validFiles].slice(0, maxFiles));
      }
    }
    // Reset input
    e.target.value = '';
  }, [validateFiles, maxFiles]);

  const removeFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setError(null);
  }, []);

  const handleUpload = useCallback(() => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
      setSelectedFiles([]);
    }
  }, [selectedFiles, onFilesSelected]);

  return (
    <div className="space-y-3">
      {/* Drop Zone */}
      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-purple-500 bg-purple-500/10'
            : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          onChange={handleFileInput}
          className="hidden"
        />
        
        <Upload className={cn(
          'h-8 w-8 mx-auto mb-2 transition-colors',
          isDragging ? 'text-purple-400' : 'text-gray-400'
        )} />
        
        <p className="text-sm text-gray-300">
          {isDragging ? 'Drop files here' : 'Drag & drop files or click to browse'}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Max {maxFiles} files, {maxSizeMB}MB each
        </p>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {/* Selected Files */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-400">
            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
          </p>
          <div className="space-y-1">
            {selectedFiles.map((file, index) => {
              const Icon = getFileIcon(file.type);
              return (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-2 p-2 rounded-lg bg-gray-800 group"
                >
                  <Icon className="h-5 w-5 text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
          <Button onClick={handleUpload} className="w-full">
            <Upload className="h-4 w-4 mr-2" />
            Upload {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''}
          </Button>
        </div>
      )}
    </div>
  );
}

// Compact file button for the message input
interface FileButtonProps {
  onFilesSelected: (files: File[]) => void;
}

export function FileButton({ onFilesSelected }: FileButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => inputRef.current?.click()}
        title="Attach files"
      >
        <Upload className="h-4 w-4" />
      </Button>
    </>
  );
}

// Display attached files preview
interface AttachedFilesProps {
  files: File[];
  onRemove: (index: number) => void;
}

export function AttachedFiles({ files, onRemove }: AttachedFilesProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 p-2 border-t border-gray-700">
      {files.map((file, index) => {
        const Icon = getFileIcon(file.type);
        const isImage = file.type.startsWith('image/');
        
        return (
          <div
            key={`${file.name}-${index}`}
            className="relative group flex items-center gap-2 px-2 py-1 rounded bg-gray-800 text-sm"
          >
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL not supported by next/image
              <img
                src={URL.createObjectURL(file)}
                alt={file.name}
                className="h-6 w-6 object-cover rounded"
              />
            ) : (
              <Icon className="h-4 w-4 text-gray-400" />
            )}
            <span className="text-gray-300 max-w-[120px] truncate">{file.name}</span>
            <button
              onClick={() => onRemove(index)}
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
