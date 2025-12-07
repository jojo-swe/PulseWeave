'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook for managing keyboard navigation in lists.
 *
 * @example
 * ```tsx
 * const { activeIndex, handleKeyDown, setActiveIndex } = useKeyboardNavigation({
 *   itemCount: items.length,
 *   onSelect: (index) => handleSelect(items[index]),
 * });
 * ```
 */
export function useKeyboardNavigation({
  itemCount,
  onSelect,
  onEscape,
  loop = true,
  orientation = 'vertical',
}: {
  itemCount: number;
  onSelect?: (index: number) => void;
  onEscape?: () => void;
  loop?: boolean;
  orientation?: 'vertical' | 'horizontal';
}) {
  const [activeIndex, setActiveIndex] = useState(-1);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
      const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';

      switch (e.key) {
        case prevKey:
          e.preventDefault();
          setActiveIndex((prev) => {
            if (prev <= 0) {
              return loop ? itemCount - 1 : 0;
            }
            return prev - 1;
          });
          break;

        case nextKey:
          e.preventDefault();
          setActiveIndex((prev) => {
            if (prev >= itemCount - 1) {
              return loop ? 0 : itemCount - 1;
            }
            return prev + 1;
          });
          break;

        case 'Home':
          e.preventDefault();
          setActiveIndex(0);
          break;

        case 'End':
          e.preventDefault();
          setActiveIndex(itemCount - 1);
          break;

        case 'Enter':
        case ' ':
          e.preventDefault();
          if (activeIndex >= 0 && onSelect) {
            onSelect(activeIndex);
          }
          break;

        case 'Escape':
          e.preventDefault();
          setActiveIndex(-1);
          onEscape?.();
          break;
      }
    },
    [itemCount, loop, orientation, activeIndex, onSelect, onEscape]
  );

  // Reset active index when item count changes
  useEffect(() => {
    if (activeIndex >= itemCount) {
      setActiveIndex(itemCount - 1);
    }
  }, [itemCount, activeIndex]);

  return {
    activeIndex,
    setActiveIndex,
    handleKeyDown,
  };
}

/**
 * Hook for managing focus trap within a container.
 */
export function useFocusTrap(isActive: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    // Store the previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    const container = containerRef.current;
    if (!container) return;

    // Get all focusable elements
    const getFocusableElements = () => {
      return container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
    };

    // Focus the first element
    const focusableElements = getFocusableElements();
    if (focusableElements.length > 0) {
      focusableElements[0].focus();
    }

    // Handle tab key to trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to the previously focused element
      previousFocusRef.current?.focus();
    };
  }, [isActive]);

  return containerRef;
}

/**
 * Hook for announcing messages to screen readers.
 */
export function useAnnounce() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    // Create a live region if it doesn't exist
    let liveRegion = document.getElementById(`sr-announce-${priority}`);
    
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = `sr-announce-${priority}`;
      liveRegion.setAttribute('aria-live', priority);
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      liveRegion.style.cssText = `
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      `;
      document.body.appendChild(liveRegion);
    }

    // Clear and set the message (this triggers the announcement)
    liveRegion.textContent = '';
    setTimeout(() => {
      liveRegion!.textContent = message;
    }, 100);
  }, []);

  return announce;
}

/**
 * Hook for managing skip links.
 */
export function useSkipLink(targetId: string) {
  const handleClick = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      const target = document.getElementById(targetId);
      if (target) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    },
    [targetId]
  );

  return handleClick;
}

/**
 * Hook for reduced motion preference.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reducedMotion;
}

/**
 * Hook for managing roving tabindex in a group of elements.
 */
export function useRovingTabIndex<T extends HTMLElement>(
  items: React.RefObject<T>[],
  initialIndex = 0
) {
  const [focusedIndex, setFocusedIndex] = useState(initialIndex);

  useEffect(() => {
    items.forEach((item, index) => {
      if (item.current) {
        item.current.tabIndex = index === focusedIndex ? 0 : -1;
      }
    });
  }, [items, focusedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      let newIndex = currentIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          newIndex = (currentIndex + 1) % items.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          newIndex = (currentIndex - 1 + items.length) % items.length;
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = items.length - 1;
          break;
        default:
          return;
      }

      setFocusedIndex(newIndex);
      items[newIndex]?.current?.focus();
    },
    [items]
  );

  return {
    focusedIndex,
    setFocusedIndex,
    handleKeyDown,
  };
}

/**
 * ARIA live region component props.
 */
export interface LiveRegionProps {
  message: string;
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-atomic'?: boolean;
  className?: string;
}

/**
 * Generates ARIA attributes for a button.
 */
export function getButtonAriaProps({
  label,
  expanded,
  controls,
  pressed,
  disabled,
}: {
  label: string;
  expanded?: boolean;
  controls?: string;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return {
    'aria-label': label,
    ...(expanded !== undefined && { 'aria-expanded': expanded }),
    ...(controls && { 'aria-controls': controls }),
    ...(pressed !== undefined && { 'aria-pressed': pressed }),
    ...(disabled && { 'aria-disabled': true }),
  };
}

/**
 * Generates ARIA attributes for a dialog/modal.
 */
export function getDialogAriaProps({
  labelledBy,
  describedBy,
}: {
  labelledBy: string;
  describedBy?: string;
}) {
  return {
    role: 'dialog' as const,
    'aria-modal': true,
    'aria-labelledby': labelledBy,
    ...(describedBy && { 'aria-describedby': describedBy }),
  };
}

/**
 * Generates ARIA attributes for a list.
 */
export function getListAriaProps({
  label,
  multiselectable,
}: {
  label: string;
  multiselectable?: boolean;
}) {
  return {
    role: 'listbox' as const,
    'aria-label': label,
    ...(multiselectable && { 'aria-multiselectable': true }),
  };
}

/**
 * Generates ARIA attributes for a list item.
 */
export function getListItemAriaProps({
  selected,
  disabled,
  index,
  total,
}: {
  selected?: boolean;
  disabled?: boolean;
  index: number;
  total: number;
}) {
  return {
    role: 'option' as const,
    'aria-selected': selected,
    'aria-disabled': disabled,
    'aria-posinset': index + 1,
    'aria-setsize': total,
  };
}
