'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { FileButton, AttachedFiles } from './FileUpload';
import { EmojiPicker } from '@/components/ui/emoji-picker';
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
  Quote,
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

type FormatType = 'bold' | 'italic' | 'strikethrough' | 'code' | 'codeblock' | 'link' | 'ordered-list' | 'unordered-list' | 'quote';

export function MessageInput({
  onSend,
  onTyping,
  placeholder = 'Message',
  disabled = false,
}: MessageInputProps) {
  const { currentChannel, token, members } = useStore();
  const [content, setContent] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const mentionStartRef = useRef<number>(-1);

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

  // Filter members for mention suggestions
  const filteredMembers = useMemo(() => {
    if (!mentionSearch) return members.slice(0, 5);
    const search = mentionSearch.toLowerCase();
    return members
      .filter(m => 
        m.user.displayName.toLowerCase().includes(search) ||
        m.user.username.toLowerCase().includes(search)
      )
      .slice(0, 5);
  }, [members, mentionSearch]);

  // Apply markdown formatting to selected text or at cursor
  const applyFormat = useCallback((format: FormatType) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const beforeText = content.substring(0, start);
    const afterText = content.substring(end);

    let newText = '';
    let newCursorPos = start;

    switch (format) {
      case 'bold':
        if (selectedText) {
          newText = `${beforeText}**${selectedText}**${afterText}`;
          newCursorPos = end + 4;
        } else {
          newText = `${beforeText}****${afterText}`;
          newCursorPos = start + 2;
        }
        break;
      case 'italic':
        if (selectedText) {
          newText = `${beforeText}_${selectedText}_${afterText}`;
          newCursorPos = end + 2;
        } else {
          newText = `${beforeText}__${afterText}`;
          newCursorPos = start + 1;
        }
        break;
      case 'strikethrough':
        if (selectedText) {
          newText = `${beforeText}~~${selectedText}~~${afterText}`;
          newCursorPos = end + 4;
        } else {
          newText = `${beforeText}~~~~${afterText}`;
          newCursorPos = start + 2;
        }
        break;
      case 'code':
        if (selectedText) {
          newText = `${beforeText}\`${selectedText}\`${afterText}`;
          newCursorPos = end + 2;
        } else {
          newText = `${beforeText}\`\`${afterText}`;
          newCursorPos = start + 1;
        }
        break;
      case 'codeblock':
        if (selectedText) {
          newText = `${beforeText}\n\`\`\`\n${selectedText}\n\`\`\`\n${afterText}`;
          newCursorPos = end + 8;
        } else {
          newText = `${beforeText}\n\`\`\`\n\n\`\`\`\n${afterText}`;
          newCursorPos = start + 5;
        }
        break;
      case 'link':
        if (selectedText) {
          newText = `${beforeText}[${selectedText}](url)${afterText}`;
          newCursorPos = end + 3;
        } else {
          newText = `${beforeText}[text](url)${afterText}`;
          newCursorPos = start + 1;
        }
        break;
      case 'ordered-list':
        newText = `${beforeText}\n1. ${selectedText}${afterText}`;
        newCursorPos = start + 4;
        break;
      case 'unordered-list':
        newText = `${beforeText}\n- ${selectedText}${afterText}`;
        newCursorPos = start + 3;
        break;
      case 'quote':
        newText = `${beforeText}\n> ${selectedText}${afterText}`;
        newCursorPos = start + 3;
        break;
    }

    setContent(newText);
    
    // Restore focus and cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [content]);

  // Insert mention at cursor
  const insertMention = useCallback((username: string, displayName: string) => {
    const textarea = textareaRef.current;
    if (!textarea || mentionStartRef.current < 0) return;

    const beforeMention = content.substring(0, mentionStartRef.current);
    const afterCursor = content.substring(cursorPosition);
    const newText = `${beforeMention}@${username} ${afterCursor}`;
    
    setContent(newText);
    setShowMentions(false);
    setMentionSearch('');
    mentionStartRef.current = -1;
    
    setTimeout(() => {
      const newPos = beforeMention.length + username.length + 2;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }, [content, cursorPosition]);

  // Insert emoji at cursor
  const insertEmoji = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const beforeText = content.substring(0, start);
    const afterText = content.substring(start);
    const newText = `${beforeText}${emoji}${afterText}`;
    
    setContent(newText);
    setShowEmojiPicker(false);
    
    setTimeout(() => {
      const newPos = start + emoji.length;
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }, [content]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle mention navigation
    if (showMentions && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const member = filteredMembers[mentionIndex];
        if (member) {
          insertMention(member.user.username, member.user.displayName);
        }
        return;
      }
      if (e.key === 'Escape') {
        setShowMentions(false);
        return;
      }
    }

    // Handle keyboard shortcuts for formatting
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          applyFormat('bold');
          return;
        case 'i':
          e.preventDefault();
          applyFormat('italic');
          return;
        case 'e':
          e.preventDefault();
          applyFormat('code');
          return;
        case 'k':
          e.preventDefault();
          applyFormat('link');
          return;
      }
      if (e.shiftKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        applyFormat('strikethrough');
        return;
      }
    }

    // Send on Enter
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const pos = e.target.selectionStart;
    setContent(value);
    setCursorPosition(pos);

    // Check for @ mention trigger
    const textBeforeCursor = value.substring(0, pos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex >= 0) {
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      // Check if it's a valid mention context (no space between @ and cursor)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        mentionStartRef.current = lastAtIndex;
        setMentionSearch(textAfterAt);
        setShowMentions(true);
        setMentionIndex(0);
      } else {
        setShowMentions(false);
      }
    } else {
      setShowMentions(false);
    }

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

  const formatButtons: Array<{ icon: typeof Bold; label: string; format: FormatType; shortcut?: string }> = [
    { icon: Bold, label: 'Bold', format: 'bold', shortcut: 'Ctrl+B' },
    { icon: Italic, label: 'Italic', format: 'italic', shortcut: 'Ctrl+I' },
    { icon: Strikethrough, label: 'Strikethrough', format: 'strikethrough', shortcut: 'Ctrl+Shift+X' },
    { icon: Code, label: 'Code', format: 'code', shortcut: 'Ctrl+E' },
    { icon: Link, label: 'Link', format: 'link', shortcut: 'Ctrl+K' },
    { icon: ListOrdered, label: 'Numbered list', format: 'ordered-list' },
    { icon: List, label: 'Bulleted list', format: 'unordered-list' },
    { icon: Quote, label: 'Quote', format: 'quote' },
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
          {formatButtons.map(({ icon: Icon, label, format, shortcut }) => (
            <Button
              key={label}
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={shortcut ? `${label} (${shortcut})` : label}
              onClick={() => applyFormat(format)}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>

        {/* Input Area */}
        <div className="relative flex items-end gap-2 p-2">
          <div className="flex items-center gap-1">
            <FileButton onFilesSelected={handleFilesSelected} />
          </div>

          <div className="relative flex-1">
            {/* Mentions Autocomplete */}
            {showMentions && filteredMembers.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-64 bg-popover border rounded-lg shadow-lg overflow-hidden z-50">
                <div className="p-1">
                  {filteredMembers.map((member, index) => (
                    <button
                      key={member.user.id}
                      onClick={() => insertMention(member.user.username, member.user.displayName)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors',
                        index === mentionIndex ? 'bg-accent' : 'hover:bg-accent/50'
                      )}
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={member.user.avatarUrl} />
                        <AvatarFallback className={cn('text-xs', generateAvatarColor(member.user.displayName))}>
                          {getInitials(member.user.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <div className="font-medium">{member.user.displayName}</div>
                        <div className="text-xs text-muted-foreground">@{member.user.username}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={`${placeholder} #${currentChannel?.name || 'channel'}`}
              disabled={disabled}
              rows={1}
              className={cn(
                'w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground',
                'min-h-[36px] max-h-[200px] py-2'
              )}
            />
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => {
                // Trigger mention popup by inserting @
                const textarea = textareaRef.current;
                if (textarea) {
                  const start = textarea.selectionStart;
                  const before = content.substring(0, start);
                  const after = content.substring(start);
                  setContent(`${before}@${after}`);
                  mentionStartRef.current = start;
                  setShowMentions(true);
                  setTimeout(() => {
                    textarea.focus();
                    textarea.setSelectionRange(start + 1, start + 1);
                  }, 0);
                }
              }}
              title="Mention someone"
            >
              <AtSign className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-8 w-8 text-muted-foreground hover:text-foreground',
                  showEmojiPicker && 'bg-accent text-foreground'
                )}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Add emoji"
              >
                <Smile className="h-4 w-4" />
              </Button>
              {showEmojiPicker && (
                <div className="absolute bottom-full right-0 mb-2 z-50">
                  <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmojiPicker(false)} />
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground opacity-50 cursor-not-allowed"
              title="Voice messages"
              disabled
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
