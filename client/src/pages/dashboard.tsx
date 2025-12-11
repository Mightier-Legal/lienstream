import { AutomationStatus } from "@/components/automation-status";
import { ScraperProgress } from "@/components/scraper-progress";
import { PageHeader, StatIndicator, DateRangeValue } from "@/components/page-header";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface DashboardStats {
  todaysLiens: number;
  airtableSynced: number;
  totalProcessed: number;
  pendingSync: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const today = new Date().toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState<DateRangeValue>({ from: today, to: today });

  // Query automation status to determine if it's running
  const { data: automationStatus } = useQuery<{
    isRunning: boolean;
    status: string;
    latestRun?: any;
  }>({
    queryKey: ['/api/automation/status'],
    refetchInterval: 5000,
  });

  // Query dashboard stats for header indicators
  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000,
  });

  const handleManualTrigger = async () => {
    try {
      const response = await fetch('/api/automation/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate: dateRange.from, toDate: dateRange.to })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to trigger automation');
      }

      toast({
        title: "Automation Started",
        description: `Searching for liens from ${dateRange.from} to ${dateRange.to}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start automation",
        variant: "destructive"
      });
    }
  };

  const handleStopAutomation = async () => {
    try {
      const response = await fetch('/api/automation/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop automation');
      }
      
      toast({
        title: "Automation Stopped",
        description: "The automation process is stopping...",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop automation",
        variant: "destructive"
      });
    }
  };

  // Build stats for PageHeader
  const headerStats: StatIndicator[] = stats ? [
    {
      key: 'records-found',
      label: 'Records Found',
      value: stats.todaysLiens,
      color: 'green',
      tooltip: 'Liens discovered by the scraper today',
    },
    {
      key: 'synced',
      label: 'Synced to Airtable',
      value: stats.airtableSynced,
      color: 'blue',
      tooltip: 'Records successfully synced to Airtable',
    },
    {
      key: 'processed',
      label: 'Total Processed',
      value: stats.totalProcessed || stats.todaysLiens,
      color: 'yellow',
      tooltip: 'Total records processed today',
    },
    {
      key: 'pdfs',
      label: 'PDFs Downloaded',
      value: stats.todaysLiens,
      color: 'purple',
      tooltip: 'PDF documents downloaded',
    },
  ] : [];

  return (
    <main className="flex-1 overflow-auto bg-slate-50">
      <PageHeader
        title="Dashboard"
        datePicker={{
          type: 'range',
          value: dateRange,
          onChange: (value) => setDateRange(value as DateRangeValue),
        }}
        stats={headerStats}
        actions={[
          automationStatus?.isRunning
            ? {
                label: 'Stop Automation',
                icon: 'fas fa-stop-circle',
                onClick: handleStopAutomation,
                variant: 'gradient-red' as const,
              }
            : {
                label: 'Start Automation',
                icon: 'fas fa-bolt',
                onClick: handleManualTrigger,
                variant: 'gradient-blue' as const,
              },
        ]}
      />

      {/* Dashboard Content */}
      <div className="p-6 space-y-6">
        {/* Section 1: Processing Pipeline - Status overview */}
        <section>
          <AutomationStatus />
        </section>

        {/* Section 2: Scraper Progress - Real-time activity */}
        <section>
          <ScraperProgress />
        </section>
      </div>
    </main>
  );
}
