import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AutomationRun } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader, StatIndicator } from "@/components/page-header";

export default function Runs() {
  const [selectedRun, setSelectedRun] = useState<AutomationRun | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [limit, setLimit] = useState<number>(50);

  const { data: runs, isLoading } = useQuery<AutomationRun[]>({
    queryKey: ['/api/automation/runs', limit],
    queryFn: async () => {
      const response = await fetch(`/api/automation/runs?limit=${limit}`);
      if (!response.ok) throw new Error('Failed to fetch runs');
      return response.json();
    },
    refetchInterval: 30000,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string }> = {
      completed: { className: "bg-green-100 text-green-800 border-green-200" },
      running: { className: "bg-blue-100 text-blue-800 border-blue-200" },
      failed: { className: "bg-red-100 text-red-800 border-red-200" },
      stopped: { className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    };
    const config = variants[status] || { className: "bg-slate-100 text-slate-800" };
    return (
      <Badge variant="outline" className={config.className}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const getTypeBadge = (type: string) => {
    return (
      <Badge variant="outline" className={type === 'manual' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-600 border-slate-200'}>
        {type === 'manual' ? 'Manual' : 'Scheduled'}
      </Badge>
    );
  };

  const formatDate = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr: string | Date) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDateTime = (dateStr: string | Date) => {
    return `${formatDate(dateStr)} at ${formatTime(dateStr)}`;
  };

  const formatDuration = (start: string | Date, end?: string | Date | null) => {
    if (!end) return "In progress...";
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffSecs = Math.floor((diffMs % 60000) / 1000);
    if (diffMins > 0) {
      return `${diffMins}m ${diffSecs}s`;
    }
    return `${diffSecs}s`;
  };

  const filteredRuns = runs?.filter(run => {
    if (statusFilter !== "all" && run.status !== statusFilter) return false;
    if (typeFilter !== "all" && run.type !== typeFilter) return false;
    return true;
  });

  // Build stats for PageHeader
  const headerStats: StatIndicator[] = [
    {
      key: 'showing',
      label: 'Showing',
      value: filteredRuns?.length || 0,
      color: 'slate',
      tooltip: 'Number of runs matching current filters',
    },
    {
      key: 'completed',
      label: 'Completed',
      value: runs?.filter(r => r.status === 'completed').length || 0,
      color: 'green',
      tooltip: 'Successfully completed runs',
      onClick: () => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed'),
      active: statusFilter === 'completed',
    },
    {
      key: 'running',
      label: 'Running',
      value: runs?.filter(r => r.status === 'running').length || 0,
      color: 'blue',
      tooltip: 'Currently running automations',
      onClick: () => setStatusFilter(statusFilter === 'running' ? 'all' : 'running'),
      active: statusFilter === 'running',
    },
    {
      key: 'stopped',
      label: 'Stopped',
      value: runs?.filter(r => r.status === 'stopped').length || 0,
      color: 'yellow',
      tooltip: 'Manually stopped runs',
      onClick: () => setStatusFilter(statusFilter === 'stopped' ? 'all' : 'stopped'),
      active: statusFilter === 'stopped',
    },
    {
      key: 'failed',
      label: 'Failed',
      value: runs?.filter(r => r.status === 'failed').length || 0,
      color: 'red',
      tooltip: 'Runs that failed with errors',
      onClick: () => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed'),
      active: statusFilter === 'failed',
    },
  ];

  if (isLoading) {
    return (
      <main className="flex-1 overflow-auto bg-slate-50">
        <PageHeader title="Run History" stats={[]} />
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-200 rounded"></div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto bg-slate-50">
      <PageHeader
        title="Run History"
        stats={headerStats}
      >
        {/* Type Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Type:</span>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {/* Limit */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Show:</span>
          <Select value={limit.toString()} onValueChange={(v) => setLimit(parseInt(v))}>
            <SelectTrigger className="w-20 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="200">200</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <div className="p-6">
        {/* Runs Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Date</TableHead>
                <TableHead className="w-[100px]">Time</TableHead>
                <TableHead className="w-[100px]">Duration</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="text-right w-[80px]">Found</TableHead>
                <TableHead className="text-right w-[80px]">Processed</TableHead>
                <TableHead className="w-[200px]">Error</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRuns && filteredRuns.length > 0 ? (
                filteredRuns.map((run) => (
                  <TableRow
                    key={run.id}
                    className={`cursor-pointer hover:bg-slate-50 ${run.errorMessage ? 'bg-red-50/50' : ''}`}
                    onClick={() => setSelectedRun(run)}
                  >
                    <TableCell className="font-medium">{formatDate(run.startTime)}</TableCell>
                    <TableCell className="text-slate-600">{formatTime(run.startTime)}</TableCell>
                    <TableCell className="text-slate-600">
                      {formatDuration(run.startTime, run.endTime)}
                    </TableCell>
                    <TableCell>{getTypeBadge(run.type)}</TableCell>
                    <TableCell>{getStatusBadge(run.status)}</TableCell>
                    <TableCell className="text-right font-medium">{run.liensFound || 0}</TableCell>
                    <TableCell className="text-right font-medium">{run.liensProcessed || 0}</TableCell>
                    <TableCell>
                      {run.errorMessage ? (
                        <span className="text-red-600 text-sm truncate block max-w-[180px]" title={run.errorMessage}>
                          {run.errorMessage.slice(0, 40)}...
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <i className="fas fa-chevron-right text-slate-400"></i>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-history text-slate-400 text-xl"></i>
                    </div>
                    <h3 className="text-lg font-medium text-slate-800 mb-2">No Runs Found</h3>
                    <p className="text-slate-500">
                      {statusFilter !== "all" || typeFilter !== "all"
                        ? "No runs match your filters."
                        : "No automation runs have been recorded yet."}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Run Details Modal */}
      <Dialog open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Run Details</DialogTitle>
            <DialogDescription>
              {selectedRun && formatDateTime(selectedRun.startTime)}
            </DialogDescription>
          </DialogHeader>

          {selectedRun && (
            <div className="space-y-6">
              {/* Status and Timing */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-500">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedRun.status)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Type</label>
                  <div className="mt-1">{getTypeBadge(selectedRun.type)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Start Time</label>
                  <div className="mt-1 text-slate-800">{formatDateTime(selectedRun.startTime)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">End Time</label>
                  <div className="mt-1 text-slate-800">
                    {selectedRun.endTime ? formatDateTime(selectedRun.endTime) : 'Still running...'}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Duration</label>
                  <div className="mt-1 text-slate-800">
                    {formatDuration(selectedRun.startTime, selectedRun.endTime)}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Run ID</label>
                  <div className="mt-1 text-slate-800 font-mono text-xs">{selectedRun.id}</div>
                </div>
              </div>

              {/* Results */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-800 mb-3">Results</h4>
                <div className="grid grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-slate-800">{selectedRun.liensFound || 0}</div>
                      <div className="text-sm text-slate-500">Liens Found</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-slate-800">{selectedRun.liensProcessed || 0}</div>
                      <div className="text-sm text-slate-500">Liens Processed</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4 text-center">
                      <div className="text-2xl font-bold text-slate-800">{selectedRun.liensOver20k || 0}</div>
                      <div className="text-sm text-slate-500">Over $20K</div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Error Message */}
              {selectedRun.errorMessage && (
                <div className="border-t pt-4">
                  <h4 className="font-medium text-red-800 mb-3 flex items-center gap-2">
                    <i className="fas fa-exclamation-triangle"></i>
                    Error Details
                  </h4>
                  <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                    <pre className="text-sm text-red-800 whitespace-pre-wrap font-mono">
                      {selectedRun.errorMessage}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
