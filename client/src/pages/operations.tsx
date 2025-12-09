import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Lien, SystemLog } from "@shared/schema";
import { Link } from "wouter";

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

interface FailedLiensResponse {
  count: number;
  liens: Lien[];
  message: string;
}

interface LiensResponse {
  liens: Lien[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

interface StaleLiensResponse {
  count: number;
  hoursOld: number;
  liens: Lien[];
}

interface StatusCount {
  status: string;
  count: number;
}

interface Duplicate {
  recordingNumber: string;
  count: number;
  statuses: string[];
}

interface DuplicatesResponse {
  count: number;
  duplicates: Duplicate[];
}

export default function Operations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [isMarkingStale, setIsMarkingStale] = useState(false);
  const [showDuplicatesSheet, setShowDuplicatesSheet] = useState(false);
  const [showStaleSheet, setShowStaleSheet] = useState(false);
  const [showLogsSheet, setShowLogsSheet] = useState(false);

  // Automation status query
  const { data: automationStatus } = useQuery<AutomationStatus>({
    queryKey: ['/api/automation/status'],
    refetchInterval: 3000,
  });

  // Failed liens query
  const { data: failedLiens, refetch: refetchFailed } = useQuery<FailedLiensResponse>({
    queryKey: ['/api/liens/failed'],
    refetchInterval: 10000,
  });

  // Stale pending liens query (older than 24 hours)
  const { data: staleLiens, refetch: refetchStale } = useQuery<StaleLiensResponse>({
    queryKey: ['/api/liens/stale?hours=24'],
    refetchInterval: 30000,
  });

  // Status counts query
  const { data: statusCounts } = useQuery<StatusCount[]>({
    queryKey: ['/api/liens/status-counts'],
    refetchInterval: 30000,
  });

  // Duplicates query
  const { data: duplicates } = useQuery<DuplicatesResponse>({
    queryKey: ['/api/liens/duplicates'],
    refetchInterval: 60000,
  });

  // All liens for pending sync count
  const { data: allLiens } = useQuery<LiensResponse>({
    queryKey: ['/api/liens/recent?page=1&limit=10000'],
    refetchInterval: 30000,
  });

  // System logs query (errors/warnings from last 24h)
  const { data: logs } = useQuery<SystemLog[]>({
    queryKey: ['/api/logs'],
    refetchInterval: 10000,
  });

  // Calculate pending sync count (pending status with pdfUrl) - exclude stale ones
  const pendingSyncCount = allLiens?.liens.filter(l => {
    if (l.status !== 'pending' || !l.pdfUrl) return false;
    // Check if it's not stale (created within last 24 hours)
    const createdAt = new Date(l.createdAt);
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - 24);
    return createdAt > cutoff;
  }).length || 0;

  // Calculate failed items from database (pdf_failed status)
  const failedFromDb = allLiens?.liens.filter(l => l.status === 'pdf_failed') || [];
  const failedCount = (failedLiens?.count || 0) + failedFromDb.length;

  // Filter logs for errors/warnings
  const recentErrors = logs?.filter(
    log => log.level === 'error' || log.level === 'warning'
  ).slice(0, 10) || [];

  // Get status count for a specific status
  const getStatusCount = (status: string) => {
    return statusCounts?.find(s => s.status === status)?.count || 0;
  };

  // Automation handlers
  const handleStartAutomation = async () => {
    try {
      const response = await fetch('/api/automation/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromDate, toDate })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to trigger automation');
      }

      toast({
        title: "Automation Started",
        description: `Searching for liens from ${fromDate} to ${toDate}`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
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

      queryClient.invalidateQueries({ queryKey: ['/api/automation/status'] });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop automation",
        variant: "destructive"
      });
    }
  };

  // Failed liens handlers
  const handleRetrySync = async (lienId: string) => {
    setRetryingId(lienId);
    try {
      const response = await fetch(`/api/liens/${lienId}/retry-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to retry sync');
      }

      toast({
        title: "Sync Successful",
        description: "Lien has been synced to Airtable",
      });

      refetchFailed();
      queryClient.invalidateQueries({ queryKey: ['/api/liens/recent'] });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to retry sync",
        variant: "destructive"
      });
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryAllFailed = async () => {
    try {
      const response = await fetch('/api/liens/failed/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to retry all');
      }

      const result = await response.json();
      toast({
        title: "Sync Complete",
        description: result.message,
      });

      refetchFailed();
      queryClient.invalidateQueries({ queryKey: ['/api/liens/recent'] });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sync failed liens",
        variant: "destructive"
      });
    }
  };

  const handleClearFailed = async () => {
    try {
      const response = await fetch('/api/liens/failed/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to clear failed liens');
      }

      const result = await response.json();
      toast({
        title: "Cleared",
        description: result.message,
      });

      refetchFailed();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to clear failed liens",
        variant: "destructive"
      });
    }
  };

  // Airtable sync handler
  const handleSyncAllToAirtable = async () => {
    try {
      const response = await fetch('/api/airtable/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sync to Airtable');
      }

      const result = await response.json();
      toast({
        title: "Sync Complete",
        description: `Synced ${result.success} of ${result.total} liens to Airtable`,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/liens/recent'] });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to sync to Airtable",
        variant: "destructive"
      });
    }
  };

  // Mark stale liens handler
  const handleMarkStale = async () => {
    setIsMarkingStale(true);
    try {
      const response = await fetch('/api/liens/stale/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: 24 })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to mark stale liens');
      }

      const result = await response.json();
      toast({
        title: "Success",
        description: result.message,
      });

      refetchStale();
      queryClient.invalidateQueries({ queryKey: ['/api/liens/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/liens/status-counts'] });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to mark stale liens",
        variant: "destructive"
      });
    } finally {
      setIsMarkingStale(false);
    }
  };

  const formatTimestamp = (timestamp: string | Date) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatFullDate = (timestamp: string | Date) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <main className="flex-1 overflow-auto bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-6">
        <h2 className="text-3xl font-bold text-slate-800 mb-2">Operations</h2>
        <p className="text-base text-slate-600">
          Control automation, monitor pipeline status, and manage failed items
        </p>
      </header>

      <div className="p-6 space-y-6">
        {/* Status Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="bg-white cursor-help hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-slate-800">{getStatusCount('synced')}</div>
                  <div className="text-sm text-green-600 flex items-center gap-1">
                    Synced
                    <i className="fas fa-info-circle text-xs text-slate-400"></i>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>Records successfully synced to Airtable with PDF attached</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="bg-white cursor-help hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-slate-800">{getStatusCount('pending')}</div>
                  <div className="text-sm text-yellow-600 flex items-center gap-1">
                    Pending
                    <i className="fas fa-info-circle text-xs text-slate-400"></i>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>Records scraped but not yet synced to Airtable (includes both recent and stale)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card
                className={`bg-white cursor-pointer hover:shadow-md transition-shadow ${getStatusCount('stale') > 0 ? 'border-orange-300' : ''}`}
                onClick={() => getStatusCount('stale') > 0 && setShowStaleSheet(true)}
              >
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-slate-800">{getStatusCount('stale')}</div>
                  <div className="text-sm text-orange-600 flex items-center gap-1">
                    Stale
                    <i className="fas fa-info-circle text-xs text-slate-400"></i>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>Records marked as stale (failed to process). Click to view all.</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="bg-white cursor-help hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-slate-800">{getStatusCount('pdf_failed')}</div>
                  <div className="text-sm text-red-600 flex items-center gap-1">
                    PDF Failed
                    <i className="fas fa-info-circle text-xs text-slate-400"></i>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>Records where PDF download explicitly failed</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card className="bg-white cursor-help hover:shadow-md transition-shadow">
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-slate-800">{getStatusCount('mailer_sent')}</div>
                  <div className="text-sm text-purple-600 flex items-center gap-1">
                    Mailer Sent
                    <i className="fas fa-info-circle text-xs text-slate-400"></i>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>Records that have been sent through the mailer system</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Card
                className={`bg-white cursor-pointer hover:shadow-md transition-shadow ${duplicates?.count ? 'border-blue-300' : ''}`}
                onClick={() => duplicates?.count && setShowDuplicatesSheet(true)}
              >
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-slate-800">{duplicates?.count || 0}</div>
                  <div className="text-sm text-blue-600 flex items-center gap-1">
                    Duplicates
                    <i className="fas fa-info-circle text-xs text-slate-400"></i>
                  </div>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p>Recording numbers that appear multiple times in the database. Click to view all.</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Automation Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <i className="fas fa-cogs text-blue-600"></i>
              Automation Controls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-4 bg-slate-50 rounded-lg p-4 flex-1 min-w-[400px]">
                <div className="flex items-center gap-2">
                  <label htmlFor="from-date" className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                    From:
                  </label>
                  <Input
                    id="from-date"
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    max={toDate}
                    className="w-40 bg-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="to-date" className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                    To:
                  </label>
                  <Input
                    id="to-date"
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    min={fromDate}
                    className="w-40 bg-white"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                {automationStatus?.isRunning ? (
                  <Button
                    onClick={handleStopAutomation}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    <i className="fas fa-stop mr-2"></i>
                    Stop Automation
                  </Button>
                ) : (
                  <Button
                    onClick={handleStartAutomation}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <i className="fas fa-play mr-2"></i>
                    Start Automation
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stale Pending Records */}
        <Card className="border-orange-200 bg-orange-50/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <i className="fas fa-clock text-orange-600"></i>
                Stale Pending Records
              </CardTitle>
              <Badge className={staleLiens?.count ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-600"}>
                {staleLiens?.count || 0}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {!staleLiens?.count ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i className="fas fa-check text-green-600 text-xl"></i>
                </div>
                <p className="text-slate-500">No stale pending records</p>
              </div>
            ) : (
              <>
                <div className="mb-4 p-4 bg-orange-100/50 rounded-lg border border-orange-200">
                  <p className="text-sm text-orange-800">
                    <strong>{staleLiens.count}</strong> liens have been stuck in "pending" status for more than 24 hours.
                    These records likely failed to process properly and should be marked as "stale" to clean up your data.
                  </p>
                </div>
                <div className="max-h-[200px] overflow-y-auto mb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recording #</TableHead>
                        <TableHead>County</TableHead>
                        <TableHead>Debtor</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>PDF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staleLiens.liens.slice(0, 10).map((lien) => (
                        <TableRow key={lien.id}>
                          <TableCell className="font-mono text-sm">{lien.recordingNumber}</TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {lien.countyId ? lien.countyId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 max-w-[150px] truncate" title={lien.debtorName}>
                            {lien.debtorName || '-'}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{formatFullDate(lien.createdAt)}</TableCell>
                          <TableCell>
                            {lien.pdfUrl ? (
                              <Badge className="bg-green-100 text-green-800">Yes</Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-600">No</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {staleLiens.count > 10 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                            ...and {staleLiens.count - 10} more
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <Button
                  onClick={handleMarkStale}
                  disabled={isMarkingStale}
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  {isMarkingStale ? (
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                  ) : (
                    <i className="fas fa-tag mr-2"></i>
                  )}
                  Mark All {staleLiens.count} as Stale
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Failed Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-exclamation-triangle text-red-600"></i>
                  Failed Items
                </CardTitle>
                <Badge className={failedCount > 0 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-600"}>
                  {failedCount}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {failedCount === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i className="fas fa-check text-green-600 text-xl"></i>
                  </div>
                  <p className="text-slate-500">No failed items</p>
                </div>
              ) : (
                <>
                  <div className="max-h-[300px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Recording #</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Failed from memory */}
                        {failedLiens?.liens.map((lien) => (
                          <TableRow key={lien.id}>
                            <TableCell className="font-mono text-sm">{lien.recordingNumber}</TableCell>
                            <TableCell className="text-sm text-slate-600">PDF download failed</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRetrySync(lien.id)}
                                disabled={retryingId === lien.id}
                              >
                                {retryingId === lien.id ? (
                                  <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                  'Retry'
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Failed from DB */}
                        {failedFromDb.map((lien) => (
                          <TableRow key={lien.id}>
                            <TableCell className="font-mono text-sm">{lien.recordingNumber}</TableCell>
                            <TableCell className="text-sm text-slate-600">PDF failed</TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRetrySync(lien.id)}
                                disabled={retryingId === lien.id}
                              >
                                {retryingId === lien.id ? (
                                  <i className="fas fa-spinner fa-spin"></i>
                                ) : (
                                  'Retry'
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    <Button
                      size="sm"
                      onClick={handleRetryAllFailed}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <i className="fas fa-sync mr-2"></i>
                      Retry All Failed
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRetryAllFailed}
                    >
                      <i className="fas fa-upload mr-2"></i>
                      Force Push to Airtable
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleClearFailed}
                      className="text-red-600 hover:text-red-700"
                    >
                      <i className="fas fa-trash mr-2"></i>
                      Clear
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Pending Airtable Sync */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-cloud-upload-alt text-yellow-600"></i>
                  Pending Airtable Sync
                </CardTitle>
                <Badge className={pendingSyncCount > 0 ? "bg-yellow-100 text-yellow-800" : "bg-slate-100 text-slate-600"}>
                  {pendingSyncCount}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {pendingSyncCount === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <i className="fas fa-check text-green-600 text-xl"></i>
                  </div>
                  <p className="text-slate-500">All recent liens are synced</p>
                  <p className="text-xs text-slate-400 mt-1">(Excludes stale records older than 24h)</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-slate-600">
                    <strong>{pendingSyncCount}</strong> liens scraped but not yet synced to Airtable
                  </p>
                  <Button
                    onClick={handleSyncAllToAirtable}
                    className="w-full bg-yellow-600 hover:bg-yellow-700"
                  >
                    <i className="fas fa-sync mr-2"></i>
                    Sync All to Airtable
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Duplicate Records - NEW SECTION */}
        {duplicates && duplicates.count > 0 && (
          <Card className="border-blue-200">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <i className="fas fa-copy text-blue-600"></i>
                  Duplicate Recording Numbers
                </CardTitle>
                <Badge className="bg-blue-100 text-blue-800">
                  {duplicates.count}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  Found <strong>{duplicates.count}</strong> recording numbers with multiple entries in the database.
                  This may indicate duplicate scraping or processing issues.
                </p>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Recording #</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Statuses</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {duplicates.duplicates.slice(0, 10).map((dup) => (
                      <TableRow key={dup.recordingNumber}>
                        <TableCell className="font-mono text-sm">{dup.recordingNumber}</TableCell>
                        <TableCell>{dup.count}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {dup.statuses.map((status) => (
                              <Badge key={status} variant="outline" className="text-xs">
                                {status}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recent Errors */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <i className="fas fa-exclamation-circle text-orange-600"></i>
                Recent Errors (Last 24h)
              </CardTitle>
              <Link href="/operations/logs">
                <Button variant="outline" size="sm">
                  <i className="fas fa-list mr-2"></i>
                  View All Logs
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentErrors.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i className="fas fa-check text-green-600 text-xl"></i>
                </div>
                <p className="text-slate-500">No recent errors</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {recentErrors.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      log.level === 'error' ? 'bg-red-500' : 'bg-yellow-500'
                    }`}></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800">{log.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500">
                          {formatTimestamp(log.timestamp)}
                        </span>
                        {log.component && (
                          <>
                            <span className="text-xs text-slate-300">|</span>
                            <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                              {log.component}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Duplicates Sheet */}
      <Sheet open={showDuplicatesSheet} onOpenChange={setShowDuplicatesSheet}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <i className="fas fa-copy text-blue-600"></i>
              All Duplicate Recording Numbers
            </SheetTitle>
            <SheetDescription>
              Found {duplicates?.count || 0} recording numbers with multiple database entries
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recording #</TableHead>
                  <TableHead>Count</TableHead>
                  <TableHead>Statuses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {duplicates?.duplicates.map((dup) => (
                  <TableRow key={dup.recordingNumber}>
                    <TableCell className="font-mono text-sm">{dup.recordingNumber}</TableCell>
                    <TableCell>{dup.count}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {dup.statuses.map((status) => (
                          <Badge
                            key={status}
                            variant="outline"
                            className={`text-xs ${
                              status === 'synced' ? 'border-green-300 text-green-700' :
                              status === 'pending' ? 'border-yellow-300 text-yellow-700' :
                              status === 'stale' ? 'border-orange-300 text-orange-700' :
                              status === 'pdf_failed' ? 'border-red-300 text-red-700' :
                              ''
                            }`}
                          >
                            {status}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>

      {/* Stale Records Sheet */}
      <Sheet open={showStaleSheet} onOpenChange={setShowStaleSheet}>
        <SheetContent className="w-[900px] sm:max-w-[900px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <i className="fas fa-clock text-orange-600"></i>
              All Stale Pending Records
            </SheetTitle>
            <SheetDescription>
              {staleLiens?.count || 0} records stuck in "pending" for more than 24 hours
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <div className="mb-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm text-orange-800">
                These records were scraped but never completed processing. They may have already been
                synced under a different record, or they may have failed silently.
              </p>
            </div>
            <div className="flex gap-2 mb-4">
              <Button
                onClick={() => {
                  handleMarkStale();
                  setShowStaleSheet(false);
                }}
                disabled={isMarkingStale}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {isMarkingStale ? (
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                ) : (
                  <i className="fas fa-tag mr-2"></i>
                )}
                Mark All as Stale
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recording #</TableHead>
                  <TableHead>County</TableHead>
                  <TableHead>Debtor</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>PDF</TableHead>
                  <TableHead>Airtable</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staleLiens?.liens.map((lien) => (
                  <TableRow key={lien.id}>
                    <TableCell className="font-mono text-sm">{lien.recordingNumber}</TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {lien.countyId ? lien.countyId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 max-w-[150px] truncate" title={lien.debtorName}>
                      {lien.debtorName || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{formatFullDate(lien.createdAt)}</TableCell>
                    <TableCell>
                      {lien.pdfUrl ? (
                        <Badge className="bg-green-100 text-green-800">Yes</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {lien.airtableRecordId ? (
                        <Badge className="bg-green-100 text-green-800">
                          <i className="fas fa-check mr-1"></i>
                          Synced
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">No</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>

      {/* All Logs Sheet */}
      <Sheet open={showLogsSheet} onOpenChange={setShowLogsSheet}>
        <SheetContent className="w-[700px] sm:max-w-[700px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <i className="fas fa-list text-slate-600"></i>
              System Logs (Last 24h)
            </SheetTitle>
            <SheetDescription>
              {logs?.length || 0} log entries - showing all levels (info, success, warning, error)
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <div className="mb-4 flex gap-2 flex-wrap">
              <Badge className="bg-blue-100 text-blue-800">
                <span className="w-2 h-2 rounded-full bg-blue-500 mr-1.5 inline-block"></span>
                Info
              </Badge>
              <Badge className="bg-green-100 text-green-800">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-1.5 inline-block"></span>
                Success
              </Badge>
              <Badge className="bg-yellow-100 text-yellow-800">
                <span className="w-2 h-2 rounded-full bg-yellow-500 mr-1.5 inline-block"></span>
                Warning
              </Badge>
              <Badge className="bg-red-100 text-red-800">
                <span className="w-2 h-2 rounded-full bg-red-500 mr-1.5 inline-block"></span>
                Error
              </Badge>
            </div>
            {logs && logs.length > 0 ? (
              <div className="space-y-2">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                      log.level === 'error' ? 'bg-red-500' :
                      log.level === 'warning' ? 'bg-yellow-500' :
                      log.level === 'success' ? 'bg-green-500' :
                      'bg-blue-500'
                    }`}></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800">{log.message}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-slate-500">
                          {formatFullDate(log.timestamp)} at {formatTimestamp(log.timestamp)}
                        </span>
                        {log.component && (
                          <>
                            <span className="text-xs text-slate-300">|</span>
                            <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                              {log.component}
                            </span>
                          </>
                        )}
                        <span className="text-xs text-slate-300">|</span>
                        <Badge variant="outline" className={`text-xs ${
                          log.level === 'error' ? 'border-red-300 text-red-700' :
                          log.level === 'warning' ? 'border-yellow-300 text-yellow-700' :
                          log.level === 'success' ? 'border-green-300 text-green-700' :
                          'border-blue-300 text-blue-700'
                        }`}>
                          {log.level}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <i className="fas fa-list text-slate-400 text-xl"></i>
                </div>
                <p className="text-slate-500">No logs found</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}
