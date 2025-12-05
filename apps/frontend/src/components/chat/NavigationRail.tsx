'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare, 
  Users, 
  Activity, 
  Settings, 
  LogOut,
  Bell 
} from 'lucide-react';
import { UserProfileModal } from './UserProfileModal';
import { Portal } from '@/components/ui/portal';

interface NavigationRailProps {
  activeTab?: 'chat' | 'activity' | 'teams';
  onTabChange?: (tab: 'chat' | 'activity' | 'teams') => void;
  onOpenProfile?: () => void;
}

export function NavigationRail({ 
  activeTab = 'chat', 
  onTabChange,
  onOpenProfile 
}: NavigationRailProps) {
  const { user, logout } = useStore();
  const [showProfile, setShowProfile] = useState(false);

  const handleProfileClick = () => {
    setShowProfile(true);
    onOpenProfile?.();
  };

  return (
    <div className="flex h-full w-[72px] flex-col items-center py-4 border-r border-white/5 relative z-20 bg-black/20 backdrop-blur-xl">
      {/* App Logo */}
      <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-lg shadow-primary/20">
        <Activity className="h-6 w-6" />
      </div>

      {/* Main Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-4 w-full px-2">
        <NavButton 
          icon={<MessageSquare className="h-5 w-5" />} 
          label="Chat" 
          isActive={activeTab === 'chat'} 
          onClick={() => onTabChange?.('chat')}
        />
        <NavButton 
          icon={<Bell className="h-5 w-5" />} 
          label="Activity" 
          isActive={activeTab === 'activity'} 
          onClick={() => onTabChange?.('activity')}
        />
        <NavButton 
          icon={<Users className="h-5 w-5" />} 
          label="Teams" 
          isActive={activeTab === 'teams'} 
          onClick={() => onTabChange?.('teams')}
        />
      </nav>

      {/* Bottom Actions */}
      <div className="flex flex-col items-center gap-4 mt-auto w-full px-2">
        <button 
          onClick={logout}
          className="group flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-white/10 hover:text-red-400"
          title="Log out"
        >
          <LogOut className="h-5 w-5" />
        </button>

        <button 
          onClick={handleProfileClick}
          className="relative h-10 w-10 shrink-0 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full"
        >
          <Avatar className="h-full w-full border-2 border-white/10">
            <AvatarImage src={user?.avatarUrl} />
            <AvatarFallback className={cn('text-xs', generateAvatarColor(user?.displayName || ''))}>
              {getInitials(user?.displayName || 'U')}
            </AvatarFallback>
          </Avatar>
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
        </button>
      </div>

      {/* User Profile Modal */}
      {showProfile && (
        <Portal>
          <UserProfileModal onClose={() => setShowProfile(false)} />
        </Portal>
      )}
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
    <div className="relative group w-full flex justify-center">
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-1 rounded-r-full bg-primary shadow-[0_0_10px_rgba(124,58,237,0.5)] animate-in fade-in duration-200" />
      )}
      <button
        onClick={onClick}
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200",
          isActive 
            ? "bg-primary/20 text-primary shadow-[inset_0_0_20px_rgba(124,58,237,0.1)]" 
            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        )}
        title={label}
      >
        {icon}
      </button>
    </div>
  );
}
