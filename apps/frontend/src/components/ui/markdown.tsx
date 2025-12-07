'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
  className?: string;
}

// Simple markdown parser - lightweight alternative to heavy markdown libraries
export function Markdown({ content, className }: MarkdownProps) {
  const html = React.useMemo(() => parseMarkdown(content), [content]);

  return (
    <div
      className={cn('prose prose-invert prose-sm max-w-none', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function parseMarkdown(text: string): string {
  let html = escapeHtml(text);

  // Code blocks ```code```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="bg-gray-800 rounded-md p-3 overflow-x-auto my-2"><code class="text-sm text-gray-200">${code.trim()}</code></pre>`;
  });

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-700 text-pink-400 px-1.5 py-0.5 rounded text-sm">$1</code>');

  // Bold **text** or __text__
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong class="font-semibold text-white">$1</strong>');

  // Italic *text* or _text_

  // Blockquote > text
  html = html.replace(
    /^&gt;\s?(.+)$/gm,
    '<blockquote class="border-l-4 border-gray-600 pl-3 my-1 text-gray-400 italic">$1</blockquote>'
  );

  // Headers (only ## and ### for chat context)
  html = html.replace(/^### (.+)$/gm, '<h4 class="text-base font-semibold text-white mt-2 mb-1">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="text-lg font-semibold text-white mt-2 mb-1">$1</h3>');

  // Lists - unordered
  html = html.replace(/^[-*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');

  // Lists - ordered
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');

  // Wrap consecutive <li> in <ul> or <ol>
  html = html.replace(/((?:<li class="ml-4 list-disc">.+<\/li>\n?)+)/g, '<ul class="my-1">$1</ul>');
  html = html.replace(/((?:<li class="ml-4 list-decimal">.+<\/li>\n?)+)/g, '<ol class="my-1">$1</ol>');

  // Line breaks - double newline = paragraph
  html = html.replace(/\n\n/g, '</p><p class="my-1">');
  
  // Single newline = <br>
  html = html.replace(/\n/g, '<br>');

  // Wrap in paragraph
  html = `<p class="my-0">${html}</p>`;

  // Clean up empty paragraphs
  html = html.replace(/<p class="my-\d+">\s*<\/p>/g, '');

  return html;
}

function escapeHtml(text: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  // Server-side fallback
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Export a hook for keyboard shortcuts in message input
export function useMarkdownShortcuts(
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  onChange: (value: string) => void
) {
  const wrapSelection = React.useCallback(
    (wrapper: string, endWrapper?: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const selected = text.substring(start, end);
      const before = text.substring(0, start);
      const after = text.substring(end);
      const end_wrapper = endWrapper || wrapper;

      const newText = `${before}${wrapper}${selected}${end_wrapper}${after}`;
      onChange(newText);

      // Restore cursor position
      setTimeout(() => {
        textarea.focus();
        if (selected) {
          textarea.setSelectionRange(start + wrapper.length, end + wrapper.length);
        } else {
          textarea.setSelectionRange(start + wrapper.length, start + wrapper.length);
        }
      }, 0);
    },
    [textareaRef, onChange]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case 'b':
            e.preventDefault();
            wrapSelection('**');
            break;
          case 'i':
            e.preventDefault();
            wrapSelection('*');
            break;
          case 'k':
            // Don't prevent - let command palette open
            break;
          case '`':
            e.preventDefault();
            wrapSelection('`');
            break;
        }
      }
    },
    [wrapSelection]
  );

  return { handleKeyDown, wrapSelection };
}
