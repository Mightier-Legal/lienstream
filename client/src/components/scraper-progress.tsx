import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

interface ProgressData {
  officialStatus: {
    isRunning: boolean;
    latestRunStatus: string;
    latestRunId: string;
  };
  realActivity: {
    hasRecentActivity: boolean;
    liensCreatedLast5Min: number;
    liensCreatedLastHour: number;
    liensCreatedToday: number;
  };
  database: {
    totalLiens: number;
    pendingLiens: number;
    syncedLiens: number;
    liensWithPdfs: number;
    liensWithoutPdfs: number;
  };
  pdfStorage: {
    totalPdfs: number;
    recentPdfs: { id: string; filename: string; createdAt: string; size: number }[];
  };
  mostRecentLien: {
    recordingNumber: string;
    recordDate: string;
    createdAt: string;
    status: string;
    hasPdf: boolean;
  } | null;
  recentLogs: {
    level: string;
    message: string;
    component: string;
    timestamp: string;
  }[];
  checkedAt: string;
}

export function ScraperProgress() {
  const { data, isLoading, error } = useQuery<ProgressData>({
    queryKey: ['/api/automation/progress'],
    queryFn: async () => {
      const response = await fetch('/api/automation/progress');
      if (!response.ok) throw new Error('Failed to fetch progress');
      return response.json();
    },
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getActivityStatus = () => {
    if (!data) return { label: 'Unknown', color: 'bg-slate-100 text-slate-600' };

    const { officialStatus, realActivity } = data;

    if (officialStatus.isRunning && realActivity.hasRecentActivity) {
      return { label: 'Running', color: 'bg-green-100 text-green-700 border-green-200' };
    }
    if (!officialStatus.isRunning && realActivity.hasRecentActivity) {
      return { label: 'Active (status mismatch)', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
    }
    if (officialStatus.isRunning && !realActivity.hasRecentActivity) {
      return { label: 'Stalled?', color: 'bg-orange-100 text-orange-700 border-orange-200' };
    }
    return { label: 'Idle', color: 'bg-slate-100 text-slate-600 border-slate-200' };
  };

  const getLevelBadge = (level: string) => {
    const variants: Record<string, string> = {
      info: 'bg-blue-100 text-blue-700',
      success: 'bg-green-100 text-green-700',
      warning: 'bg-yellow-100 text-yellow-700',
      error: 'bg-red-100 text-red-700',
    };
    return variants[level] || 'bg-slate-100 text-slate-600';
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <i className="fas fa-chart-line text-blue-500"></i>
            Scraper Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <i className="fas fa-spinner fa-spin text-2xl text-slate-400"></i>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <i className="fas fa-chart-line text-blue-500"></i>
            Scraper Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-red-500 text-center py-4">
            Failed to load progress data
          </div>
        </CardContent>
      </Card>
    );
  }

  const activityStatus = getActivityStatus();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <i className="fas fa-chart-line text-blue-500"></i>
            Scraper Progress
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={activityStatus.color}>
              {data.realActivity.hasRecentActivity && (
                <span className="w-2 h-2 bg-current rounded-full mr-2 animate-pulse"></span>
              )}
              {activityStatus.label}
            </Badge>
            <span className="text-xs text-slate-400">
              Updated {formatTime(data.checkedAt)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Activity Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">
              {data.realActivity.liensCreatedLast5Min}
            </div>
            <div className="text-xs text-blue-600/70">Last 5 min</div>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">
              {data.realActivity.liensCreatedLastHour}
            </div>
            <div className="text-xs text-green-600/70">Last hour</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {data.realActivity.liensCreatedToday}
            </div>
            <div className="text-xs text-purple-600/70">Today</div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-slate-600">
              {data.database.totalLiens}
            </div>
            <div className="text-xs text-slate-600/70">Total</div>
          </div>
        </div>

        {/* Database & PDF Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Database Stats */}
          <div className="bg-slate-50 rounded-lg p-3">
            <h4 className="font-medium text-slate-700 mb-2 text-sm">Database Status</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Pending:</span>
                <span className="font-medium text-yellow-600">{data.database.pendingLiens}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Synced:</span>
                <span className="font-medium text-green-600">{data.database.syncedLiens}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">With PDFs:</span>
                <span className="font-medium text-blue-600">{data.database.liensWithPdfs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Missing PDFs:</span>
                <span className={`font-medium ${data.database.liensWithoutPdfs > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {data.database.liensWithoutPdfs}
                </span>
              </div>
            </div>
          </div>

          {/* PDF Storage Stats */}
          <div className="bg-slate-50 rounded-lg p-3">
            <h4 className="font-medium text-slate-700 mb-2 text-sm">PDF Storage</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total PDFs:</span>
                <span className="font-medium">{data.pdfStorage.totalPdfs}</span>
              </div>
              {data.pdfStorage.recentPdfs.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <div className="text-xs text-slate-400 mb-1">Recent PDFs:</div>
                  <div className="space-y-1 max-h-20 overflow-y-auto">
                    {data.pdfStorage.recentPdfs.slice(0, 3).map((pdf, i) => (
                      <div key={i} className="flex justify-between text-xs">
                        <a
                          href={`/api/pdf/${pdf.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-blue-600 hover:text-blue-800 hover:underline truncate max-w-[120px]"
                          title={`Open ${pdf.filename}`}
                        >
                          <i className="fas fa-external-link-alt mr-1 text-[10px]"></i>
                          {pdf.filename}
                        </a>
                        <span className="text-slate-400">{formatSize(pdf.size)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Most Recent Lien */}
        {data.mostRecentLien && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3">
            <h4 className="font-medium text-slate-700 mb-2 text-sm">Most Recent Lien</h4>
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-sm font-medium">
                  {data.mostRecentLien.recordingNumber}
                </span>
                <div className="text-xs text-slate-500 mt-0.5">
                  Recorded: {data.mostRecentLien.recordDate} |
                  Scraped: {formatTime(data.mostRecentLien.createdAt)}
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className={
                  data.mostRecentLien.status === 'synced'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-yellow-100 text-yellow-700'
                }>
                  {data.mostRecentLien.status}
                </Badge>
                {data.mostRecentLien.hasPdf ? (
                  <Badge variant="outline" className="bg-blue-100 text-blue-700">
                    <i className="fas fa-file-pdf mr-1"></i> PDF
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-red-100 text-red-700">
                    <i className="fas fa-times mr-1"></i> No PDF
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Recent Logs */}
        {data.recentLogs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-slate-700 text-sm">Recent Scraper Activity</h4>
              <Link href="/logs">
                <a className="text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1">
                  View All Logs
                  <i className="fas fa-arrow-right text-[10px]"></i>
                </a>
              </Link>
            </div>
            <div className="bg-slate-900 rounded-lg p-3 max-h-40 overflow-y-auto">
              <div className="space-y-1 font-mono text-xs">
                {data.recentLogs.map((log, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-slate-500 shrink-0">
                      {formatTime(log.timestamp)}
                    </span>
                    <Badge className={`${getLevelBadge(log.level)} text-[10px] px-1 py-0 h-4`}>
                      {log.level}
                    </Badge>
                    <span className="text-slate-300 truncate">
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Official Status Footer */}
        <div className="pt-2 border-t border-slate-200 text-xs text-slate-400 flex justify-between">
          <span>
            Official: {data.officialStatus.isRunning ? 'Running' : 'Not Running'} |
            Status: {data.officialStatus.latestRunStatus}
          </span>
          <span>
            Run ID: {data.officialStatus.latestRunId?.slice(0, 8) || 'N/A'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
