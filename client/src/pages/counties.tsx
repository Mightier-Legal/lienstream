import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { County, CountyConfig } from "@shared/schema";
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

export default function Counties() {
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCounty, setEditingCounty] = useState<County | null>(null);

  const { data: counties, isLoading } = useQuery<County[]>({
    queryKey: ['/api/counties'],
    refetchInterval: 30000,
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
    const config = editingCounty.config as CountyConfig;

    // Update the config with form values
    const updatedConfig: CountyConfig = {
      ...config,
      baseUrl: formData.get('baseUrl') as string,
      searchUrl: formData.get('searchUrl') as string,
      documentUrlPattern: formData.get('documentUrlPattern') as string,
      selectors: {
        ...config.selectors,
        documentTypeValue: formData.get('documentTypeValue') as string,
      },
      delays: {
        ...config.delays,
        pageLoad: parseInt(formData.get('pageLoadDelay') as string) || 2000,
        betweenRequests: parseInt(formData.get('betweenRequestsDelay') as string) || 1000,
      }
    };

    updateCountyMutation.mutate({
      id: editingCounty.id,
      updates: {
        name: formData.get('name') as string,
        state: formData.get('state') as string,
        config: updatedConfig
      }
    });
  };

  const handleAddCounty = (formData: FormData) => {
    const name = formData.get('name') as string;
    const state = formData.get('state') as string;
    const configJson = formData.get('config') as string;

    try {
      const config = JSON.parse(configJson);
      addCountyMutation.mutate({ name, state, config, isActive: true });
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
      baseUrl: 'https://recorder.maricopa.gov',
      searchUrl: 'https://recorder.maricopa.gov/recording/document-search.html',
      documentUrlPattern: 'https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/{recordingNumber}.pdf',
      selectors: {
        documentTypeField: 'select[name="documentType"]',
        documentTypeValue: 'MEDICAL LN',
        startDateField: 'input[name="startDate"]',
        endDateField: 'input[name="endDate"]',
        searchButton: 'button[type="submit"]',
        resultsTable: '.search-results',
        recordingNumberLinks: '.search-results tr td:first-child a'
      },
      parsing: {
        amountPattern: 'Amount claimed due for care of patient as of date of recording[:\\\\s]*\\\\$?([\\\\d,]+\\\\.?\\\\d*)',
        debtorPattern: 'Debtor[:\\\\s]*(.*?)(?:\\\\n|Address|$)',
        creditorPattern: 'Creditor[:\\\\s]*(.*?)(?:\\\\n|Address|$)',
        addressPattern: '(\\\\d+.*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Circle|Cir|Court|Ct|Way).*?(?:AZ|Arizona).*?\\\\d{5})'
      },
      delays: {
        pageLoad: 2000,
        betweenRequests: 1000,
        pdfLoad: 2000
      },
      authentication: {
        type: 'none'
      }
    }, null, 2),
    clark: JSON.stringify({
      scrapeType: 'puppeteer',
      baseUrl: 'https://recorder.clarkcountynv.gov',
      searchUrl: 'https://recorder.clarkcountynv.gov/onlinesearch',
      documentUrlPattern: 'https://recorder.clarkcountynv.gov/onlinesearch/showdocument?documentnumber={recordingNumber}',
      selectors: {
        documentTypeField: '#documentType',
        documentTypeValue: 'MEDICAL LIEN',
        startDateField: '#startDate',
        endDateField: '#endDate',
        searchButton: '#searchButton'
      },
      parsing: {
        amountPattern: 'Total amount claimed[:\\\\s]*\\\\$?([\\\\d,]+\\\\.?\\\\d*)',
        debtorPattern: 'Debtor[:\\\\s]*(.*?)(?:\\\\n|Address|$)',
        creditorPattern: 'Medical Provider[:\\\\s]*(.*?)(?:\\\\n|Address|$)',
        addressPattern: '(\\\\d+.*?(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Circle|Cir|Court|Ct|Way).*?(?:NV|Nevada).*?\\\\d{5})'
      },
      delays: {
        pageLoad: 3000,
        betweenRequests: 1500,
        pdfLoad: 2500
      },
      authentication: {
        type: 'none'
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
                
                <div>
                  <Label htmlFor="config">Configuration (JSON)</Label>
                  <Tabs defaultValue="custom" className="mt-2">
                    <TabsList>
                      <TabsTrigger value="custom">Custom</TabsTrigger>
                      <TabsTrigger value="maricopa">Maricopa Template</TabsTrigger>
                      <TabsTrigger value="clark">Clark County Template</TabsTrigger>
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
                    <TabsContent value="clark">
                      <Textarea 
                        id="config" 
                        name="config" 
                        rows={15}
                        defaultValue={sampleConfigs.clark}
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
                          {config.searchUrl}
                        </code>
                      </div>
                      <div>
                        <strong>Document Pattern:</strong><br />
                        <code className="text-xs bg-slate-100 px-2 py-1 rounded break-all overflow-hidden max-w-full inline-block">
                          {config.documentUrlPattern || "Dynamic/Search-based retrieval"}
                        </code>
                      </div>
                      <div>
                        <strong>Document Type:</strong><br />
                        <span className="text-slate-600">
                          {config.selectors.documentTypeValue || "Not specified"}
                        </span>
                      </div>
                      <div>
                        <strong>Authentication:</strong><br />
                        <span className="text-slate-600">
                          {config.authentication?.type || "None"}
                        </span>
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
              </div>

              {/* URLs */}
              <div className="space-y-4">
                <h4 className="font-medium text-slate-800 border-b pb-2">URLs</h4>
                <div>
                  <Label htmlFor="edit-baseUrl">Base URL</Label>
                  <Input
                    id="edit-baseUrl"
                    name="baseUrl"
                    defaultValue={(editingCounty.config as CountyConfig).baseUrl}
                    placeholder="https://recorder.county.gov"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-searchUrl">Search URL</Label>
                  <Input
                    id="edit-searchUrl"
                    name="searchUrl"
                    defaultValue={(editingCounty.config as CountyConfig).searchUrl}
                    placeholder="https://recorder.county.gov/search"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-documentUrlPattern">Document URL Pattern</Label>
                  <Input
                    id="edit-documentUrlPattern"
                    name="documentUrlPattern"
                    defaultValue={(editingCounty.config as CountyConfig).documentUrlPattern}
                    placeholder="https://recorder.county.gov/pdf/{recordingNumber}.pdf"
                  />
                  <p className="text-xs text-slate-500 mt-1">Use {'{recordingNumber}'} as placeholder</p>
                </div>
              </div>

              {/* Selectors */}
              <div className="space-y-4">
                <h4 className="font-medium text-slate-800 border-b pb-2">Document Type</h4>
                <div>
                  <Label htmlFor="edit-documentTypeValue">Document Type Value</Label>
                  <Input
                    id="edit-documentTypeValue"
                    name="documentTypeValue"
                    defaultValue={(editingCounty.config as CountyConfig).selectors?.documentTypeValue}
                    placeholder="MEDICAL LN"
                  />
                  <p className="text-xs text-slate-500 mt-1">The value to select for medical liens</p>
                </div>
              </div>

              {/* Delays */}
              <div className="space-y-4">
                <h4 className="font-medium text-slate-800 border-b pb-2">Timing (milliseconds)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-pageLoadDelay">Page Load Delay</Label>
                    <Input
                      id="edit-pageLoadDelay"
                      name="pageLoadDelay"
                      type="number"
                      defaultValue={(editingCounty.config as CountyConfig).delays?.pageLoad || 2000}
                      min={500}
                      max={10000}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-betweenRequestsDelay">Between Requests Delay</Label>
                    <Input
                      id="edit-betweenRequestsDelay"
                      name="betweenRequestsDelay"
                      type="number"
                      defaultValue={(editingCounty.config as CountyConfig).delays?.betweenRequests || 1000}
                      min={500}
                      max={10000}
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