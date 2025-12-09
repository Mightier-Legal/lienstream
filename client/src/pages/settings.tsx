import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Clock, Settings as SettingsIcon, Save, RefreshCw, Plus, Pencil } from "lucide-react";

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
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
];

const getTimezoneAbbrev = (tz: string) => {
  const map: Record<string, string> = {
    'America/New_York': 'ET',
    'America/Chicago': 'CT',
    'America/Denver': 'MT',
    'America/Los_Angeles': 'PT'
  };
  return map[tz] || tz;
};

const formatTime = (hour: number, minute: number) => {
  const isPM = hour >= 12;
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
};

export default function Settings() {
  const { toast } = useToast();
  const [editingSchedule, setEditingSchedule] = useState<ScheduleSettings | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state for dialog
  const [hour12, setHour12] = useState("1");
  const [minute, setMinute] = useState("0");
  const [period, setPeriod] = useState("AM");
  const [timezone, setTimezone] = useState("America/New_York");
  const [skipWeekends, setSkipWeekends] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  // Fetch current schedule settings
  const { data: schedule, isLoading } = useQuery<ScheduleSettings>({
    queryKey: ['/api/automation/schedule'],
  });

  // Open edit dialog with schedule data
  const handleEdit = (sched: ScheduleSettings) => {
    setEditingSchedule(sched);
    const hour24 = sched.hour;
    const isPM = hour24 >= 12;
    const hour12Value = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;

    setHour12(hour12Value.toString());
    setMinute(sched.minute.toString());
    setPeriod(isPM ? "PM" : "AM");
    setTimezone(sched.timezone);
    setSkipWeekends(sched.skipWeekends);
    setIsEnabled(sched.isEnabled);
    setIsDialogOpen(true);
  };

  // Save schedule mutation
  const saveScheduleMutation = useMutation({
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
      setEditingSchedule(null);
      toast({
        title: "Schedule Saved",
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

  const handleSaveSchedule = () => {
    // Convert 12-hour to 24-hour format
    let hour24 = parseInt(hour12);
    if (period === "PM" && hour24 !== 12) {
      hour24 += 12;
    } else if (period === "AM" && hour24 === 12) {
      hour24 = 0;
    }

    saveScheduleMutation.mutate({
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
          <div className="flex items-center gap-2 mb-6">
            <SettingsIcon className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
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
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        {/* Schedule Settings Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Schedule Settings
              </h2>
              <p className="text-sm text-slate-500">Manage automation schedules</p>
            </div>
            {/* Future: Add New Schedule button */}
            {/* <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Schedule
            </Button> */}
          </div>

          {/* Schedule Cards */}
          <div className="space-y-3">
            {schedule && (
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-slate-800">{schedule.name}</h3>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {schedule.id}
                        </span>
                        {schedule.isEnabled ? (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                            Active
                          </span>
                        ) : (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                            Paused
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-semibold text-slate-700">
                        {formatTime(schedule.hour, schedule.minute)} {getTimezoneAbbrev(schedule.timezone)}
                      </p>
                      <p className="text-sm text-slate-500">
                        {schedule.skipWeekends ? 'Weekdays only' : 'Every day'}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(schedule)}
                      className="text-slate-600 hover:text-slate-800"
                    >
                      <Pencil className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Counties can be linked to different schedules via the schedule_settings_id field.
          </p>
        </section>

        {/* Edit Schedule Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Schedule</DialogTitle>
              <DialogDescription>
                Configure when the automation runs
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Enabled Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label htmlFor="enabled" className="text-sm font-medium">Enabled</Label>
                  <p className="text-xs text-slate-500">Turn off to pause scheduled runs</p>
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
                      <SelectValue />
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
                      <SelectValue />
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
                          {getTimezoneAbbrev(tz.value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Skip Weekends Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <Label htmlFor="skip-weekends" className="text-sm font-medium">Skip Weekends</Label>
                  <p className="text-xs text-slate-500">Only run Monday through Friday</p>
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
              <Button
                onClick={handleSaveSchedule}
                disabled={saveScheduleMutation.isPending}
              >
                {saveScheduleMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
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
