'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  Webhook,
  Key,
  Plug,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Check,
  X,
  Loader2,
  ExternalLink,
  RefreshCw,
  Play,
  AlertTriangle,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  Zap,
  Mail,
  MessageSquare,
  Code,
  Send,
} from 'lucide-react';

type Tab = 'webhooks' | 'incoming' | 'apikeys' | 'integrations';

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  secret: string | null;
  createdAt: string;
  _count?: { deliveries: number };
}

interface IncomingWebhook {
  id: string;
  name: string;
  token: string;
  webhookUrl: string;
  channelId: string | null;
  channel: { id: string; name: string } | null;
  isActive: boolean;
  usageCount: number;
  lastUsedAt: string | null;
}

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  key?: string;
  scopes: string[];
  isActive: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface Integration {
  id: string;
  type: string;
  name: string;
  config: Record<string, any>;
  isActive: boolean;
  status: string;
  lastSyncAt: string | null;
  typeInfo: any;
}

/**
 * Integrations settings page for managing webhooks, API keys, and external integrations.
 */
export default function IntegrationsPage() {
  const router = useRouter();
  const { token, currentWorkspace, channels } = useStore();
  const [activeTab, setActiveTab] = useState<Tab>('webhooks');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Data states
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [incomingWebhooks, setIncomingWebhooks] = useState<IncomingWebhook[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhookEvents, setWebhookEvents] = useState<Record<string, string>>({});
  const [apiScopes, setApiScopes] = useState<Record<string, string>>({});
  const [integrationTypes, setIntegrationTypes] = useState<Record<string, any>>({});

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    if (!currentWorkspace?.id) {
      // Workspace not loaded yet, wait for it
      return;
    }
    loadData();
  }, [token, currentWorkspace?.id, activeTab]);

  const loadData = async () => {
    if (!currentWorkspace?.id) {
      setError('No workspace selected. Please select a workspace first.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');

    try {
      if (activeTab === 'webhooks') {
        const [data, events] = await Promise.all([
          api.webhooks.list(currentWorkspace.id, token!),
          api.webhooks.getEvents(token!),
        ]);
        setWebhooks(data);
        setWebhookEvents(events);
      } else if (activeTab === 'incoming') {
        const data = await api.incomingWebhooks.list(currentWorkspace.id, token!);
        setIncomingWebhooks(data);
      } else if (activeTab === 'apikeys') {
        const [data, scopes] = await Promise.all([
          api.apiKeys.list(currentWorkspace.id, token!),
          api.apiKeys.getScopes(token!),
        ]);
        setApiKeys(data);
        setApiScopes(scopes);
      } else if (activeTab === 'integrations') {
        const [data, types] = await Promise.all([
          api.integrations.list(currentWorkspace.id, token!),
          api.integrations.getTypes(token!),
        ]);
        setIntegrations(data);
        setIntegrationTypes(types);
      }
    } catch (err: any) {
      const message = err.message || 'Failed to load data';
      if (message.includes('Admin access required') || message.includes('forbidden')) {
        setError('You need admin or owner permissions to access integrations settings.');
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTest = async (id: string, type: 'webhook' | 'integration') => {
    setTestingId(id);
    setTestResult(null);
    try {
      const result = type === 'webhook'
        ? await api.webhooks.test(id, token!)
        : await api.integrations.test(id, token!);
      setTestResult({
        id,
        success: result.success,
        message: result.success
          ? `Success! Status: ${result.statusCode}`
          : result.error || 'Test failed',
      });
    } catch (err: any) {
      setTestResult({ id, success: false, message: err.message });
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async (id: string, type: Tab) => {
    if (!confirm('Are you sure you want to delete this?')) return;
    try {
      if (type === 'webhooks') {
        await api.webhooks.delete(id, token!);
        setWebhooks((prev) => prev.filter((w) => w.id !== id));
      } else if (type === 'incoming') {
        await api.incomingWebhooks.delete(id, token!);
        setIncomingWebhooks((prev) => prev.filter((w) => w.id !== id));
      } else if (type === 'apikeys') {
        await api.apiKeys.delete(id, token!);
        setApiKeys((prev) => prev.filter((k) => k.id !== id));
      } else if (type === 'integrations') {
        await api.integrations.delete(id, token!);
        setIntegrations((prev) => prev.filter((i) => i.id !== id));
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean, type: Tab) => {
    try {
      if (type === 'webhooks') {
        await api.webhooks.update(id, { isActive: !isActive }, token!);
        setWebhooks((prev) =>
          prev.map((w) => (w.id === id ? { ...w, isActive: !isActive } : w))
        );
      } else if (type === 'incoming') {
        await api.incomingWebhooks.update(id, { isActive: !isActive }, token!);
        setIncomingWebhooks((prev) =>
          prev.map((w) => (w.id === id ? { ...w, isActive: !isActive } : w))
        );
      } else if (type === 'apikeys') {
        await api.apiKeys.update(id, { isActive: !isActive }, token!);
        setApiKeys((prev) =>
          prev.map((k) => (k.id === id ? { ...k, isActive: !isActive } : k))
        );
      } else if (type === 'integrations') {
        await api.integrations.update(id, { isActive: !isActive }, token!);
        setIntegrations((prev) =>
          prev.map((i) => (i.id === id ? { ...i, isActive: !isActive } : i))
        );
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const tabs = [
    { id: 'webhooks' as Tab, label: 'Outgoing Webhooks', icon: Send, description: 'Notify external services of events' },
    { id: 'incoming' as Tab, label: 'Incoming Webhooks', icon: Webhook, description: 'Receive data from external services' },
    { id: 'apikeys' as Tab, label: 'API Keys', icon: Key, description: 'Authenticate external API access' },
    { id: 'integrations' as Tab, label: 'Integrations', icon: Plug, description: 'Connect to n8n, Zapier, and more' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-yellow-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return CheckCircle;
      case 'error':
        return AlertTriangle;
      default:
        return Clock;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/settings">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Settings
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Integrations</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          {/* Tabs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'p-4 rounded-xl border text-left transition-all',
                  activeTab === tab.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                <tab.icon className={cn('h-5 w-5 mb-2', activeTab === tab.id ? 'text-primary' : 'text-muted-foreground')} />
                <div className="font-medium text-sm">{tab.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{tab.description}</div>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="space-y-4">
            {/* Header with Add button */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {tabs.find((t) => t.id === activeTab)?.label}
              </h2>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add New
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Outgoing Webhooks */}
                {activeTab === 'webhooks' && (
                  <div className="space-y-3">
                    {webhooks.length === 0 ? (
                      <div className="text-center p-12 border rounded-xl border-dashed">
                        <Send className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <h3 className="font-medium mb-1">No webhooks configured</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Create a webhook to notify external services when events occur
                        </p>
                        <Button onClick={() => setShowCreateModal(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Webhook
                        </Button>
                      </div>
                    ) : (
                      webhooks.map((webhook) => (
                        <div
                          key={webhook.id}
                          className={cn(
                            'p-4 rounded-xl border',
                            webhook.isActive ? 'bg-card' : 'bg-muted/30 opacity-60'
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium">{webhook.name}</h3>
                                {!webhook.isActive && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                    Disabled
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground truncate">{webhook.url}</p>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {webhook.events.map((event) => (
                                  <span
                                    key={event}
                                    className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary"
                                  >
                                    {event}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {testResult?.id === webhook.id && (
                                <span className={cn('text-xs', testResult.success ? 'text-green-500' : 'text-red-500')}>
                                  {testResult.message}
                                </span>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleTest(webhook.id, 'webhook')}
                                disabled={testingId === webhook.id}
                              >
                                {testingId === webhook.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Play className="h-3 w-3" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleActive(webhook.id, webhook.isActive, 'webhooks')}
                              >
                                {webhook.isActive ? 'Disable' : 'Enable'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDelete(webhook.id, 'webhooks')}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Incoming Webhooks */}
                {activeTab === 'incoming' && (
                  <div className="space-y-3">
                    {incomingWebhooks.length === 0 ? (
                      <div className="text-center p-12 border rounded-xl border-dashed">
                        <Webhook className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <h3 className="font-medium mb-1">No incoming webhooks</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Create an incoming webhook to receive messages from external services
                        </p>
                        <Button onClick={() => setShowCreateModal(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Incoming Webhook
                        </Button>
                      </div>
                    ) : (
                      incomingWebhooks.map((webhook) => (
                        <div
                          key={webhook.id}
                          className={cn(
                            'p-4 rounded-xl border',
                            webhook.isActive ? 'bg-card' : 'bg-muted/30 opacity-60'
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium">{webhook.name}</h3>
                                {webhook.channel && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-muted">
                                    #{webhook.channel.name}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                                  {webhook.webhookUrl}
                                </code>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleCopy(webhook.webhookUrl, webhook.id)}
                                >
                                  {copiedId === webhook.id ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                Used {webhook.usageCount} times
                                {webhook.lastUsedAt && ` • Last used ${new Date(webhook.lastUsedAt).toLocaleDateString()}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleActive(webhook.id, webhook.isActive, 'incoming')}
                              >
                                {webhook.isActive ? 'Disable' : 'Enable'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDelete(webhook.id, 'incoming')}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* API Keys */}
                {activeTab === 'apikeys' && (
                  <div className="space-y-3">
                    {apiKeys.length === 0 ? (
                      <div className="text-center p-12 border rounded-xl border-dashed">
                        <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <h3 className="font-medium mb-1">No API keys</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Create an API key to authenticate external services
                        </p>
                        <Button onClick={() => setShowCreateModal(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create API Key
                        </Button>
                      </div>
                    ) : (
                      apiKeys.map((key) => (
                        <div
                          key={key.id}
                          className={cn(
                            'p-4 rounded-xl border',
                            key.isActive ? 'bg-card' : 'bg-muted/30 opacity-60'
                          )}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium">{key.name}</h3>
                                {!key.isActive && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                    Disabled
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <code className="text-xs bg-muted px-2 py-1 rounded">
                                  {key.keyPrefix}••••••••
                                </code>
                                {key.key && (
                                  <>
                                    <code className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded flex-1 truncate">
                                      {key.key}
                                    </code>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleCopy(key.key!, key.id)}
                                    >
                                      {copiedId === key.id ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                      ) : (
                                        <Copy className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 mt-2">
                                {key.scopes.map((scope) => (
                                  <span
                                    key={scope}
                                    className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary"
                                  >
                                    {scope}
                                  </span>
                                ))}
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                {key.expiresAt
                                  ? `Expires ${new Date(key.expiresAt).toLocaleDateString()}`
                                  : 'Never expires'}
                                {key.lastUsedAt && ` • Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleActive(key.id, key.isActive, 'apikeys')}
                              >
                                {key.isActive ? 'Disable' : 'Enable'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDelete(key.id, 'apikeys')}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Integrations */}
                {activeTab === 'integrations' && (
                  <div className="space-y-3">
                    {integrations.length === 0 ? (
                      <div className="text-center p-12 border rounded-xl border-dashed">
                        <Plug className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <h3 className="font-medium mb-1">No integrations</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Connect PulseWeave to n8n, Zapier, and other services
                        </p>
                        <Button onClick={() => setShowCreateModal(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Integration
                        </Button>
                      </div>
                    ) : (
                      integrations.map((integration) => {
                        const StatusIcon = getStatusIcon(integration.status);
                        return (
                          <div
                            key={integration.id}
                            className={cn(
                              'p-4 rounded-xl border',
                              integration.isActive ? 'bg-card' : 'bg-muted/30 opacity-60'
                            )}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="font-medium">{integration.name}</h3>
                                  <span className="text-xs px-2 py-0.5 rounded bg-muted">
                                    {integration.typeInfo?.displayName || integration.type}
                                  </span>
                                  <StatusIcon className={cn('h-4 w-4', getStatusColor(integration.status))} />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {integration.typeInfo?.description}
                                </p>
                                {integration.lastSyncAt && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    Last synced {new Date(integration.lastSyncAt).toLocaleString()}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {testResult?.id === integration.id && (
                                  <span className={cn('text-xs', testResult.success ? 'text-green-500' : 'text-red-500')}>
                                    {testResult.message}
                                  </span>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleTest(integration.id, 'integration')}
                                  disabled={testingId === integration.id}
                                >
                                  {testingId === integration.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Play className="h-3 w-3" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleToggleActive(integration.id, integration.isActive, 'integrations')}
                                >
                                  {integration.isActive ? 'Disable' : 'Enable'}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => handleDelete(integration.id, 'integrations')}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Documentation */}
          <div className="mt-12 p-6 rounded-xl bg-muted/30 border border-dashed">
            <h3 className="font-medium mb-2">📚 Documentation</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Learn how to integrate PulseWeave with your favorite tools and services.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-1">External API</h4>
                <p className="text-muted-foreground text-xs">
                  Use API keys to read messages, send notifications, and manage channels programmatically.
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Webhooks</h4>
                <p className="text-muted-foreground text-xs">
                  Receive real-time notifications when events occur in your workspace.
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">n8n / Zapier</h4>
                <p className="text-muted-foreground text-xs">
                  Connect to workflow automation tools to build powerful integrations.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Modal - Simplified for now */}
      {showCreateModal && (
        <CreateModal
          type={activeTab}
          webhookEvents={webhookEvents}
          apiScopes={apiScopes}
          integrationTypes={integrationTypes}
          channels={channels}
          workspaceId={currentWorkspace?.id || ''}
          token={token!}
          onClose={() => setShowCreateModal(false)}
          onCreated={(item) => {
            if (activeTab === 'webhooks') setWebhooks((prev) => [item, ...prev]);
            else if (activeTab === 'incoming') setIncomingWebhooks((prev) => [item, ...prev]);
            else if (activeTab === 'apikeys') setApiKeys((prev) => [item, ...prev]);
            else if (activeTab === 'integrations') setIntegrations((prev) => [item, ...prev]);
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}

// Create Modal Component
interface CreateModalProps {
  type: Tab;
  webhookEvents: Record<string, string>;
  apiScopes: Record<string, string>;
  integrationTypes: Record<string, any>;
  channels: any[];
  workspaceId: string;
  token: string;
  onClose: () => void;
  onCreated: (item: any) => void;
}

function CreateModal({
  type,
  webhookEvents,
  apiScopes,
  integrationTypes,
  channels,
  workspaceId,
  token,
  onClose,
  onCreated,
}: CreateModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      let result;
      if (type === 'webhooks') {
        result = await api.webhooks.create(workspaceId, {
          name,
          url,
          events: selectedEvents,
        }, token);
      } else if (type === 'incoming') {
        result = await api.incomingWebhooks.create(workspaceId, {
          name,
          channelId: selectedChannel || undefined,
        }, token);
      } else if (type === 'apikeys') {
        result = await api.apiKeys.create(workspaceId, {
          name,
          scopes: selectedScopes,
        }, token);
      } else if (type === 'integrations') {
        result = await api.integrations.create(workspaceId, {
          type: selectedType,
          name,
          config,
        }, token);
      }
      onCreated(result);
    } catch (err: any) {
      setError(err.message || 'Failed to create');
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (type) {
      case 'webhooks': return 'Create Outgoing Webhook';
      case 'incoming': return 'Create Incoming Webhook';
      case 'apikeys': return 'Create API Key';
      case 'integrations': return 'Add Integration';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-2xl border shadow-2xl p-6 mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">{getTitle()}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Integration"
              required
            />
          </div>

          {type === 'webhooks' && (
            <>
              <div>
                <Label>URL</Label>
                <Input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/webhook"
                  required
                />
              </div>
              <div>
                <Label>Events</Label>
                <div className="mt-2 max-h-48 overflow-y-auto space-y-2 p-3 border rounded-lg">
                  {Object.entries(webhookEvents).map(([event, description]) => (
                    <label key={event} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedEvents.includes(event)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEvents((prev) => [...prev, event]);
                          } else {
                            setSelectedEvents((prev) => prev.filter((e) => e !== event));
                          }
                        }}
                        className="mt-1"
                      />
                      <div>
                        <div className="text-sm font-medium">{event}</div>
                        <div className="text-xs text-muted-foreground">{description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {type === 'incoming' && (
            <div>
              <Label>Target Channel (optional)</Label>
              <select
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
              >
                <option value="">Select a channel...</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {type === 'apikeys' && (
            <div>
              <Label>Scopes</Label>
              <div className="mt-2 max-h-48 overflow-y-auto space-y-2 p-3 border rounded-lg">
                {Object.entries(apiScopes).map(([scope, description]) => (
                  <label key={scope} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedScopes((prev) => [...prev, scope]);
                        } else {
                          setSelectedScopes((prev) => prev.filter((s) => s !== scope));
                        }
                      }}
                      className="mt-1"
                    />
                    <div>
                      <div className="text-sm font-medium">{scope}</div>
                      <div className="text-xs text-muted-foreground">{description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {type === 'integrations' && (
            <>
              <div>
                <Label>Integration Type</Label>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value);
                    setConfig({});
                  }}
                  className="w-full mt-1 px-3 py-2 border rounded-lg bg-background"
                  required
                >
                  <option value="">Select type...</option>
                  {Object.entries(integrationTypes).map(([key, info]: [string, any]) => (
                    <option key={key} value={key}>
                      {info.displayName}
                    </option>
                  ))}
                </select>
              </div>
              {selectedType && integrationTypes[selectedType] && (
                <div className="space-y-3">
                  {Object.entries(integrationTypes[selectedType].configSchema || {}).map(
                    ([field, schema]: [string, any]) => (
                      <div key={field}>
                        <Label>{schema.label}</Label>
                        <Input
                          value={config[field] || ''}
                          onChange={(e) =>
                            setConfig((prev) => ({ ...prev, [field]: e.target.value }))
                          }
                          required={schema.required}
                          placeholder={schema.label}
                        />
                      </div>
                    )
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
