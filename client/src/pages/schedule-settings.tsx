import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock, Save, RefreshCw, ChevronLeft, Pencil } from "lucide-react";

interface ScheduleSettings {
  id: string;
  name: string;
  hour: number;
  minute: number;
  timezone: string;
  skipWeekends: boolean;
  isEnabled: boolean;
  humanReadable: string;
}

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)', abbrev: 'ET' },
  { value: 'America/Chicago', label: 'Central Time (CT)', abbrev: 'CT' },
  { value: 'America/Denver', label: 'Mountain Time (MT)', abbrev: 'MT' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)', abbrev: 'PT' },
];

const getTimezoneAbbrev = (tz: string) => {
  return TIMEZONES.find(t => t.value === tz)?.abbrev || tz;
};

const formatTime = (hour: number, minute: number) => {
  const isPM = hour >= 12;
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
};

export default function ScheduleSettings() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state
  const [hour12, setHour12] = useState("1");
  const [minute, setMinute] = useState("0");
  const [period, setPeriod] = useState("AM");
  const [timezone, setTimezone] = useState("America/New_York");
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  // Fetch current schedule
  const { data: schedule, isLoading } = useQuery<ScheduleSettings>({
    queryKey: ['/api/automation/schedule'],
  });

  // Open edit dialog
  const handleEdit = () => {
    if (schedule) {
      const hour24 = schedule.hour;
      const isPM = hour24 >= 12;
      const hour12Value = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;

      setHour12(hour12Value.toString());
      setMinute(schedule.minute.toString());
      setPeriod(isPM ? "PM" : "AM");
      setTimezone(schedule.timezone);
      setSkipWeekends(schedule.skipWeekends);
      setIsEnabled(schedule.isEnabled);
      setIsDialogOpen(true);
    }
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: {
      hour: number;
      minute: number;
      timezone: string;
      skipWeekends: boolean;
      isEnabled: boolean;
    }) => {
      const response = await fetch('/api/automation/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save schedule');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/automation/schedule'] });
      setIsDialogOpen(false);
      toast({
        title: "Schedule Updated",
        description: `Automation will run ${data.humanReadable}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save schedule",
        variant: "destructive"
      });
    }
  });

  const handleSave = () => {
    let hour24 = parseInt(hour12);
    if (period === "PM" && hour24 !== 12) {
      hour24 += 12;
    } else if (period === "AM" && hour24 === 12) {
      hour24 = 0;
    }

    saveMutation.mutate({
      hour: hour24,
      minute: parseInt(minute),
      timezone,
      skipWeekends,
      isEnabled
    });
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header with Back Button */}
        <div className="space-y-4">
          <Link href="/settings">
            <Button variant="ghost" size="sm" className="gap-2 text-slate-600 hover:text-slate-900 -ml-2">
              <ChevronLeft className="h-4 w-4" />
              Back to Settings
            </Button>
          </Link>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Schedule Settings</h1>
              <p className="text-sm text-slate-500">
                Configure when the automation runs
              </p>
            </div>
          </div>
        </div>

        {/* Current Schedule Card */}
        {schedule && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{schedule.name}</CardTitle>
                  <CardDescription>Current automation schedule</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleEdit} className="gap-2">
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* ID */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm font-medium text-slate-600">ID</span>
                  <code className="text-sm font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                    {schedule.id}
                  </code>
                </div>

                {/* Status */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm font-medium text-slate-600">Status</span>
                  {schedule.isEnabled ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full"></span>
                      Paused
                    </span>
                  )}
                </div>

                {/* Time */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm font-medium text-slate-600">Run Time</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatTime(schedule.hour, schedule.minute)} {getTimezoneAbbrev(schedule.timezone)}
                  </span>
                </div>

                {/* Timezone */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <span className="text-sm font-medium text-slate-600">Timezone</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {TIMEZONES.find(t => t.value === schedule.timezone)?.label || schedule.timezone}
                  </span>
                </div>

                {/* Skip Weekends */}
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg sm:col-span-2">
                  <span className="text-sm font-medium text-slate-600">Skip Weekends</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {schedule.skipWeekends ? 'Yes (Mon-Fri only)' : 'No (runs daily)'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Schedule</DialogTitle>
              <DialogDescription>
                Configure when the automation runs
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              {/* Enabled Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <Label htmlFor="enabled" className="text-sm font-medium">Enabled</Label>
                  <p className="text-xs text-slate-500 mt-0.5">Turn off to pause scheduled runs</p>
                </div>
                <Switch
                  id="enabled"
                  checked={isEnabled}
                  onCheckedChange={setIsEnabled}
                />
              </div>

              {/* Time Selection */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Run Time</Label>
                <div className="grid grid-cols-4 gap-2">
                  <Select value={hour12} onValueChange={setHour12}>
                    <SelectTrigger>
                      <SelectValue placeholder="Hour" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, i) => (
                        <SelectItem key={i + 1} value={(i + 1).toString()}>
                          {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={minute} onValueChange={setMinute}>
                    <SelectTrigger>
                      <SelectValue placeholder="Min" />
                    </SelectTrigger>
                    <SelectContent>
                      {['00', '15', '30', '45'].map((min) => (
                        <SelectItem key={min} value={parseInt(min).toString()}>
                          {min}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={period} onValueChange={setPeriod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.abbrev}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Skip Weekends Toggle */}
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div>
                  <Label htmlFor="skip-weekends" className="text-sm font-medium">Skip Weekends</Label>
                  <p className="text-xs text-slate-500 mt-0.5">Only run Monday through Friday</p>
                </div>
                <Switch
                  id="skip-weekends"
                  checked={skipWeekends}
                  onCheckedChange={setSkipWeekends}
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
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
