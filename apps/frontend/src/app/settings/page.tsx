'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store';
import { api, UserPreferences } from '@/lib/api';
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
  Briefcase,
  Sparkles,
  Clock,
  CreditCard,
} from 'lucide-react';
import type { Theme } from '@/components/theme-provider';
import { BillingSettings } from '@/components/settings/BillingSettings';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'appearance' | 'billing';

/**
 * User settings page.
 */
export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, setUser } = useStore();
  const { theme, setTheme } = useTheme();
  
  // Get initial tab from URL query parameter
  const tabFromUrl = searchParams.get('tab') as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabFromUrl && ['profile', 'security', 'notifications', 'appearance', 'billing'].includes(tabFromUrl)
      ? tabFromUrl
      : 'profile'
  );

  // Profile state
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // Preferences state
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [desktopNotifications, setDesktopNotifications] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mentionNotifications, setMentionNotifications] = useState(true);
  const [dmNotifications, setDmNotifications] = useState(true);
  const [channelNotifications, setChannelNotifications] = useState(true);
  const [threadReplies, setThreadReplies] = useState(true);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [notificationPreview, setNotificationPreview] = useState(true);
  
  // Status timeout state (in minutes)
  const [idleTimeout, setIdleTimeout] = useState(5);
  const [awayTimeout, setAwayTimeout] = useState(15);

  // Load preferences from backend
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await api.preferences.get();
        setDesktopNotifications(prefs.desktopNotifications);
        setSoundEnabled(prefs.soundEnabled);
        setMentionNotifications(prefs.mentionNotifications);
        setDmNotifications(prefs.dmNotifications);
        setChannelNotifications(prefs.channelNotifications);
        setThreadReplies(prefs.threadReplies);
        setQuietHoursEnabled(prefs.quietHoursEnabled);
        setQuietHoursStart(prefs.quietHoursStart);
        setQuietHoursEnd(prefs.quietHoursEnd);
        setNotificationPreview(prefs.notificationPreview);
        setIdleTimeout(prefs.idleTimeout);
        setAwayTimeout(prefs.awayTimeout);
        // Apply theme from preferences
        if (prefs.theme) {
          setTheme(prefs.theme);
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      } finally {
        setPreferencesLoading(false);
      }
    };
    loadPreferences();
  }, [setTheme]);

  // Save preferences to backend (debounced)
  const savePreferences = async (updates: Partial<UserPreferences>) => {
    setPreferencesSaving(true);
    try {
      await api.preferences.update(updates);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    } finally {
      setPreferencesSaving(false);
    }
  };

  // Wrapper functions to save on change
  const updatePreference = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
    setter: (v: UserPreferences[K]) => void
  ) => {
    setter(value);
    savePreferences({ [key]: value });
  };

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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB max for avatars)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/uploads', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      
      // Update avatar URL and save to profile
      setAvatarUrl(data.url);
      await api.users.update({ avatarUrl: data.url }, token || '');
      setUser({ ...user!, avatarUrl: data.url });
    } catch (error) {
      console.error('Failed to upload avatar:', error);
      alert('Failed to upload avatar. Please try again.');
    } finally {
      setAvatarUploading(false);
      // Reset file input
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  if (!user) {
    return null;
  }

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'billing' as const, label: 'Billing', icon: CreditCard },
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

              {/* Additional Links */}
              <div className="mt-6 pt-6 border-t space-y-1">
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
                <Link
                  href="/status"
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Monitor className="h-4 w-4" />
                    System Status
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
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarUpload}
                        className="hidden"
                        id="avatar-upload"
                      />
                      <button 
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="absolute bottom-0 right-0 p-1.5 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {avatarUploading ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : (
                          <Camera className="h-3.5 w-3.5" />
                        )}
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
                <div className="space-y-8">
                  <div>
                    <h2 className="text-lg font-semibold">Notification Settings</h2>
                    <p className="text-sm text-muted-foreground">
                      Control how and when you receive notifications
                    </p>
                  </div>

                  {/* General Notifications */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">General</h3>
                    
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Desktop Notifications</Label>
                        <p className="text-sm text-muted-foreground">
                          Show desktop notifications for new messages
                        </p>
                      </div>
                      <Switch
                        checked={desktopNotifications}
                        onCheckedChange={(v) => updatePreference('desktopNotifications', v, setDesktopNotifications)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Notification Sound</Label>
                        <p className="text-sm text-muted-foreground">
                          Play a sound when receiving notifications
                        </p>
                      </div>
                      <Switch
                        checked={soundEnabled}
                        onCheckedChange={(v) => updatePreference('soundEnabled', v, setSoundEnabled)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Show Message Preview</Label>
                        <p className="text-sm text-muted-foreground">
                          Display message content in notifications
                        </p>
                      </div>
                      <Switch
                        checked={notificationPreview}
                        onCheckedChange={(v) => updatePreference('notificationPreview', v, setNotificationPreview)}
                      />
                    </div>
                  </div>

                  {/* Notification Filtering */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Message Filtering</h3>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Mentions</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified when someone mentions you (@you)
                        </p>
                      </div>
                      <Switch
                        checked={mentionNotifications}
                        onCheckedChange={(v) => updatePreference('mentionNotifications', v, setMentionNotifications)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Direct Messages</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified for new direct messages
                        </p>
                      </div>
                      <Switch
                        checked={dmNotifications}
                        onCheckedChange={(v) => updatePreference('dmNotifications', v, setDmNotifications)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Channel Messages</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified for all messages in channels you joined
                        </p>
                      </div>
                      <Switch
                        checked={channelNotifications}
                        onCheckedChange={(v) => updatePreference('channelNotifications', v, setChannelNotifications)}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Thread Replies</Label>
                        <p className="text-sm text-muted-foreground">
                          Get notified when someone replies to a thread you participated in
                        </p>
                      </div>
                      <Switch
                        checked={threadReplies}
                        onCheckedChange={(v) => updatePreference('threadReplies', v, setThreadReplies)}
                      />
                    </div>
                  </div>

                  {/* Quiet Hours */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Quiet Hours</h3>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-0.5">
                        <Label className="text-base">Enable Quiet Hours</Label>
                        <p className="text-sm text-muted-foreground">
                          Mute all notifications during specified hours
                        </p>
                      </div>
                      <Switch
                        checked={quietHoursEnabled}
                        onCheckedChange={(v) => updatePreference('quietHoursEnabled', v, setQuietHoursEnabled)}
                      />
                    </div>

                    {quietHoursEnabled && (
                      <div className="flex items-center gap-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex-1 space-y-2">
                          <Label className="text-sm">Start Time</Label>
                          <Input
                            type="time"
                            value={quietHoursStart}
                            onChange={(e) => {
                              setQuietHoursStart(e.target.value);
                              savePreferences({ quietHoursStart: e.target.value });
                            }}
                            className="max-w-[140px]"
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <Label className="text-sm">End Time</Label>
                          <Input
                            type="time"
                            value={quietHoursEnd}
                            onChange={(e) => {
                              setQuietHoursEnd(e.target.value);
                              savePreferences({ quietHoursEnd: e.target.value });
                            }}
                            className="max-w-[140px]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status Timeouts */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Status Timeouts
                    </h3>

                    <div className="p-4 border rounded-lg space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-base">Idle Timeout</Label>
                          <span className="text-sm text-muted-foreground">{idleTimeout} minutes</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Time before your status changes to Away when inactive
                        </p>
                        <input
                          type="range"
                          min="1"
                          max="30"
                          value={idleTimeout}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setIdleTimeout(val);
                          }}
                          onMouseUp={() => savePreferences({ idleTimeout })}
                          onTouchEnd={() => savePreferences({ idleTimeout })}
                          className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>1 min</span>
                          <span>30 min</span>
                        </div>
                      </div>

                      <div className="border-t pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-base">Away Timeout</Label>
                          <span className="text-sm text-muted-foreground">{awayTimeout} minutes</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Time before your status changes to Offline when away
                        </p>
                        <input
                          type="range"
                          min="5"
                          max="120"
                          step="5"
                          value={awayTimeout}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setAwayTimeout(val);
                          }}
                          onMouseUp={() => savePreferences({ awayTimeout })}
                          onTouchEnd={() => savePreferences({ awayTimeout })}
                          className="w-full accent-primary"
                        />
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>5 min</span>
                          <span>2 hours</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'billing' && <BillingSettings />}

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
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                      <ThemeButton
                        icon={<Sun className="h-5 w-5" />}
                        label="Light"
                        description="Clean & bright"
                        isActive={theme === 'light'}
                        onClick={() => { setTheme('light'); savePreferences({ theme: 'light' }); }}
                      />
                      <ThemeButton
                        icon={<Moon className="h-5 w-5" />}
                        label="Dark"
                        description="Easy on the eyes"
                        isActive={theme === 'dark'}
                        onClick={() => { setTheme('dark'); savePreferences({ theme: 'dark' }); }}
                      />
                      <ThemeButton
                        icon={<Briefcase className="h-5 w-5" />}
                        label="Corporate"
                        description="Professional blue"
                        isActive={theme === 'corporate'}
                        onClick={() => { setTheme('corporate'); savePreferences({ theme: 'corporate' }); }}
                      />
                      <ThemeButton
                        icon={<Sparkles className="h-5 w-5" />}
                        label="Midnight"
                        description="Deep & vibrant"
                        isActive={theme === 'midnight'}
                        onClick={() => { setTheme('midnight'); savePreferences({ theme: 'midnight' }); }}
                      />
                      <ThemeButton
                        icon={<Monitor className="h-5 w-5" />}
                        label="System"
                        description="Match OS setting"
                        isActive={theme === 'system'}
                        onClick={() => { setTheme('system'); savePreferences({ theme: 'system' }); }}
                      />
                    </div>
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

interface ThemeButtonProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  isActive: boolean;
  onClick: () => void;
}

function ThemeButton({ icon, label, description, isActive, onClick }: ThemeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col items-center gap-2 p-4 border rounded-lg transition-all text-center',
        isActive 
          ? 'border-primary bg-primary/10 ring-2 ring-primary/20' 
          : 'hover:bg-muted hover:border-muted-foreground/20'
      )}
    >
      <div className={cn(
        'p-2 rounded-full',
        isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
      )}>
        {icon}
      </div>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
      {isActive && <Check className="h-4 w-4 text-primary" />}
    </button>
  );
}
