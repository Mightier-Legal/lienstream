import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { SystemLog } from "@shared/schema";
import { PageHeader, StatIndicator } from "@/components/page-header";

export default function SystemLogs() {
  // Get today's date in Eastern timezone (not UTC)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [selectedDate, setSelectedDate] = useState(today);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterComponent, setFilterComponent] = useState<string>("all");
  const [searchText, setSearchText] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  // Query logs for selected date
  const { data: logs, isLoading, refetch } = useQuery<SystemLog[]>({
    queryKey: ['/api/logs', selectedDate],
    queryFn: async () => {
      const response = await fetch(`/api/logs?date=${selectedDate}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json();
    },
    refetchInterval: 10000,
  });

  // Get unique components from logs
  const components = useMemo(() => {
    if (!logs) return [];
    const componentSet = new Set(logs.map(log => log.component).filter(Boolean));
    return Array.from(componentSet).sort();
  }, [logs]);

  // Filter and sort logs (newest first)
  const filteredLogs = useMemo(() => {
    if (!logs) return [];

    const filtered = logs.filter(log => {
      if (filterLevel !== "all" && log.level !== filterLevel) return false;
      if (filterComponent !== "all" && log.component !== filterComponent) return false;
      if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) return false;

      if (timeFrom || timeTo) {
        const logTime = new Date(log.timestamp);
        const etTimeStr = logTime.toLocaleTimeString('en-US', {
          timeZone: 'America/New_York',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });
        if (timeFrom && etTimeStr < timeFrom) return false;
        if (timeTo && etTimeStr > timeTo) return false;
      }

      return true;
    });

    return filtered.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [logs, filterLevel, filterComponent, searchText, timeFrom, timeTo]);

  // Pagination
  const totalCount = filteredLogs.length;
  const totalPages = Math.ceil(totalCount / limit);
  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredLogs.slice(start, start + limit);
  }, [filteredLogs, page, limit]);

  // Reset page when filters change
  useMemo(() => {
    setPage(1);
  }, [filterLevel, filterComponent, searchText, timeFrom, timeTo, selectedDate]);

  // Count by level
  const levelCounts = useMemo(() => {
    if (!logs) return { info: 0, success: 0, warning: 0, error: 0 };
    return logs.reduce((acc, log) => {
      acc[log.level as keyof typeof acc] = (acc[log.level as keyof typeof acc] || 0) + 1;
      return acc;
    }, { info: 0, success: 0, warning: 0, error: 0 });
  }, [logs]);

  const formatFullTimestamp = (timestamp: string | Date) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' ET';
  };

  const getLevelBadge = (level: string) => {
    const variants: Record<string, { className: string }> = {
      info: { className: "bg-blue-100 text-blue-800 border-blue-200" },
      success: { className: "bg-green-100 text-green-800 border-green-200" },
      warning: { className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
      error: { className: "bg-red-100 text-red-800 border-red-200" },
    };
    const variant = variants[level] || variants.info;
    return (
      <Badge variant="outline" className={variant.className}>
        {level}
      </Badge>
    );
  };

  const handleExportCSV = () => {
    window.open(`/api/logs/export?date=${selectedDate}`, '_blank');
  };

  const clearFilters = () => {
    setFilterLevel("all");
    setFilterComponent("all");
    setSearchText("");
    setTimeFrom("");
    setTimeTo("");
  };

  // Build stats for PageHeader
  const stats: StatIndicator[] = [
    {
      key: 'info',
      label: 'Info',
      value: levelCounts.info,
      color: 'blue',
      tooltip: 'Informational log entries',
      onClick: () => setFilterLevel(filterLevel === 'info' ? 'all' : 'info'),
      active: filterLevel === 'info',
    },
    {
      key: 'success',
      label: 'Success',
      value: levelCounts.success,
      color: 'green',
      tooltip: 'Successful operations',
      onClick: () => setFilterLevel(filterLevel === 'success' ? 'all' : 'success'),
      active: filterLevel === 'success',
    },
    {
      key: 'warning',
      label: 'Warning',
      value: levelCounts.warning,
      color: 'yellow',
      tooltip: 'Warning messages',
      onClick: () => setFilterLevel(filterLevel === 'warning' ? 'all' : 'warning'),
      active: filterLevel === 'warning',
    },
    {
      key: 'error',
      label: 'Error',
      value: levelCounts.error,
      color: 'red',
      tooltip: 'Error messages requiring attention',
      onClick: () => setFilterLevel(filterLevel === 'error' ? 'all' : 'error'),
      active: filterLevel === 'error',
    },
  ];

  return (
    <main className="flex-1 overflow-auto bg-slate-50">
      <PageHeader
        title="System Logs"
        datePicker={{
          type: 'single',
          value: selectedDate,
          onChange: (value) => setSelectedDate(value as string),
          showTodayButton: true,
          max: today,
        }}
        stats={stats}
        actions={[
          { label: 'Refresh', icon: 'fas fa-sync', onClick: () => refetch(), variant: 'outline' },
          { label: 'Export', icon: 'fas fa-download', onClick: handleExportCSV, variant: 'outline' },
        ]}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Show:</span>
          <Select value={limit.toString()} onValueChange={(v) => { setLimit(parseInt(v)); setPage(1); }}>
            <SelectTrigger className="w-[70px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <div className="p-6">
        {/* Filters Bar */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
              <Input
                placeholder="Search logs..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
            <Select value={filterComponent} onValueChange={setFilterComponent}>
              <SelectTrigger className="w-[150px] h-8 text-sm">
                <SelectValue placeholder="Component" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Components</SelectItem>
                {components.map(comp => (
                  <SelectItem key={comp} value={comp || "unknown"}>{comp || "Unknown"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 text-sm text-slate-500">
              <span>Time:</span>
              <Input
                type="time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                className="w-28 h-8 text-sm"
              />
              <span>-</span>
              <Input
                type="time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                className="w-28 h-8 text-sm"
              />
            </div>
            {(searchText || filterComponent !== 'all' || filterLevel !== 'all' || timeFrom || timeTo) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-slate-500">
                <i className="fas fa-times mr-1"></i>
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Logs Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Date & Time (ET)</TableHead>
                <TableHead className="w-[100px]">Level</TableHead>
                <TableHead className="w-[140px]">Component</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-slate-500">Loading logs...</p>
                  </TableCell>
                </TableRow>
              ) : paginatedLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-inbox text-slate-400 text-xl"></i>
                    </div>
                    <h3 className="text-lg font-medium text-slate-800 mb-2">No Logs Found</h3>
                    <p className="text-slate-500">
                      {filterLevel !== "all" || filterComponent !== "all" || searchText || timeFrom || timeTo
                        ? "No logs match your filters."
                        : "No logs for the selected date."}
                    </p>
                    {(filterLevel !== "all" || filterComponent !== "all" || searchText || timeFrom || timeTo) && (
                      <Button variant="link" onClick={clearFilters} className="mt-2">
                        Clear filters
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedLogs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-slate-50">
                    <TableCell className="font-mono text-sm text-slate-600">
                      {formatFullTimestamp(log.timestamp)}
                    </TableCell>
                    <TableCell>{getLevelBadge(log.level)}</TableCell>
                    <TableCell>
                      <span className="text-sm text-slate-600">{log.component || '-'}</span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-800">
                      <div className="max-w-[600px] truncate" title={log.message}>
                        {log.message}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <div className="text-sm text-slate-600">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, totalCount)} of {totalCount} logs
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <i className="fas fa-chevron-left mr-1"></i> Previous
                </Button>
                <span className="text-sm text-slate-600 px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next <i className="fas fa-chevron-right ml-1"></i>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}
