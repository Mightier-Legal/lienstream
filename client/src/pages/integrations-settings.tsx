import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Webhook,
  ChevronLeft,
  Eye,
  EyeOff,
  RefreshCw,
  Save,
  Send,
  CheckCircle2,
  XCircle,
  Plus,
  Pencil,
  Trash2
} from "lucide-react";

// Slack logo SVG component
function SlackLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="currentColor"/>
    </svg>
  );
}

interface AppSetting {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function IntegrationsSettings() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<AppSetting | null>(null);
  const [deletingWebhook, setDeletingWebhook] = useState<AppSetting | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  // Form state
  const [formKey, setFormKey] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [showFormValue, setShowFormValue] = useState(false);

  // Fetch all settings and filter to Slack webhooks
  const { data: allSettings = [], isLoading } = useQuery<AppSetting[]>({
    queryKey: ['/api/settings'],
  });

  // Filter to only Slack webhook settings
  const slackWebhooks = allSettings.filter(s => s.key.startsWith('SLACK_WEBHOOK'));

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { key: string; value: string; description: string | null }) => {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          isSecret: true
        })
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save webhook');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/status'] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: editingWebhook ? "Webhook Updated" : "Webhook Added",
        description: `${formKey} has been saved successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save webhook",
        variant: "destructive"
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await fetch(`/api/settings/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to delete webhook');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/integrations/status'] });
      setIsDeleteDialogOpen(false);
      setDeletingWebhook(null);
      toast({
        title: "Webhook Removed",
        description: "The Slack webhook has been deleted",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete webhook",
        variant: "destructive"
      });
    }
  });

  // Test webhook mutation
  const testMutation = useMutation({
    mutationFn: async (key: string) => {
      setTestingKey(key);
      const response = await fetch('/api/integrations/slack/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key })
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Test failed');
      }
      return { key, ...data };
    },
    onSuccess: (data) => {
      setTestResults(prev => ({ ...prev, [data.key]: { success: true } }));
      setTestingKey(null);
      toast({
        title: "Test Successful",
        description: "Check your Slack channel for the test message",
      });
    },
    onError: (error, key) => {
      const errorMsg = error instanceof Error ? error.message : 'Test failed';
      setTestResults(prev => ({ ...prev, [key]: { success: false, error: errorMsg } }));
      setTestingKey(null);
      toast({
        title: "Test Failed",
        description: errorMsg,
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setFormKey("");
    setFormValue("");
    setFormDescription("");
    setShowFormValue(false);
    setEditingWebhook(null);
  };

  const handleAdd = () => {
    resetForm();
    setFormKey("SLACK_WEBHOOK_");
    setFormDescription("Slack webhook for ");
    setIsDialogOpen(true);
  };

  const handleEdit = async (webhook: AppSetting) => {
    setEditingWebhook(webhook);
    setFormKey(webhook.key);
    setFormDescription(webhook.description || "");
    setShowFormValue(false);

    // Reveal the actual value
    try {
      const response = await fetch(`/api/settings/${encodeURIComponent(webhook.key)}/reveal`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        setFormValue(data.value || '');
      }
    } catch (e) {
      setFormValue("");
    }

    setIsDialogOpen(true);
  };

  const handleDelete = (webhook: AppSetting) => {
    setDeletingWebhook(webhook);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = () => {
    if (!formKey.trim()) {
      toast({
        title: "Validation Error",
        description: "Key name is required",
        variant: "destructive"
      });
      return;
    }

    if (!formKey.startsWith('SLACK_WEBHOOK')) {
      toast({
        title: "Validation Error",
        description: "Key must start with SLACK_WEBHOOK",
        variant: "destructive"
      });
      return;
    }

    if (!formValue.trim()) {
      toast({
        title: "Validation Error",
        description: "Webhook URL is required",
        variant: "destructive"
      });
      return;
    }

    if (!formValue.startsWith('https://hooks.slack.com/')) {
      toast({
        title: "Invalid URL",
        description: "Webhook URL must start with https://hooks.slack.com/",
        variant: "destructive"
      });
      return;
    }

    saveMutation.mutate({
      key: formKey.trim().toUpperCase(),
      value: formValue,
      description: formDescription.trim() || null
    });
  };

  // Helper to get a friendly name from the key
  const getFriendlyName = (key: string) => {
    // SLACK_WEBHOOK_URL -> "Default"
    // SLACK_WEBHOOK_AIRTABLE -> "Airtable"
    // SLACK_WEBHOOK_ERRORS -> "Errors"
    if (key === 'SLACK_WEBHOOK_URL') return 'Default';
    const suffix = key.replace('SLACK_WEBHOOK_', '').replace(/_/g, ' ');
    return suffix.charAt(0).toUpperCase() + suffix.slice(1).toLowerCase();
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="gap-2 text-slate-600 hover:text-slate-900 -ml-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Settings
            </Button>
          </Link>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Webhook className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Integrations</h1>
              <p className="text-sm text-slate-500">
                Connect external services for notifications and automation
              </p>
            </div>
          </div>
        </div>

        {/* Slack Integration Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#4A154B]/10 rounded-lg">
                  <SlackLogo className="h-6 w-6 text-[#4A154B]" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Slack Webhooks
                    {slackWebhooks.length > 0 && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {slackWebhooks.length} configured
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    Send notifications to Slack channels when events occur
                  </CardDescription>
                </div>
              </div>
              <Button onClick={handleAdd} size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Webhook
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Info box */}
            <div className="bg-slate-50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium text-slate-700">How it works:</p>
              <ul className="text-sm text-slate-600 space-y-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  <code className="text-xs bg-white px-1 rounded">SLACK_WEBHOOK_URL</code> is used for Airtable sync notifications
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  Create additional webhooks for different channels or purposes
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  Works with both manual and scheduled syncs
                </li>
              </ul>
            </div>

            {/* Webhooks List */}
            {slackWebhooks.length === 0 ? (
              <div className="text-center py-8 border border-dashed rounded-lg">
                <SlackLogo className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500 mb-3">No Slack webhooks configured</p>
                <Button onClick={handleAdd} variant="outline" size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" />
                  Add Your First Webhook
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border rounded-lg">
                {slackWebhooks.map((webhook) => (
                  <div key={webhook.id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                            {webhook.key}
                          </code>
                          <span className="text-xs text-slate-400">
                            ({getFriendlyName(webhook.key)})
                          </span>
                        </div>
                        {webhook.description && (
                          <p className="text-xs text-slate-500 mt-1">{webhook.description}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <code className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded">
                            ••••••••••••••••
                          </code>
                        </div>

                        {/* Test Result */}
                        {testResults[webhook.key] && (
                          <div className={`flex items-center gap-2 text-xs mt-2 ${testResults[webhook.key].success ? 'text-green-600' : 'text-red-600'}`}>
                            {testResults[webhook.key].success ? (
                              <>
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Test sent successfully
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3.5 w-3.5" />
                                {testResults[webhook.key].error}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs gap-1"
                          onClick={() => testMutation.mutate(webhook.key)}
                          disabled={testingKey === webhook.key}
                        >
                          {testingKey === webhook.key ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleEdit(webhook)}
                        >
                          <Pencil className="h-4 w-4 text-slate-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:text-red-600"
                          onClick={() => handleDelete(webhook)}
                        >
                          <Trash2 className="h-4 w-4 text-slate-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Future Integrations Placeholder */}
        <Card className="border-dashed opacity-60">
          <CardContent className="py-8">
            <div className="text-center">
              <Webhook className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                More integrations coming soon
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWebhook ? 'Edit Webhook' : 'Add Slack Webhook'}</DialogTitle>
            <DialogDescription>
              {editingWebhook
                ? 'Update the webhook URL or description'
                : 'Add a new Slack incoming webhook for notifications'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Key Input */}
            <div className="space-y-2">
              <Label htmlFor="key">Key Name</Label>
              <Input
                id="key"
                value={formKey}
                onChange={(e) => setFormKey(e.target.value.toUpperCase())}
                placeholder="SLACK_WEBHOOK_CHANNEL_NAME"
                className="font-mono"
                disabled={!!editingWebhook}
              />
              <p className="text-xs text-slate-500">
                Must start with <code className="bg-slate-100 px-1 rounded">SLACK_WEBHOOK</code>.
                Use <code className="bg-slate-100 px-1 rounded">SLACK_WEBHOOK_URL</code> for the default sync notifications.
              </p>
            </div>

            {/* Value Input */}
            <div className="space-y-2">
              <Label htmlFor="value">Webhook URL</Label>
              <div className="relative">
                <Input
                  id="value"
                  type={showFormValue ? "text" : "password"}
                  value={formValue}
                  onChange={(e) => setFormValue(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="font-mono text-sm pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowFormValue(!showFormValue)}
                >
                  {showFormValue ? (
                    <EyeOff className="h-4 w-4 text-slate-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-slate-400" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Get this from your Slack App's "Incoming Webhooks" settings
              </p>
            </div>

            {/* Description Input */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g., Notifications for #airtable-syncs channel"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  {editingWebhook ? 'Update' : 'Save'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Webhook</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <code className="font-mono bg-slate-100 px-1 rounded">{deletingWebhook?.key}</code>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingWebhook && deleteMutation.mutate(deletingWebhook.key)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
