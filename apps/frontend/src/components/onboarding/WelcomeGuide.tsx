'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store';
import { Button } from '@/components/ui/button';
import {
  X,
  MessageSquare,
  Users,
  Hash,
  Settings,
  Shield,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to PulseWeave!',
    description: 'Your new team communication hub. Let\'s get you set up in just a few steps.',
    icon: <Sparkles className="w-6 h-6" />,
  },
  {
    id: 'channels',
    title: 'Organize with Channels',
    description: 'Create channels for different topics, teams, or projects. Use #general for company-wide announcements.',
    icon: <Hash className="w-6 h-6" />,
    action: { label: 'Create a Channel', href: '/?action=create-channel' },
  },
  {
    id: 'messages',
    title: 'Start Conversations',
    description: 'Send messages, share files, and react with emojis. Use @mentions to notify specific people.',
    icon: <MessageSquare className="w-6 h-6" />,
  },
  {
    id: 'team',
    title: 'Invite Your Team',
    description: 'Collaboration is better together. Invite colleagues to join your workspace.',
    icon: <Users className="w-6 h-6" />,
    action: { label: 'Invite Members', href: '/settings?tab=team' },
  },
  {
    id: 'security',
    title: 'Secure Your Account',
    description: 'Enable two-factor authentication for extra security. Your data is encrypted end-to-end.',
    icon: <Shield className="w-6 h-6" />,
    action: { label: 'Security Settings', href: '/settings?tab=security' },
  },
  {
    id: 'customize',
    title: 'Make It Yours',
    description: 'Customize your profile, notification preferences, and choose your favorite theme.',
    icon: <Settings className="w-6 h-6" />,
    action: { label: 'Open Settings', href: '/settings' },
  },
];

const STORAGE_KEY = 'pulseweave-onboarding-completed';

/**
 * Welcome guide modal for new users.
 */
export function WelcomeGuide() {
  const { user } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Check if user has completed onboarding
    if (typeof window !== 'undefined' && user) {
      const completed = localStorage.getItem(STORAGE_KEY);
      if (!completed) {
        // Small delay to let the app load first
        const timeout = setTimeout(() => setIsOpen(true), 1000);
        return () => clearTimeout(timeout);
      }
    }
  }, [user]);

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsOpen(false);
  };

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setIsOpen(false);
  };

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (!isOpen) return null;

  const step = ONBOARDING_STEPS[currentStep];
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pt-6">
          {ONBOARDING_STEPS.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentStep(index)}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                index === currentStep
                  ? 'w-6 bg-primary'
                  : index < currentStep
                  ? 'bg-primary/50'
                  : 'bg-muted'
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center text-primary">
            {step.icon}
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-3">{step.title}</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">{step.description}</p>

          {step.action && (
            <Button
              variant="outline"
              size="sm"
              className="mb-6"
              onClick={() => {
                if (step.action?.href) {
                  window.location.href = step.action.href;
                }
                step.action?.onClick?.();
              }}
            >
              {step.action.label}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between px-8 pb-8">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          <Button onClick={handleNext} className="gap-1">
            {isLastStep ? (
              <>
                <Check className="w-4 h-4" />
                Get Started
              </>
            ) : (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>

        {/* Skip link */}
        <div className="text-center pb-6">
          <button
            onClick={handleSkip}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip tutorial
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Checklist component for tracking onboarding progress.
 */
export function OnboardingChecklist() {
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    // Load completed steps from storage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('pulseweave-onboarding-steps');
      if (stored) {
        setCompletedSteps(JSON.parse(stored));
      }
    }
  }, []);

  const toggleStep = (stepId: string) => {
    const newSteps = completedSteps.includes(stepId)
      ? completedSteps.filter((id) => id !== stepId)
      : [...completedSteps, stepId];
    
    setCompletedSteps(newSteps);
    localStorage.setItem('pulseweave-onboarding-steps', JSON.stringify(newSteps));
  };

  const progress = Math.round((completedSteps.length / ONBOARDING_STEPS.length) * 100);

  if (progress === 100) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-foreground">Getting Started</h3>
            <p className="text-sm text-muted-foreground">{progress}% complete</p>
          </div>
        </div>
        <ChevronRight
          className={cn(
            'w-5 h-5 text-muted-foreground transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-2">
          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {ONBOARDING_STEPS.slice(1).map((step) => (
            <button
              key={step.id}
              onClick={() => toggleStep(step.id)}
              className={cn(
                'w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left',
                completedSteps.includes(step.id)
                  ? 'bg-primary/5 text-muted-foreground'
                  : 'hover:bg-muted'
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                  completedSteps.includes(step.id)
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground'
                )}
              >
                {completedSteps.includes(step.id) && (
                  <Check className="w-3 h-3 text-primary-foreground" />
                )}
              </div>
              <span
                className={cn(
                  'text-sm',
                  completedSteps.includes(step.id) && 'line-through'
                )}
              >
                {step.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
