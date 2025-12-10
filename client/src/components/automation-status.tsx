import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface AutomationStatus {
  isRunning: boolean;
  status: string;
  latestRun?: {
    id: string;
    type: string;
    status: string;
    startTime: string;
    endTime?: string;
    liensFound?: number;
    liensProcessed?: number;
    liensOver20k?: number;
  };
}

export function AutomationStatus() {
  const { toast } = useToast();
  
  const { data: automationStatus, isLoading, refetch } = useQuery<AutomationStatus>({
    queryKey: ['/api/automation/status'],
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const handleManualTrigger = async () => {
    try {
      const response = await fetch('/api/automation/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to trigger automation');
      }
      
      toast({
        title: "Automation Started",
        description: "Manual automation run has been triggered successfully.",
      });
      
      // Refresh status immediately
      refetch();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start automation",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800">Automation Status</h3>
            <div className="animate-pulse h-6 bg-slate-200 rounded w-20"></div>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
                <div className="w-10 h-10 bg-slate-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!automationStatus) {
    return (
      <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6">
          <div className="text-red-600">Failed to load automation status</div>
        </div>
      </div>
    );
  }

  const pipelineSteps = [
    {
      name: "County Scraping",
      status: automationStatus.latestRun?.liensFound !== undefined ? "completed" : (automationStatus.isRunning ? "running" : "pending"),
      description: automationStatus.latestRun?.liensFound 
        ? `Last run: ${new Date(automationStatus.latestRun.startTime).toLocaleDateString()} • ${automationStatus.latestRun.liensFound} records found`
        : automationStatus.isRunning ? "Scraping records from county website..." : "Ready to scrape records",
      icon: automationStatus.latestRun?.liensFound !== undefined ? "fas fa-check" : (automationStatus.isRunning ? "fas fa-spinner fa-spin" : "fas fa-clock")
    },
    {
      name: "PDF Download",
      status: automationStatus.latestRun?.liensProcessed !== undefined ? "completed" : (automationStatus.isRunning ? "running" : "pending"),
      description: automationStatus.latestRun?.liensProcessed 
        ? `Downloaded ${automationStatus.latestRun.liensProcessed} PDF documents`
        : automationStatus.isRunning ? "Downloading PDF documents..." : "Waiting for scraping",
      icon: automationStatus.latestRun?.liensProcessed !== undefined ? "fas fa-check" : (automationStatus.isRunning ? "fas fa-spinner fa-spin" : "fas fa-clock")
    },
    {
      name: "Airtable Sync",
      status: automationStatus.latestRun?.status === "completed" ? "completed" : (automationStatus.isRunning ? "pending" : "pending"),
      description: automationStatus.latestRun?.status === "completed" 
        ? "Records and PDFs uploaded to Airtable"
        : automationStatus.isRunning ? "Waiting to upload..." : "Ready to sync data",
      icon: automationStatus.latestRun?.status === "completed" ? "fas fa-check" : "fas fa-clock"
    }
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">Processing Pipeline</h3>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${automationStatus.isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
            <span className={`text-sm font-medium ${automationStatus.isRunning ? 'text-emerald-600' : 'text-slate-500'}`} data-testid="text-automation-status">
              {automationStatus.isRunning ? 'Running' : (automationStatus.status || 'Idle')}
            </span>
          </div>
        </div>
      </div>
      <div className="p-6">
        {/* Horizontal Pipeline Tracker */}
        <div className="flex items-start justify-between">
          {pipelineSteps.map((step, index) => {
            const isCompleted = step.status === 'completed';
            const isRunning = step.status === 'running';
            const isLast = index === pipelineSteps.length - 1;

            return (
              <div key={index} className="flex-1 flex items-start" data-testid={`pipeline-step-${step.name.toLowerCase().replace(/\s+/g, '-')}`}>
                {/* Step content */}
                <div className="flex flex-col items-center text-center flex-1">
                  {/* Icon circle */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
                    isCompleted ? 'bg-emerald-100' :
                    isRunning ? 'bg-blue-500' :
                    'bg-slate-100'
                  }`}>
                    <i className={`${step.icon} text-lg ${
                      isCompleted ? 'text-emerald-600' :
                      isRunning ? 'text-white' :
                      'text-slate-400'
                    }`}></i>
                  </div>
                  {/* Step name */}
                  <h4 className={`font-medium text-sm mb-1 ${
                    isCompleted || isRunning ? 'text-slate-800' : 'text-slate-500'
                  }`}>
                    {step.name}
                  </h4>
                  {/* Status badge */}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full mb-2 ${
                    isCompleted ? 'bg-emerald-100 text-emerald-700' :
                    isRunning ? 'bg-blue-100 text-blue-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {isCompleted ? 'Completed' :
                     isRunning ? 'In Progress' :
                     'Pending'}
                  </span>
                  {/* Description */}
                  <p className={`text-xs max-w-[180px] ${
                    isCompleted || isRunning ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    {step.description}
                  </p>
                  {/* Progress bar for running PDF step */}
                  {isRunning && step.name === "PDF Download" && (
                    <div className="mt-2 w-24">
                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                        <div className="bg-blue-600 h-1.5 rounded-full animate-pulse" style={{width: '49%'}}></div>
                      </div>
                    </div>
                  )}
                </div>
                {/* Connector line */}
                {!isLast && (
                  <div className="flex-shrink-0 flex items-center pt-6 px-2">
                    <div className={`h-0.5 w-8 ${
                      isCompleted ? 'bg-emerald-300' : 'bg-slate-200'
                    }`}></div>
                    <i className={`fas fa-chevron-right text-xs mx-1 ${
                      isCompleted ? 'text-emerald-400' : 'text-slate-300'
                    }`}></i>
                    <div className={`h-0.5 w-8 ${
                      pipelineSteps[index + 1]?.status === 'completed' || pipelineSteps[index + 1]?.status === 'running'
                        ? 'bg-emerald-300' : 'bg-slate-200'
                    }`}></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
