'use client';

import { cn } from '@/lib/utils';
import { MessageSquare, Bell, Users, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface BottomNavigationProps {
  activeTab?: 'chat' | 'activity' | 'friends';
  onTabChange?: (tab: 'chat' | 'activity' | 'friends') => void;
  className?: string;
}

export function BottomNavigation({ 
  activeTab = 'chat', 
  onTabChange,
  className 
}: BottomNavigationProps) {
  const router = useRouter();

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-xl border-t border-white/10 flex items-center justify-around px-2 z-50 lg:hidden",
      className
    )}>
      <NavButton 
        icon={<MessageSquare className="h-6 w-6" />} 
        label="Chat" 
        isActive={activeTab === 'chat'} 
        onClick={() => onTabChange?.('chat')}
      />
      <NavButton 
        icon={<Bell className="h-6 w-6" />} 
        label="Activity" 
        isActive={activeTab === 'activity'} 
        onClick={() => onTabChange?.('activity')}
      />
      <NavButton 
        icon={<Users className="h-6 w-6" />} 
        label="Friends" 
        isActive={activeTab === 'friends'} 
        onClick={() => onTabChange?.('friends')}
      />
      <NavButton 
        icon={<Settings className="h-6 w-6" />} 
        label="Settings" 
        onClick={() => router.push('/settings')}
      />
    </div>
  );
}

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
}

function NavButton({ icon, label, isActive, onClick }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-200 min-w-[64px]",
        isActive 
          ? "text-primary" 
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <div className={cn(
        "p-1 rounded-lg transition-colors",
        isActive && "bg-primary/10"
      )}>
        {icon}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
