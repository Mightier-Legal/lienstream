import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { County, CountyConfig, ScraperPlatform } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

export default function Counties() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCounty, setEditingCounty] = useState<County | null>(null);

  const { data: counties, isLoading } = useQuery<County[]>({
    queryKey: ['/api/counties'],
    refetchInterval: 30000,
  });

  const { data: scraperPlatforms } = useQuery<ScraperPlatform[]>({
    queryKey: ['/api/scraper-platforms'],
  });

  const addCountyMutation = useMutation({
    mutationFn: async (county: any) => {
      const response = await fetch('/api/counties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(county)
      });
      if (!response.ok) throw new Error('Failed to add county');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/counties'] });
      setShowAddForm(false);
      toast({
        title: "Success",
        description: "County configuration added successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add county",
        variant: "destructive"
      });
    }
  });

  const toggleCountyMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await fetch(`/api/counties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      });
      if (!response.ok) throw new Error('Failed to update county');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/counties'] });
      toast({
        title: "Success",
        description: "County status updated successfully",
      });
    }
  });

  const updateCountyMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<County> }) => {
      const response = await fetch(`/api/counties/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) throw new Error('Failed to update county');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/counties'] });
      setEditingCounty(null);
      toast({
        title: "Success",
        description: "County configuration updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update county",
        variant: "destructive"
      });
    }
  });

  const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCounty) return;

    const formData = new FormData(e.currentTarget);
    const config = editingCounty.config as any;

    // Update the config with form values, supporting both old and new field names
    const updatedConfig = {
      ...config,
      baseUrl: formData.get('baseUrl') as string,
      // Use new field names (searchFormUrl, documentDetailUrlPattern)
      searchFormUrl: formData.get('searchFormUrl') as string,
      documentDetailUrlPattern: formData.get('documentDetailUrlPattern') as string,
      defaultDocumentType: formData.get('defaultDocumentType') as string,
      dateFormat: formData.get('dateFormat') as string || config.dateFormat || 'MM/DD/YYYY',
      selectors: {
        ...config.selectors,
      },
      delays: {
        ...config.delays,
        pageLoadWait: parseInt(formData.get('pageLoadWait') as string) || 3000,
        betweenRequests: parseInt(formData.get('betweenRequests') as string) || 300,
        afterFormSubmit: parseInt(formData.get('afterFormSubmit') as string) || 3000,
        pdfLoadWait: parseInt(formData.get('pdfLoadWait') as string) || 2000,
      }
    };

    // Get airtableCountyId - use empty string if blank, null if not provided
    const airtableCountyIdValue = formData.get('airtableCountyId') as string;
    const scraperPlatformIdValue = formData.get('scraperPlatformId') as string;

    updateCountyMutation.mutate({
      id: editingCounty.id,
      updates: {
        name: formData.get('name') as string,
        state: formData.get('state') as string,
        airtableCountyId: airtableCountyIdValue || null,
        scraperPlatformId: scraperPlatformIdValue || null,
        config: updatedConfig
      }
    });
  };

  const handleAddCounty = (formData: FormData) => {
    const name = formData.get('name') as string;
    const state = formData.get('state') as string;
    const configJson = formData.get('config') as string;
    const airtableCountyId = formData.get('airtableCountyId') as string;
    const scraperPlatformId = formData.get('scraperPlatformId') as string;

    try {
      const config = JSON.parse(configJson);
      addCountyMutation.mutate({
        name,
        state,
        config,
        isActive: true,
        airtableCountyId: airtableCountyId || null,
        scraperPlatformId: scraperPlatformId || null
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid configuration JSON",
        variant: "destructive"
      });
    }
  };

  const sampleConfigs = {
    maricopa: JSON.stringify({
      scrapeType: 'puppeteer',
      baseUrl: 'https://legacy.recorder.maricopa.gov',
      searchFormUrl: 'https://legacy.recorder.maricopa.gov/recdocdata/',
      searchResultsUrlPattern: 'https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataRecentPgDn.aspx?rec=0&suf=&nm=&bdt={startDate}&edt={endDate}&cde={docType}&max=500&res=True&doc1={docType}&doc2=&doc3=&doc4=&doc5=',
      documentDetailUrlPattern: 'https://legacy.recorder.maricopa.gov/recdocdata/GetRecDataDetail.aspx?rec={recordingNumber}&suf=&nm=',
      pdfUrlPatterns: [
        'https://legacy.recorder.maricopa.gov/recdocdata/UnofficialPdfDocs.aspx?rec={recordingNumber}&pg=1&cls=RecorderDocuments&suf=',
        'https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/{recordingNumber}.pdf'
      ],
      documentTypes: [
        { code: 'HL', name: 'Hospital Lien', description: 'Medical/Hospital Lien' }
      ],
      defaultDocumentType: 'HL',
      dateFormat: 'MM/DD/YYYY',
      selectors: {
        startDateField: "#ctl00_ContentPlaceHolder1_datepicker_dateInput",
        endDateField: "#ctl00_ContentPlaceHolder1_datepickerEnd_dateInput",
        documentTypeDropdown: "#ctl00_ContentPlaceHolder1_ddlDocCodes",
        searchButton: "#ctl00_ContentPlaceHolder1_btnSearchPanel1",
        resultsTable: 'table',
        recordingNumberLinks: 'a',
        noResultsIndicator: 'No results exist for this search',
        pagesColumnLink: "td a[href*='unofficialpdfdocs']"
      },
      parsing: {
        recordingNumberPattern: '^\\\\d{10,12}$',
        amountPattern: '\\\\$(\\\\d{1,3}(?:,\\\\d{3})*(?:\\\\.\\\\d{2})?)',
        debtorPattern: 'Name\\\\(s\\\\)([\\\\s\\\\S]*?)Document Code',
        addressPattern: '(\\\\d+\\\\s+[A-Za-z0-9\\\\s]+(?:ST|AVE|RD|DR|LN|CT|WAY|BLVD|PL)[\\\\s,]*[A-Za-z\\\\s]+,?\\\\s+AZ\\\\s+\\\\d{5})'
      },
      delays: {
        pageLoadWait: 3000,
        betweenRequests: 300,
        afterFormSubmit: 3000,
        pdfLoadWait: 2000
      },
      rateLimit: {
        maxRequestsPerMinute: 30,
        maxPagesPerRun: 10
      }
    }, null, 2),
    jefferson: JSON.stringify({
      scrapeType: 'puppeteer',
      state: 'AL',
      baseUrl: 'https://landmarkweb.jccal.org',
      searchFormUrl: 'https://landmarkweb.jccal.org/LandmarkWeb/search/index?theme=.blue&section=undefined&quickSearchSelection=undefined',
      requiresDisclaimer: false,
      requiresCaptcha: false,
      documentTypes: [
        {
          code: 'PPHL,PPHL_LR,PPHL_MAPBIR',
          name: 'Hospital Lien',
          description: 'Hospital Lien / Lien on Pers Prop'
        }
      ],
      defaultDocumentType: 'PPHL,PPHL_LR,PPHL_MAPBIR',
      dateSelection: {
        method: 'input',
        format: 'MM/DD/YYYY',
        presetOptions: ['7D', '30D', '90D']
      },
      dateFormat: 'MM/DD/YYYY',
      selectors: {
        documentTypeInput: '#documentType-DocumentType',
        startDateField: '#beginDate-DocumentType',
        endDateField: '#endDate-DocumentType',
        datePresetDropdown: '#lastNumOfDays-DocumentType',
        searchButton: '#submit-DocumentType',
        backToResultsButton: '#returnToSearchButton',
        resultsTable: '???',
        resultRows: '???',
        instrumentNumberCell: '???',
        pdfViewerLink: '???'
      },
      fieldMapping: {
        recordingNumber: 'Instrument #',
        recordDate: 'Record Date',
        creditorName: 'Grantor',
        debtorName: 'Grantee',
        documentType: 'Doc Type',
        pageCount: '# of Pages'
      },
      pdfAccess: {
        method: 'detailPage'
      },
      delays: {
        pageLoadWait: 3000,
        betweenRequests: 500,
        afterFormSubmit: 3000,
        pdfLoadWait: 2000
      },
      rateLimit: {
        maxRequestsPerMinute: 20,
        maxPagesPerRun: 10
      }
    }, null, 2)
  };

  if (isLoading) {
    return (
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <h2 className="text-2xl font-bold text-slate-800">County Management</h2>
          <p className="text-slate-500 mt-1">Configure county settings for record scraping</p>
        </header>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-slate-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-auto">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">County Management</h2>
            <p className="text-slate-500 mt-1">Configure and manage county settings</p>
          </div>
          <Button 
            onClick={() => setShowAddForm(!showAddForm)}
            variant="outline"
            className={`flex items-center justify-center transition-all duration-200 ${showAddForm ? 'bg-blue-500 text-white border-blue-500' : 'hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:shadow-md'}`}
            data-testid="button-add-county"
          >
            <i className="fas fa-plus mr-2"></i>
            Add County
          </Button>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Add County Form */}
        {showAddForm && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle>Add New County Configuration</CardTitle>
              <CardDescription>
                Configure scraping parameters for a new county. Use the sample templates below for reference.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => {
                e.preventDefault();
                handleAddCounty(new FormData(e.currentTarget));
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">County Name</Label>
                    <Input id="name" name="name" placeholder="e.g., Clark County" required />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input id="state" name="state" placeholder="e.g., Nevada" required />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="scraperPlatformId">Scraper Platform</Label>
                    <Select name="scraperPlatformId">
                      <SelectTrigger>
                        <SelectValue placeholder="Select platform..." />
                      </SelectTrigger>
                      <SelectContent>
                        {scraperPlatforms?.map((platform) => (
                          <SelectItem key={platform.id} value={platform.id}>
                            {platform.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">Which scraper implementation to use</p>
                  </div>
                  <div>
                    <Label htmlFor="airtableCountyId">Airtable County ID</Label>
                    <Input
                      id="airtableCountyId"
                      name="airtableCountyId"
                      placeholder="e.g., recXXXXXXXXXXXXXX"
                    />
                    <p className="text-xs text-slate-500 mt-1">Optional: Airtable record ID for linking liens to this county</p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="config">Configuration (JSON)</Label>
                  <Tabs defaultValue="custom" className="mt-2">
                    <TabsList>
                      <TabsTrigger value="custom">Custom</TabsTrigger>
                      <TabsTrigger value="maricopa">Maricopa Template</TabsTrigger>
                      <TabsTrigger value="jefferson">Jefferson County Template</TabsTrigger>
                    </TabsList>
                    <TabsContent value="custom">
                      <Textarea
                        id="config"
                        name="config"
                        rows={15}
                        placeholder="Enter county configuration JSON..."
                        className="font-mono text-sm"
                        required
                      />
                    </TabsContent>
                    <TabsContent value="maricopa">
                      <Textarea
                        id="config"
                        name="config"
                        rows={15}
                        defaultValue={sampleConfigs.maricopa}
                        className="font-mono text-sm"
                        required
                      />
                    </TabsContent>
                    <TabsContent value="jefferson">
                      <Textarea
                        id="config"
                        name="config"
                        rows={15}
                        defaultValue={sampleConfigs.jefferson}
                        className="font-mono text-sm"
                        required
                      />
                    </TabsContent>
                  </Tabs>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowAddForm(false)}
                    className="transition-all duration-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    variant="outline"
                    disabled={addCountyMutation.isPending}
                    className="transition-all duration-200 bg-blue-500 text-white border-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 disabled:border-gray-200"
                  >
                    {addCountyMutation.isPending ? "Adding..." : "Add County"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Counties List */}
        <div className="grid gap-6">
          {counties && counties.length > 0 ? (
            counties.map((county) => {
              const config = county.config as CountyConfig;
              
              return (
                <Card key={county.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {county.name}, {county.state}
                          <Badge variant={county.isActive ? "default" : "secondary"}>
                            {county.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </CardTitle>
                        <CardDescription>
                          Scrape Type: {config.scrapeType} • Base URL: {config.baseUrl}
                        </CardDescription>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingCounty(county)}
                          className="transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleCountyMutation.mutate({
                            id: county.id,
                            isActive: !county.isActive
                          })}
                          disabled={toggleCountyMutation.isPending}
                          className={`transition-all duration-200 ${county.isActive ? 'hover:bg-red-50 hover:text-red-600 hover:border-red-200' : 'hover:bg-green-50 hover:text-green-600 hover:border-green-200'}`}
                        >
                          {county.isActive ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <strong>Search URL:</strong><br />
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded break-all overflow-hidden">
                          {(config as any).searchFormUrl || config.searchUrl || "Not specified"}
                        </code>
                      </div>
                      <div>
                        <strong>Document Detail Pattern:</strong><br />
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded break-all overflow-hidden max-w-full inline-block">
                          {(config as any).documentDetailUrlPattern || config.documentUrlPattern || "Dynamic/Search-based retrieval"}
                        </code>
                      </div>
                      <div>
                        <strong>Document Type:</strong><br />
                        <span className="text-slate-600">
                          {(config as any).defaultDocumentType || config.selectors?.documentTypeValue || "Not specified"}
                        </span>
                      </div>
                      <div>
                        <strong>Date Format:</strong><br />
                        <span className="text-slate-600">
                          {(config as any).dateFormat || "MM/DD/YYYY"}
                        </span>
                      </div>
                      <div>
                        <strong>Scraper Platform:</strong><br />
                        <Badge variant={county.scraperPlatformId ? "default" : "outline"}>
                          {scraperPlatforms?.find(p => p.id === county.scraperPlatformId)?.name || "Not assigned"}
                        </Badge>
                      </div>
                      <div>
                        <strong>Airtable County ID:</strong><br />
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                          {county.airtableCountyId || "Not configured"}
                        </code>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="text-center py-12">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-map text-slate-400 text-xl"></i>
                </div>
                <h3 className="text-lg font-medium text-slate-800 mb-2">No Counties Configured</h3>
                <p className="text-slate-500 mb-4">Add your first county configuration to start scraping records.</p>
                <Button 
                  onClick={() => setShowAddForm(true)}
                  variant="outline"
                  className="transition-all duration-200 hover:bg-blue-500 hover:text-white hover:border-blue-500 hover:shadow-md"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Add County
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Edit County Modal */}
      <Dialog open={!!editingCounty} onOpenChange={(open) => !open && setEditingCounty(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit County Configuration</DialogTitle>
            <DialogDescription>
              Update the configuration for {editingCounty?.name}. Changes will take effect on the next scrape run.
            </DialogDescription>
          </DialogHeader>

          {editingCounty && (
            <form onSubmit={handleEditSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h4 className="font-medium text-slate-800 border-b pb-2">Basic Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-name">County Name</Label>
                    <Input
                      id="edit-name"
                      name="name"
                      defaultValue={editingCounty.name}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-state">State</Label>
                    <Input
                      id="edit-state"
                      name="state"
                      defaultValue={editingCounty.state}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-scraperPlatformId">Scraper Platform</Label>
                    <Select name="scraperPlatformId" defaultValue={editingCounty.scraperPlatformId || ""}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select platform..." />
                      </SelectTrigger>
                      <SelectContent>
                        {scraperPlatforms?.map((platform) => (
                          <SelectItem key={platform.id} value={platform.id}>
                            {platform.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">Which scraper implementation to use</p>
                  </div>
                  <div>
                    <Label htmlFor="edit-airtableCountyId">Airtable County ID</Label>
                    <Input
                      id="edit-airtableCountyId"
                      name="airtableCountyId"
                      defaultValue={editingCounty.airtableCountyId || ""}
                      placeholder="e.g., recXXXXXXXXXXXXXX"
                    />
                    <p className="text-xs text-slate-500 mt-1">Airtable record ID for linking liens to this county</p>
                  </div>
                </div>
              </div>

              {/* URLs */}
              <div className="space-y-4">
                <h4 className="font-medium text-slate-800 border-b pb-2">URLs</h4>
                <div>
                  <Label htmlFor="edit-baseUrl">Base URL</Label>
                  <Input
                    id="edit-baseUrl"
                    name="baseUrl"
                    defaultValue={(editingCounty.config as any).baseUrl}
                    placeholder="https://recorder.county.gov"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-searchFormUrl">Search Form URL</Label>
                  <Input
                    id="edit-searchFormUrl"
                    name="searchFormUrl"
                    defaultValue={(editingCounty.config as any).searchFormUrl || (editingCounty.config as any).searchUrl}
                    placeholder="https://recorder.county.gov/search"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-documentDetailUrlPattern">Document Detail URL Pattern</Label>
                  <Input
                    id="edit-documentDetailUrlPattern"
                    name="documentDetailUrlPattern"
                    defaultValue={(editingCounty.config as any).documentDetailUrlPattern || (editingCounty.config as any).documentUrlPattern}
                    placeholder="https://recorder.county.gov/detail?rec={recordingNumber}"
                  />
                  <p className="text-xs text-slate-500 mt-1">Use {'{recordingNumber}'} as placeholder</p>
                </div>
              </div>

              {/* Document Type */}
              <div className="space-y-4">
                <h4 className="font-medium text-slate-800 border-b pb-2">Document Type</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-defaultDocumentType">Default Document Type Code</Label>
                    <Input
                      id="edit-defaultDocumentType"
                      name="defaultDocumentType"
                      defaultValue={(editingCounty.config as any).defaultDocumentType || (editingCounty.config as any).selectors?.documentTypeValue}
                      placeholder="HL"
                    />
                    <p className="text-xs text-slate-500 mt-1">e.g., HL for Hospital Lien</p>
                  </div>
                  <div>
                    <Label htmlFor="edit-dateFormat">Date Format</Label>
                    <Input
                      id="edit-dateFormat"
                      name="dateFormat"
                      defaultValue={(editingCounty.config as any).dateFormat || "MM/DD/YYYY"}
                      placeholder="MM/DD/YYYY"
                    />
                    <p className="text-xs text-slate-500 mt-1">Format expected by county site</p>
                  </div>
                </div>
              </div>

              {/* Delays */}
              <div className="space-y-4">
                <h4 className="font-medium text-slate-800 border-b pb-2">Timing (milliseconds)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-pageLoadWait">Page Load Wait</Label>
                    <Input
                      id="edit-pageLoadWait"
                      name="pageLoadWait"
                      type="number"
                      defaultValue={(editingCounty.config as any).delays?.pageLoadWait || (editingCounty.config as any).delays?.pageLoad || 3000}
                      min={500}
                      max={30000}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-betweenRequests">Between Requests</Label>
                    <Input
                      id="edit-betweenRequests"
                      name="betweenRequests"
                      type="number"
                      defaultValue={(editingCounty.config as any).delays?.betweenRequests || 300}
                      min={100}
                      max={10000}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-afterFormSubmit">After Form Submit</Label>
                    <Input
                      id="edit-afterFormSubmit"
                      name="afterFormSubmit"
                      type="number"
                      defaultValue={(editingCounty.config as any).delays?.afterFormSubmit || 3000}
                      min={500}
                      max={30000}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-pdfLoadWait">PDF Load Wait</Label>
                    <Input
                      id="edit-pdfLoadWait"
                      name="pdfLoadWait"
                      type="number"
                      defaultValue={(editingCounty.config as any).delays?.pdfLoadWait || (editingCounty.config as any).delays?.pdfLoad || 2000}
                      min={500}
                      max={30000}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingCounty(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateCountyMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {updateCountyMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}