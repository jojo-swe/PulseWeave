"use client";

import * as React from "react";
import {
  Calculator,
  Calendar,
  CreditCard,
  Settings,
  Smile,
  User,
  Hash,
  LogOut,
  Zap,
  Search,
  Keyboard,
  PlusCircle,
  MessageSquare
} from "lucide-react";
import { motion } from "framer-motion";

interface CommandPaletteProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Props from page.tsx
  onClose: () => void;
  onOpenShortcuts?: () => void;
  onStartDM?: (userId: string) => Promise<void>;
  onCreateChannel?: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

export function CommandPalette({
  onClose,
  onOpenShortcuts,
  onStartDM,
  onCreateChannel,
  onOpenSettings,
  onLogout,
}: CommandPaletteProps) {
  
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [onClose]);

  const items = [
    { 
      icon: <Calendar className="mr-2 h-4 w-4" />, 
      label: "Calendar", 
      group: "Suggestions",
      action: () => {} 
    },
    { 
      icon: <Smile className="mr-2 h-4 w-4" />, 
      label: "Search Emoji", 
      group: "Suggestions",
      action: () => {}
    },
    { 
      icon: <PlusCircle className="mr-2 h-4 w-4" />, 
      label: "Create Channel", 
      group: "Actions",
      action: onCreateChannel
    },
    { 
      icon: <Keyboard className="mr-2 h-4 w-4" />, 
      label: "Keyboard Shortcuts", 
      group: "Actions",
      action: onOpenShortcuts
    },
    { 
      icon: <User className="mr-2 h-4 w-4" />, 
      label: "Profile", 
      shortcut: "⌘P", 
      group: "Settings",
      action: () => {}
    },
    { 
      icon: <Settings className="mr-2 h-4 w-4" />, 
      label: "Settings", 
      shortcut: "⌘S", 
      group: "Settings",
      action: onOpenSettings
    },
    { 
      icon: <LogOut className="mr-2 h-4 w-4" />, 
      label: "Log out", 
      group: "Settings",
      action: onLogout
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="glass p-1 rounded-xl shadow-2xl border-white/20 dark:border-white/10 w-full max-w-lg z-50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-border/50 px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Type a command or search..."
            autoFocus
          />
        </div>
        
        <div className="max-h-[300px] overflow-y-auto scrollbar-thin p-1">
          {/* Suggestions */}
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground text-primary/80">
            Suggestions
          </div>
          {items.filter(i => i.group === "Suggestions").map((item, idx) => (
            <div key={idx} onClick={() => { item.action?.(); onClose(); }} className="relative flex select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer data-[disabled]:pointer-events-none data-[disabled]:opacity-50">
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}
          
          <div className="h-px bg-border/50 my-1 mx-2" />
          
          {/* Actions */}
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Actions
          </div>
          {items.filter(i => i.group === "Actions").map((item, idx) => (
            <div key={idx} onClick={() => { item.action?.(); onClose(); }} className="relative flex select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer">
              {item.icon}
              <span>{item.label}</span>
            </div>
          ))}

          <div className="h-px bg-border/50 my-1 mx-2" />

          {/* Settings */}
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Settings
          </div>
          {items.filter(i => i.group === "Settings").map((item, idx) => (
              <div key={idx} onClick={() => { item.action?.(); onClose(); }} className={`relative flex select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer ${item.label === 'Log out' ? 'hover:bg-destructive/10 hover:text-destructive' : ''}`}>
              {item.icon}
              <span>{item.label}</span>
              {item.shortcut && (
                <span className="ml-auto text-xs tracking-widest text-muted-foreground">
                  {item.shortcut}
                </span>
              )}
            </div>
          ))}
        </div>
        
        <div className="border-t border-border/50 px-4 py-2 flex items-center justify-between text-[10px] text-muted-foreground bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-background rounded border border-border/50">↑</kbd>
              <kbd className="px-1 py-0.5 bg-background rounded border border-border/50">↓</kbd>
              <span>navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-background rounded border border-border/50">↵</kbd>
              <span>select</span>
            </span>
          </div>
          <div className="flex items-center gap-1 text-primary/60">
            <Zap className="h-3 w-3" />
            <span>PulseWeave</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default CommandPalette;
