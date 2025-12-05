'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FileButton, AttachedFiles } from './FileUpload';
import { Loader2 } from 'lucide-react';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  ListOrdered,
  List,
  AtSign,
  Smile,
  Send,
  Mic,
} from 'lucide-react';

interface MessageInputProps {
  onSend: (content: string) => void;
  onTyping?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export function MessageInput({
  onSend,
  onTyping,
  placeholder = 'Message',
  disabled = false,
}: MessageInputProps) {
  const { currentChannel, token } = useStore();
  const [content, setContent] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const handleFilesSelected = useCallback((files: File[]) => {
    setAttachedFiles(prev => [...prev, ...files].slice(0, 5));
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Typing indicator
    if (onTyping) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onTyping();
      typingTimeoutRef.current = setTimeout(() => {
        // Stop typing after 2 seconds of inactivity
      }, 2000);
    }
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if ((trimmed || attachedFiles.length > 0) && !disabled && !uploading) {
      let messageContent = trimmed;
      
      // Upload files first if any
      if (attachedFiles.length > 0 && token) {
        setUploading(true);
        try {
          const uploaded = await api.upload.multiple(attachedFiles, token);
          setUploadedFiles(uploaded);
          
          // Add file links to message
          const fileLinks = uploaded.map((f: UploadedFile) => {
            const isImage = f.mimeType.startsWith('image/');
            if (isImage) {
              return `![${f.originalName}](${api.upload.getUrl(f.filename)})`;
            }
            return `[📎 ${f.originalName}](${api.upload.getUrl(f.filename)})`;
          }).join('\n');
          
          messageContent = trimmed ? `${trimmed}\n\n${fileLinks}` : fileLinks;
        } catch (error) {
          console.error('Upload failed:', error);
          setUploading(false);
          return;
        }
        setUploading(false);
      }
      
      onSend(messageContent);
      setContent('');
      setAttachedFiles([]);
      setUploadedFiles([]);
      textareaRef.current?.focus();
    }
  };

  const formatButtons = [
    { icon: Bold, label: 'Bold', shortcut: 'Ctrl+B' },
    { icon: Italic, label: 'Italic', shortcut: 'Ctrl+I' },
    { icon: Strikethrough, label: 'Strikethrough', shortcut: 'Ctrl+Shift+X' },
    { icon: Code, label: 'Code', shortcut: 'Ctrl+E' },
    { icon: Link, label: 'Link', shortcut: 'Ctrl+K' },
    { icon: ListOrdered, label: 'Numbered list' },
    { icon: List, label: 'Bulleted list' },
  ];

  return (
    <div className="px-4 pb-4">
      <div
        className={cn(
          'rounded-xl border bg-background shadow-sm transition-colors',
          'focus-within:border-primary focus-within:ring-1 focus-within:ring-primary'
        )}
      >
        {/* Formatting Toolbar */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b">
          {formatButtons.map(({ icon: Icon, label }) => (
            <Button
              key={label}
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        {/* Input Area */}
        <div className="flex items-end gap-2 p-2">
          <div className="flex items-center gap-1">
            <FileButton onFilesSelected={handleFilesSelected} />
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={`${placeholder} #${currentChannel?.name || 'channel'}`}
            disabled={disabled}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground',
              'min-h-[36px] max-h-[200px] py-2'
            )}
          />

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <AtSign className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Smile className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Mic className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              className={cn(
                'h-8 w-8 transition-colors',
                content.trim() || attachedFiles.length > 0
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground'
              )}
              onClick={handleSend}
              disabled={(!content.trim() && attachedFiles.length === 0) || disabled || uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Attached Files Preview */}
        <AttachedFiles files={attachedFiles} onRemove={handleRemoveFile} />
      </div>

      <p className="mt-2 text-xs text-center text-muted-foreground">
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd> to send,{' '}
        <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Shift + Enter</kbd> for new line
      </p>
    </div>
  );
}
