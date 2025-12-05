'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { X, Clock, Calendar, Send, Loader2 } from 'lucide-react';

interface ScheduleMessageModalProps {
  channelId: string;
  channelName: string;
  initialContent?: string;
  onClose: () => void;
  onScheduled?: () => void;
}

/**
 * Modal for scheduling a message to be sent later.
 */
export function ScheduleMessageModal({
  channelId,
  channelName,
  initialContent = '',
  onClose,
  onScheduled,
}: ScheduleMessageModalProps) {
  const { token, addScheduledMessage } = useStore();
  const [content, setContent] = useState(initialContent);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  // Quick schedule options
  const quickOptions = [
    { label: 'In 1 hour', getDate: () => new Date(Date.now() + 60 * 60 * 1000) },
    { label: 'In 3 hours', getDate: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
    { label: 'Tomorrow 9 AM', getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }},
    { label: 'Monday 9 AM', getDate: () => {
      const d = new Date();
      const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
      d.setDate(d.getDate() + daysUntilMonday);
      d.setHours(9, 0, 0, 0);
      return d;
    }},
  ];

  const handleQuickOption = (getDate: () => Date) => {
    const d = getDate();
    setDate(d.toISOString().split('T')[0]);
    setTime(d.toTimeString().slice(0, 5));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!content.trim()) {
      setError('Message content is required');
      return;
    }

    if (!date || !time) {
      setError('Please select a date and time');
      return;
    }

    const scheduledAt = new Date(`${date}T${time}`);
    if (scheduledAt <= new Date()) {
      setError('Scheduled time must be in the future');
      return;
    }

    setLoading(true);

    try {
      const message = await api.scheduled.create(
        {
          content: content.trim(),
          channelId,
          scheduledAt: scheduledAt.toISOString(),
        },
        token!
      );

      addScheduledMessage(message);
      onScheduled?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to schedule message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card rounded-2xl border shadow-2xl p-6 mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Schedule Message</h2>
              <p className="text-sm text-muted-foreground">#{channelName}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Message content */}
          <div className="space-y-2">
            <Label htmlFor="content">Message</Label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Type your message..."
              className="w-full h-24 px-3 py-2 rounded-lg border bg-background/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Quick options */}
          <div className="space-y-2">
            <Label>Quick schedule</Label>
            <div className="grid grid-cols-2 gap-2">
              {quickOptions.map((option) => (
                <Button
                  key={option.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickOption(option.getDate)}
                  className="justify-start"
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom date/time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  min={today}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Preview */}
          {date && time && (
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <span className="text-muted-foreground">Will be sent: </span>
              <span className="font-medium">
                {new Date(`${date}T${time}`).toLocaleString()}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1 gap-2">
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Schedule
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
