import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Key, ChevronLeft, Plus, Pencil, Trash2, Eye, EyeOff, RefreshCw, Save, Database } from "lucide-react";

interface AppSetting {
  id: string;
  key: string;
  value: string;
  isSecret: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// Predefined settings templates for common integrations
// Note: AIRTABLE_COUNTY_RECORD_ID is now per-county in the counties table (airtableCountyId field)
const SETTING_TEMPLATES = [
  { key: 'AIRTABLE_API_KEY', description: 'Airtable Personal Access Token for API authentication', isSecret: true },
  { key: 'AIRTABLE_BASE_ID', description: 'Airtable Base ID (starts with "app")', isSecret: false },
  { key: 'AIRTABLE_TABLE_ID', description: 'Airtable Table ID (starts with "tbl")', isSecret: false },
  { key: 'AUTOMATION_SECRET_TOKEN', description: 'Secret token for triggering scheduled automation', isSecret: true },
  { key: 'SLACK_WEBHOOK_URL', description: 'Slack Incoming Webhook URL for notifications', isSecret: true },
];

export default function SecretsSettings() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingSetting, setEditingSetting] = useState<AppSetting | null>(null);
  const [deletingSetting, setDeletingSetting] = useState<AppSetting | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  // Form state
  const [formKey, setFormKey] = useState("");
  const [formValue, setFormValue] = useState("");
  const [formIsSecret, setFormIsSecret] = useState(false);
  const [formDescription, setFormDescription] = useState("");
  const [showFormValue, setShowFormValue] = useState(false);

  // Fetch all settings
  const { data: settings = [], isLoading } = useQuery<AppSetting[]>({
    queryKey: ['/api/settings'],
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { key: string; value: string; isSecret: boolean; description: string | null }) => {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save setting');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: editingSetting ? "Setting Updated" : "Setting Created",
        description: `${formKey} has been saved successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save setting",
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
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete setting');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings'] });
      setIsDeleteDialogOpen(false);
      setDeletingSetting(null);
      toast({
        title: "Setting Deleted",
        description: "The setting has been removed",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete setting",
        variant: "destructive"
      });
    }
  });

  // Reveal secret value
  const revealMutation = useMutation({
    mutationFn: async (key: string) => {
      const response = await fetch(`/api/settings/${encodeURIComponent(key)}/reveal`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to reveal value');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Update the local settings cache with revealed value
      queryClient.setQueryData(['/api/settings'], (old: AppSetting[] | undefined) => {
        if (!old) return old;
        return old.map(s => s.key === data.key ? { ...s, value: data.value } : s);
      });
      setRevealedKeys(prev => new Set(Array.from(prev).concat(data.key)));
    }
  });

  const resetForm = () => {
    setFormKey("");
    setFormValue("");
    setFormIsSecret(false);
    setFormDescription("");
    setShowFormValue(false);
    setEditingSetting(null);
  };

  const handleAdd = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = async (setting: AppSetting) => {
    setEditingSetting(setting);
    setFormKey(setting.key);
    setFormDescription(setting.description || "");
    setFormIsSecret(setting.isSecret);
    setShowFormValue(false);

    // If it's a secret, we need to reveal it first
    if (setting.isSecret && setting.value === '••••••••') {
      try {
        const response = await fetch(`/api/settings/${encodeURIComponent(setting.key)}/reveal`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setFormValue(data.value);
        }
      } catch (e) {
        setFormValue("");
      }
    } else {
      setFormValue(setting.value);
    }

    setIsDialogOpen(true);
  };

  const handleDelete = (setting: AppSetting) => {
    setDeletingSetting(setting);
    setIsDeleteDialogOpen(true);
  };

  const handleSave = () => {
    if (!formKey.trim()) {
      toast({
        title: "Validation Error",
        description: "Key is required",
        variant: "destructive"
      });
      return;
    }

    saveMutation.mutate({
      key: formKey.trim().toUpperCase(),
      value: formValue,
      isSecret: formIsSecret,
      description: formDescription.trim() || null
    });
  };

  const handleTemplateSelect = (template: typeof SETTING_TEMPLATES[0]) => {
    setFormKey(template.key);
    setFormDescription(template.description);
    setFormIsSecret(template.isSecret);
  };

  const toggleReveal = async (setting: AppSetting) => {
    if (revealedKeys.has(setting.key)) {
      // Hide the value
      setRevealedKeys(prev => {
        const next = new Set(prev);
        next.delete(setting.key);
        return next;
      });
      // Reset to masked value
      queryClient.setQueryData(['/api/settings'], (old: AppSetting[] | undefined) => {
        if (!old) return old;
        return old.map(s => s.key === setting.key ? { ...s, value: '••••••••' } : s);
      });
    } else {
      // Reveal the value
      revealMutation.mutate(setting.key);
    }
  };

  // Group settings by integration
  const groupedSettings = settings.reduce((acc, setting) => {
    let group = 'Other';
    if (setting.key.startsWith('AIRTABLE_')) group = 'Airtable';
    else if (setting.key.startsWith('SLACK_')) group = 'Slack';
    else if (setting.key.startsWith('AUTOMATION_')) group = 'Automation';

    if (!acc[group]) acc[group] = [];
    acc[group].push(setting);
    return acc;
  }, {} as Record<string, AppSetting[]>);

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

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Key className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">API Keys & Secrets</h1>
                <p className="text-sm text-slate-500">
                  Manage integration credentials and API tokens
                </p>
              </div>
            </div>
            <Button onClick={handleAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Setting
            </Button>
          </div>
        </div>

        {/* Settings List */}
        {settings.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12">
              <div className="text-center">
                <Database className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">No settings configured</h3>
                <p className="text-sm text-slate-500 mb-4">
                  Add your first setting to store API keys and configuration values
                </p>
                <Button onClick={handleAdd} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Your First Setting
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedSettings).map(([group, groupSettings]) => (
              <Card key={group}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold text-slate-700">{group}</CardTitle>
                  <CardDescription className="text-xs">
                    {groupSettings.length} setting{groupSettings.length !== 1 ? 's' : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="divide-y divide-slate-100">
                    {groupSettings.map((setting) => (
                      <div key={setting.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                                {setting.key}
                              </code>
                              {setting.isSecret && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                  Secret
                                </span>
                              )}
                            </div>
                            {setting.description && (
                              <p className="text-xs text-slate-500 mt-1">{setting.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <code className="text-xs font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded max-w-md truncate">
                                {setting.value}
                              </code>
                              {setting.isSecret && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
                                  onClick={() => toggleReveal(setting)}
                                  disabled={revealMutation.isPending}
                                >
                                  {revealedKeys.has(setting.key) ? (
                                    <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleEdit(setting)}
                            >
                              <Pencil className="h-4 w-4 text-slate-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 hover:text-red-600"
                              onClick={() => handleDelete(setting)}
                            >
                              <Trash2 className="h-4 w-4 text-slate-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingSetting ? 'Edit Setting' : 'Add Setting'}</DialogTitle>
              <DialogDescription>
                {editingSetting
                  ? 'Update the value for this setting'
                  : 'Add a new configuration setting or API key'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Quick Templates (only for new settings) */}
              {!editingSetting && (
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">Quick Add</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {SETTING_TEMPLATES.filter(t => !settings.find(s => s.key === t.key)).slice(0, 4).map((template) => (
                      <Button
                        key={template.key}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleTemplateSelect(template)}
                      >
                        {template.key.replace(/_/g, ' ')}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Input */}
              <div className="space-y-2">
                <Label htmlFor="key">Key</Label>
                <Input
                  id="key"
                  value={formKey}
                  onChange={(e) => setFormKey(e.target.value.toUpperCase())}
                  placeholder="SETTING_NAME"
                  className="font-mono"
                  disabled={!!editingSetting}
                />
              </div>

              {/* Value Input */}
              <div className="space-y-2">
                <Label htmlFor="value">Value</Label>
                <div className="relative">
                  <Input
                    id="value"
                    type={showFormValue ? "text" : "password"}
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder="Enter value..."
                    className="font-mono pr-10"
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
              </div>

              {/* Description Input */}
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="What is this setting used for?"
                  rows={2}
                />
              </div>

              {/* Is Secret Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label htmlFor="is-secret" className="text-sm font-medium">Mark as Secret</Label>
                  <p className="text-xs text-slate-500 mt-0.5">Secret values are masked in the UI</p>
                </div>
                <Switch
                  id="is-secret"
                  checked={formIsSecret}
                  onCheckedChange={setFormIsSecret}
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
                    {editingSetting ? 'Update' : 'Save'}
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
              <AlertDialogTitle>Delete Setting</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete <code className="font-mono bg-slate-100 px-1 rounded">{deletingSetting?.key}</code>?
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deletingSetting && deleteMutation.mutate(deletingSetting.key)}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
