'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  MessageSquare, 
  Users, 
  Activity, 
  LogOut,
  Bell,
  Settings,
  Shield,
} from 'lucide-react';
import { UserProfileModal } from './UserProfileModal';
import { Portal } from '@/components/ui/portal';
import { StatusPicker } from './StatusPicker';

interface NavigationRailProps {
  activeTab?: 'chat' | 'activity' | 'friends';
  onTabChange?: (tab: 'chat' | 'activity' | 'friends') => void;
  onOpenProfile?: () => void;
}

export function NavigationRail({ 
  activeTab = 'chat', 
  onTabChange,
  onOpenProfile 
}: NavigationRailProps) {
  const router = useRouter();
  const { user, logout } = useStore();
  // Use user.status directly for consistency across all UI components
  const userStatus = user?.status || 'offline';
  const [showProfile, setShowProfile] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [statusPickerPosition, setStatusPickerPosition] = useState({ left: 0, bottom: 0 });
  const statusRef = useRef<HTMLButtonElement>(null);
  
  // Check if user is admin
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  const handleProfileClick = () => {
    setShowProfile(true);
    onOpenProfile?.();
  };

  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (statusRef.current) {
      const rect = statusRef.current.getBoundingClientRect();
      setStatusPickerPosition({
        left: rect.right + 8,
        bottom: window.innerHeight - rect.bottom,
      });
    }
    setShowStatusPicker(true);
  };

  return (
    <div className="flex h-full w-[72px] flex-col items-center py-4 border-r border-white/5 relative z-20 bg-black/20 backdrop-blur-xl">
      {/* App Logo */}
      <div className="mb-8 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 text-primary shadow-lg shadow-primary/20">
        <Activity className="h-6 w-6" />
      </div>

      {/* Main Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-2 w-full px-2">
        <NavButton 
          icon={<MessageSquare className="h-5 w-5" />} 
          label="Chat" 
          isActive={activeTab === 'chat'} 
          onClick={() => onTabChange?.('chat')}
        />
        <NavButton 
          icon={<Bell className="h-5 w-5" />} 
          label="Activity (Ctrl+Click for Settings)" 
          isActive={activeTab === 'activity'} 
          onClick={(e) => {
            if (e?.ctrlKey || e?.metaKey) {
              router.push('/settings?tab=notifications');
            } else {
              onTabChange?.('activity');
            }
          }}
        />
        <NavButton 
          icon={<Users className="h-5 w-5" />} 
          label="Friends" 
          isActive={activeTab === 'friends'} 
          onClick={() => onTabChange?.('friends')}
        />
        
        <div className="w-8 h-px bg-white/10 my-2" />
        
        <NavButton 
          icon={<Settings className="h-5 w-5" />} 
          label="Settings" 
          onClick={() => router.push('/settings')}
        />
        {isAdmin && (
          <NavButton 
            icon={<Shield className="h-5 w-5" />} 
            label="Admin" 
            onClick={() => router.push('/admin')}
          />
        )}
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

        <div className="relative">
          <button 
            onClick={handleProfileClick}
            className="relative h-10 w-10 shrink-0 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-full block"
            title="View Profile"
          >
            <Avatar className="h-full w-full border-2 border-white/10">
              <AvatarImage src={user?.avatarUrl} />
              <AvatarFallback className={cn('text-xs', generateAvatarColor(user?.displayName || ''))}>
                {getInitials(user?.displayName || 'U')}
              </AvatarFallback>
            </Avatar>
          </button>
          
          {/* Interactive Status Dot */}
          <button
            ref={statusRef}
            onClick={handleStatusClick}
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background flex items-center justify-center transition-transform hover:scale-125 z-10",
              userStatus === 'online' ? "bg-green-500" :
              userStatus === 'away' ? "bg-yellow-500" :
              (userStatus === 'dnd' || userStatus === 'busy') ? "bg-red-500" : "bg-gray-500"
            )}
            title="Change Status"
          >
             {/* Small inner dot for DND to show minus icon */}
             {(userStatus === 'dnd' || userStatus === 'busy') && <div className="w-1.5 h-0.5 bg-white rounded-full" />}
          </button>
        </div>
      </div>

      {/* User Profile Modal */}
      {showProfile && (
        <Portal>
          <UserProfileModal onClose={() => setShowProfile(false)} />
        </Portal>
      )}

      {/* Status Picker */}
      {showStatusPicker && (
        <Portal>
          <div 
            className="fixed z-[100]"
            style={{ 
              left: statusPickerPosition.left, 
              bottom: statusPickerPosition.bottom 
            }}
          >
            <StatusPicker onClose={() => setShowStatusPicker(false)} />
          </div>
        </Portal>
      )}
    </div>
  );
}

interface NavButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: (e?: React.MouseEvent) => void;
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
