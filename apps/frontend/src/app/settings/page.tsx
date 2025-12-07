'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import {
  ArrowLeft,
  User,
  Shield,
  Bell,
  Palette,
  Settings,
  Camera,
  Check,
  Sun,
  Moon,
  Monitor,
  Plug,
  ChevronRight,
} from 'lucide-react';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'appearance';

/**
 * User settings page.
 */
export default function SettingsPage() {
  const router = useRouter();
  const { user, token, setUser } = useStore();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Notification state
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mentionNotifications, setMentionNotifications] = useState(true);
  const [dmNotifications, setDmNotifications] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await api.get<any>('/auth/me');
        if (!userData) {
          router.push('/login');
        } else if (!user) {
           setUser(userData);
        }
      } catch (error) {
        router.push('/login');
      }
    };
    
    checkAuth();
  }, [router, setUser, user]);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [user]);

  const handleSaveProfile = async () => {
    // Token might be null in client state due to httpOnly cookies, but API client handles credentials
    setProfileSaving(true);
    setProfileSuccess(false);
    try {
      const updated = await api.users.update({ displayName, avatarUrl: avatarUrl || undefined }, token || '');
      setUser({ ...user!, displayName, avatarUrl });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 2000);
    } catch (error) {
      console.error('Failed to update profile:', error);
    } finally {
      setProfileSaving(false);
    }
  };

  if (!user) {
    return null;
  }

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'appearance' as const, label: 'Appearance', icon: Palette },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Chat
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Settings</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-8">
            {/* Sidebar */}
            <nav className="w-48 shrink-0">
              <ul className="space-y-1">
                {tabs.map((tab) => (
                  <li key={tab.id}>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        activeTab === tab.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  </li>
                ))}
              </ul>

              {/* Integrations Link */}
              <div className="mt-6 pt-6 border-t">
                <Link
                  href="/settings/integrations"
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Plug className="h-4 w-4" />
                    Integrations
                  </div>
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </nav>

            {/* Content */}
            <main className="flex-1 min-w-0">
              {activeTab === 'profile' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold">Profile Settings</h2>
                    <p className="text-sm text-muted-foreground">
                      Manage your public profile information
                    </p>
                  </div>

                  {/* Avatar */}
                  <div className="flex items-center gap-6">
                    <div className="relative">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={avatarUrl} />
                        <AvatarFallback className={cn('text-xl', generateAvatarColor(displayName))}>
                          {getInitials(displayName || 'U')}
                        </AvatarFallback>
                      </Avatar>
                      <button className="absolute bottom-0 right-0 p-1.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors">
                        <Camera className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">{user.displayName}</p>
                      <p className="text-sm text-muted-foreground">@{user.username}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>

                  {/* Display Name */}
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your display name"
                      className="max-w-md"
                    />
                    <p className="text-xs text-muted-foreground">
                      This is how others will see you in the app
                    </p>
                  </div>

                  {/* Avatar URL */}
                  <div className="space-y-2">
                    <Label htmlFor="avatarUrl">Avatar URL</Label>
                    <Input
                      id="avatarUrl"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/avatar.png"
                      className="max-w-md"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter a URL to an image for your avatar
                    </p>
                  </div>

                  {/* Save Button */}
                  <div className="flex items-center gap-3">
                    <Button 
                      onClick={handleSaveProfile} 
                      disabled={profileSaving}
                      className="min-w-[100px]"
                    >
                      {profileSaving ? 'Saving...' : profileSuccess ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Saved
                        </>
                      ) : 'Save Changes'}
                    </Button>
                    {profileSuccess && (
                      <span className="text-sm text-green-600">Profile updated successfully!</span>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'security' && <SecuritySettings />}

              {activeTab === 'notifications' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold">Notification Settings</h2>
                    <p className="text-sm text-muted-foreground">
                      Control how and when you receive notifications
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Desktop Notifications */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Desktop Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Show desktop notifications for new messages
                        </p>
                      </div>
                      <Switch
                        checked={desktopNotifications}
                        onCheckedChange={setDesktopNotifications}
                      />
                    </div>

                    {/* Sound */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Notification Sound</Label>
                        <p className="text-sm text-muted-foreground">
                          Play a sound when receiving notifications
                        </p>
                      </div>
                      <Switch
                        checked={soundEnabled}
                        onCheckedChange={setSoundEnabled}
                      />
                    </div>

                    {/* Mentions */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Mention Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified when someone mentions you
                        </p>
                      </div>
                      <Switch
                        checked={mentionNotifications}
                        onCheckedChange={setMentionNotifications}
                      />
                    </div>

                    {/* DMs */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Direct Message Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified for new direct messages
                        </p>
                      </div>
                      <Switch
                        checked={dmNotifications}
                        onCheckedChange={setDmNotifications}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-lg font-semibold">Appearance Settings</h2>
                    <p className="text-sm text-muted-foreground">
                      Customize the look and feel of the app
                    </p>
                  </div>

                  {/* Theme Selection */}
                  <div className="space-y-3">
                    <Label className="text-base">Theme</Label>
                    <div className="grid grid-cols-3 gap-3 max-w-md">
                      <button
                        onClick={() => setTheme('light')}
                        className={cn(
                          'flex flex-col items-center gap-2 p-4 border rounded-lg transition-colors',
                          theme === 'light' ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                        )}
                      >
                        <Sun className="h-6 w-6" />
                        <span className="text-sm font-medium">Light</span>
                        {theme === 'light' && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={cn(
                          'flex flex-col items-center gap-2 p-4 border rounded-lg transition-colors',
                          theme === 'dark' ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                        )}
                      >
                        <Moon className="h-6 w-6" />
                        <span className="text-sm font-medium">Dark</span>
                        {theme === 'dark' && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                      <button
                        onClick={() => setTheme('system')}
                        className={cn(
                          'flex flex-col items-center gap-2 p-4 border rounded-lg transition-colors',
                          theme === 'system' ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                        )}
                      >
                        <Monitor className="h-6 w-6" />
                        <span className="text-sm font-medium">System</span>
                        {theme === 'system' && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Choose your preferred color theme
                    </p>
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
