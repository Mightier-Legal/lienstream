import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lien, County } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Checkbox } from "@/components/ui/checkbox";

interface LiensResponse {
  liens: Lien[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export default function Liens() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLien, setSelectedLien] = useState<Lien | null>(null);
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null);
  const [lienToDelete, setLienToDelete] = useState<Lien | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedLienIds, setSelectedLienIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();

  // Delete single lien mutation
  const deleteLienMutation = useMutation({
    mutationFn: async (lienId: string) => {
      const response = await fetch(`/api/liens/${lienId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete lien');
      }
      return response.json();
    },
    onSuccess: () => {
      // Refetch liens after deletion
      queryClient.invalidateQueries({ queryKey: ['/api/liens/recent'] });
      setSelectedLien(null);
      setLienToDelete(null);
      setIsDeleting(false);
    },
    onError: (error) => {
      console.error('Failed to delete lien:', error);
      setIsDeleting(false);
    }
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (recordingNumbers: string[]) => {
      const response = await fetch('/api/liens/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingNumbers }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to bulk delete liens');
      }
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/liens/recent'] });
      setSelectedLienIds(new Set());
      setShowBulkDeleteConfirm(false);
      setIsDeleting(false);
      console.log(`Successfully deleted ${data.deletedCount} liens`);
    },
    onError: (error) => {
      console.error('Failed to bulk delete liens:', error);
      setIsDeleting(false);
    }
  });

  // Toggle selection of a single lien
  const toggleLienSelection = (lienId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLienIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(lienId)) {
        newSet.delete(lienId);
      } else {
        newSet.add(lienId);
      }
      return newSet;
    });
  };

  // Select/deselect all liens on current page
  const toggleSelectAll = () => {
    if (!filteredLiens) return;
    const allCurrentIds = filteredLiens.map(l => l.id);
    const allSelected = allCurrentIds.every(id => selectedLienIds.has(id));

    if (allSelected) {
      // Deselect all
      setSelectedLienIds(prev => {
        const newSet = new Set(prev);
        allCurrentIds.forEach(id => newSet.delete(id));
        return newSet;
      });
    } else {
      // Select all
      setSelectedLienIds(prev => {
        const newSet = new Set(prev);
        allCurrentIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  };

  // Get recording numbers for selected liens
  const getSelectedRecordingNumbers = () => {
    if (!data?.liens) return [];
    return data.liens
      .filter(l => selectedLienIds.has(l.id))
      .map(l => l.recordingNumber);
  };

  const { data, isLoading } = useQuery<LiensResponse>({
    queryKey: ['/api/liens/recent', page, limit],
    queryFn: async () => {
      const response = await fetch(`/api/liens/recent?page=${page}&limit=${limit}`);
      if (!response.ok) throw new Error('Failed to fetch liens');
      return response.json();
    },
    refetchInterval: 30000,
  });

  // Fetch counties for lookup
  const { data: counties } = useQuery<County[]>({
    queryKey: ['/api/counties'],
    queryFn: async () => {
      const response = await fetch('/api/counties');
      if (!response.ok) throw new Error('Failed to fetch counties');
      return response.json();
    },
  });

  // Create county lookup map
  const countyMap = new Map(counties?.map(c => [c.id, c]) || []);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { className: string; label: string }> = {
      pending: { className: "bg-yellow-100 text-yellow-800 border-yellow-200", label: "Pending" },
      processing: { className: "bg-blue-100 text-blue-800 border-blue-200", label: "Processing" },
      synced: { className: "bg-green-100 text-green-800 border-green-200", label: "Synced" },
      mailer_sent: { className: "bg-purple-100 text-purple-800 border-purple-200", label: "Mailer Sent" },
      completed: { className: "bg-slate-100 text-slate-800 border-slate-200", label: "Completed" },
      failed: { className: "bg-red-100 text-red-800 border-red-200", label: "Failed" },
    };
    const config = variants[status] || { className: "bg-slate-100 text-slate-800", label: status };
    return (
      <Badge variant="outline" className={config.className}>
        {config.label}
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

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num) || num === 0) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const truncate = (str: string | null | undefined, maxLength: number) => {
    if (!str) return '-';
    if (str === 'To be extracted') return <span className="text-slate-400 italic">To be extracted</span>;
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength) + '...';
  };

  // Filter liens based on status and search
  // Search includes all text fields even if not visible in the table
  const filteredLiens = data?.liens.filter(lien => {
    if (statusFilter !== "all" && lien.status !== statusFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        lien.recordingNumber.toLowerCase().includes(search) ||
        lien.debtorName?.toLowerCase().includes(search) ||
        lien.creditorName?.toLowerCase().includes(search) ||
        lien.debtorAddress?.toLowerCase().includes(search) ||
        lien.creditorAddress?.toLowerCase().includes(search) ||
        lien.airtableRecordId?.toLowerCase().includes(search) ||
        lien.id?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  if (isLoading) {
    return (
      <main className="flex-1 overflow-auto bg-slate-50">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <h2 className="text-2xl font-bold text-slate-800">Liens</h2>
          <p className="text-slate-500 mt-1">View and manage all scraped liens</p>
        </header>
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

  const pagination = data?.pagination;

  return (
    <main className="flex-1 overflow-auto bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Liens</h2>
            <p className="text-slate-500 mt-1">View and manage all scraped liens</p>
          </div>
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative">
              <Input
                type="text"
                placeholder="Search by name, ID, Airtable..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-64 pl-9"
              />
              <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
            </div>
            {/* Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Status:</span>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="synced">Synced</SelectItem>
                  <SelectItem value="mailer_sent">Mailer Sent</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Per Page */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-600">Show:</span>
              <Select value={limit.toString()} onValueChange={(v) => { setLimit(parseInt(v)); setPage(1); }}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-slate-800">{pagination?.totalCount || 0}</div>
              <div className="text-sm text-slate-500">Total Liens</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">
                {data?.liens.filter(l => l.status === 'synced').length || 0}
              </div>
              <div className="text-sm text-slate-500">Synced</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-yellow-600">
                {data?.liens.filter(l => l.status === 'pending').length || 0}
              </div>
              <div className="text-sm text-slate-500">Pending</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-purple-600">
                {data?.liens.filter(l => l.status === 'mailer_sent').length || 0}
              </div>
              <div className="text-sm text-slate-500">Mailer Sent</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">
                {data?.liens.filter(l => l.airtableRecordId).length || 0}
              </div>
              <div className="text-sm text-slate-500">In Airtable</div>
            </CardContent>
          </Card>
        </div>

        {/* Bulk Actions Bar */}
        {selectedLienIds.size > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
            <span className="text-sm text-blue-800">
              <strong>{selectedLienIds.size}</strong> lien{selectedLienIds.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedLienIds(new Set())}
              >
                Clear Selection
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                <i className="fas fa-trash-alt mr-2"></i>
                Delete Selected
              </Button>
            </div>
          </div>
        )}

        {/* Liens Table */}
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={filteredLiens && filteredLiens.length > 0 && filteredLiens.every(l => selectedLienIds.has(l.id))}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-[140px]">Recording #</TableHead>
                <TableHead className="w-[100px]">Record Date</TableHead>
                <TableHead className="w-[100px]">Scraped</TableHead>
                <TableHead className="w-[180px]">Debtor Name</TableHead>
                <TableHead className="w-[180px]">Creditor Name</TableHead>
                <TableHead className="text-right w-[100px]">Amount</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead className="w-[80px]">PDF</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLiens && filteredLiens.length > 0 ? (
                filteredLiens.map((lien) => (
                  <TableRow
                    key={lien.id}
                    className={`cursor-pointer hover:bg-slate-50 ${selectedLienIds.has(lien.id) ? 'bg-blue-50' : ''}`}
                    onClick={() => setSelectedLien(lien)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedLienIds.has(lien.id)}
                        onCheckedChange={() => {
                          setSelectedLienIds(prev => {
                            const newSet = new Set(prev);
                            if (newSet.has(lien.id)) {
                              newSet.delete(lien.id);
                            } else {
                              newSet.add(lien.id);
                            }
                            return newSet;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{lien.recordingNumber}</TableCell>
                    <TableCell className="text-slate-600">{formatDate(lien.recordDate)}</TableCell>
                    <TableCell className="text-slate-500 text-sm">
                      {lien.createdAt ? formatDate(lien.createdAt) : '-'}
                    </TableCell>
                    <TableCell className="max-w-[180px]" title={lien.debtorName}>
                      {truncate(lien.debtorName, 25)}
                    </TableCell>
                    <TableCell className="max-w-[180px]" title={lien.creditorName || ''}>
                      {truncate(lien.creditorName, 25)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(lien.amount)}
                    </TableCell>
                    <TableCell>{getStatusBadge(lien.status)}</TableCell>
                    <TableCell>
                      {(lien.pdfUrl || lien.documentUrl) ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPdfViewerUrl(lien.pdfUrl || lien.documentUrl || null);
                          }}
                          className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                        >
                          <i className="fas fa-file-pdf"></i>
                          <span>View</span>
                        </button>
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
                  <TableCell colSpan={11} className="text-center py-12">
                    <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-file-alt text-slate-400 text-xl"></i>
                    </div>
                    <h3 className="text-lg font-medium text-slate-800 mb-2">No Liens Found</h3>
                    <p className="text-slate-500">
                      {statusFilter !== "all" || searchTerm
                        ? "No liens match your filters."
                        : "No liens have been scraped yet."}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200">
              <div className="text-sm text-slate-600">
                Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination.totalCount)} of {pagination.totalCount} liens
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
                  Page {page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  Next <i className="fas fa-chevron-right ml-1"></i>
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* PDF Viewer Modal */}
      <Dialog open={!!pdfViewerUrl} onOpenChange={(open) => !open && setPdfViewerUrl(null)}>
        <DialogContent className="max-w-5xl h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b bg-white">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <i className="fas fa-file-pdf text-red-500"></i>
                PDF Document
              </DialogTitle>
              <div className="flex items-center gap-2">
                <a
                  href={pdfViewerUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <i className="fas fa-external-link-alt"></i>
                  Open in new tab
                </a>
              </div>
            </div>
            <DialogDescription className="text-xs text-slate-500 truncate max-w-[600px]">
              {pdfViewerUrl}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 h-[calc(90vh-80px)] bg-slate-100">
            {pdfViewerUrl && (
              <iframe
                src={pdfViewerUrl}
                className="w-full h-full border-0"
                title="PDF Viewer"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lien Details Modal */}
      <Dialog open={!!selectedLien} onOpenChange={(open) => !open && setSelectedLien(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Lien Details</DialogTitle>
            <DialogDescription>
              Recording #{selectedLien?.recordingNumber}
            </DialogDescription>
          </DialogHeader>

          {selectedLien && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-500">Recording Number</label>
                  <div className="mt-1 font-mono text-slate-800">{selectedLien.recordingNumber}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">County</label>
                  <div className="mt-1 text-slate-800">
                    {countyMap.get(selectedLien.countyId)
                      ? `${countyMap.get(selectedLien.countyId)?.name}, ${countyMap.get(selectedLien.countyId)?.state}`
                      : selectedLien.countyId || '-'}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Record Date</label>
                  <div className="mt-1 text-slate-800">{formatDate(selectedLien.recordDate)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Status</label>
                  <div className="mt-1">{getStatusBadge(selectedLien.status)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-500">Amount</label>
                  <div className="mt-1 text-slate-800 font-medium">{formatCurrency(selectedLien.amount)}</div>
                </div>
              </div>

              {/* Debtor Info */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-800 mb-3">Debtor Information</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-500">Name</label>
                    <div className="mt-1 text-slate-800">
                      {selectedLien.debtorName === 'To be extracted' ? (
                        <span className="text-slate-400 italic">To be extracted</span>
                      ) : (
                        selectedLien.debtorName || '-'
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-500">Address</label>
                    <div className="mt-1 text-slate-800">{selectedLien.debtorAddress || '-'}</div>
                  </div>
                </div>
              </div>

              {/* Creditor Info */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-800 mb-3">Creditor Information</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-500">Name</label>
                    <div className="mt-1 text-slate-800">
                      {selectedLien.creditorName === 'Medical Provider' ? (
                        <span className="text-slate-400 italic">Medical Provider (default)</span>
                      ) : (
                        selectedLien.creditorName || '-'
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-500">Address</label>
                    <div className="mt-1 text-slate-800">{selectedLien.creditorAddress || '-'}</div>
                  </div>
                </div>
              </div>

              {/* Documents & Airtable */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-800 mb-3">Documents & Integration</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-500">Document URL</label>
                    <div className="mt-1">
                      {selectedLien.documentUrl ? (
                        <a
                          href={selectedLien.documentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm break-all"
                        >
                          {selectedLien.documentUrl}
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-500">Local PDF URL</label>
                    <div className="mt-1">
                      {selectedLien.pdfUrl ? (
                        <a
                          href={selectedLien.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 text-sm break-all"
                        >
                          {selectedLien.pdfUrl}
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-500">Airtable Record ID</label>
                    <div className="mt-1 font-mono text-sm">
                      {selectedLien.airtableRecordId || <span className="text-slate-400">Not synced</span>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Timestamps */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-800 mb-3">Timestamps</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-500">Created At</label>
                    <div className="mt-1 text-slate-800 text-sm">
                      {selectedLien.createdAt ? new Date(selectedLien.createdAt).toLocaleString() : '-'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-500">Updated At</label>
                    <div className="mt-1 text-slate-800 text-sm">
                      {selectedLien.updatedAt ? new Date(selectedLien.updatedAt).toLocaleString() : '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Lien ID */}
              <div className="border-t pt-4">
                <label className="text-sm font-medium text-slate-500">Lien ID</label>
                <div className="mt-1 font-mono text-xs text-slate-600">{selectedLien.id}</div>
              </div>

              {/* Delete Button */}
              <div className="border-t pt-4">
                <Button
                  variant="destructive"
                  onClick={() => setLienToDelete(selectedLien)}
                  className="w-full"
                >
                  <i className="fas fa-trash-alt mr-2"></i>
                  Delete Lien
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!lienToDelete} onOpenChange={(open) => !open && setLienToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lien</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete lien <strong>{lienToDelete?.recordingNumber}</strong>?
              This action cannot be undone and will remove the lien from the database.
              {lienToDelete?.airtableRecordId && (
                <span className="block mt-2 text-amber-600">
                  Note: This lien has been synced to Airtable. You may need to manually delete it from Airtable as well.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (lienToDelete) {
                  setIsDeleting(true);
                  deleteLienMutation.mutate(lienToDelete.id);
                }
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Deleting...
                </>
              ) : (
                <>
                  <i className="fas fa-trash-alt mr-2"></i>
                  Delete
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={(open) => !open && setShowBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedLienIds.size} Liens</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedLienIds.size}</strong> selected lien{selectedLienIds.size !== 1 ? 's' : ''}?
              This action cannot be undone.
              <div className="mt-3 max-h-40 overflow-y-auto bg-slate-50 rounded p-2 text-xs font-mono">
                {getSelectedRecordingNumbers().map(rn => (
                  <div key={rn}>{rn}</div>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const recordingNumbers = getSelectedRecordingNumbers();
                if (recordingNumbers.length > 0) {
                  setIsDeleting(true);
                  bulkDeleteMutation.mutate(recordingNumbers);
                }
              }}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? (
                <>
                  <i className="fas fa-spinner fa-spin mr-2"></i>
                  Deleting...
                </>
              ) : (
                <>
                  <i className="fas fa-trash-alt mr-2"></i>
                  Delete {selectedLienIds.size} Liens
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
