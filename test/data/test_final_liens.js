// Generate a mix of test liens to demonstrate all features
const currentDate = new Date();
const liens = [
  // Synced liens with PDFs
  {
    recordingNumber: "2025-100001",
    recordDate: new Date(currentDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    debtorName: "John Smith",
    debtorAddress: "123 Main St, Phoenix, AZ 85001",
    amount: "15000",
    creditorName: "Phoenix Medical Center",
    county: "Maricopa County",
    status: "synced",
    documentUrl: "https://recorder.maricopa.gov/docs/2025-100001.pdf",
    downloadedPdfPath: "/pdfs/2025-100001.pdf",
    airtableRecordId: "rec0001",
    enrichedData: null
  },
  {
    recordingNumber: "2025-100002", 
    recordDate: new Date(currentDate.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    debtorName: "Jane Doe",
    debtorAddress: "456 Oak Ave, Scottsdale, AZ 85251",
    amount: "8500",
    creditorName: "Valley Hospital",
    county: "Maricopa County", 
    status: "synced",
    documentUrl: "https://recorder.maricopa.gov/docs/2025-100002.pdf",
    downloadedPdfPath: "/pdfs/2025-100002.pdf",
    airtableRecordId: "rec0002",
    enrichedData: null
  },
  // Failed sync but have PDFs (candidates for retry)
  {
    recordingNumber: "2025-100003",
    recordDate: currentDate.toISOString(),
    debtorName: "Michael Johnson",
    debtorAddress: "789 Pine Rd, Tempe, AZ 85281",
    amount: "12000",
    creditorName: "Desert Medical Group",
    county: "Maricopa County",
    status: "pending",
    documentUrl: "https://recorder.maricopa.gov/docs/2025-100003.pdf",
    downloadedPdfPath: "/pdfs/2025-100003.pdf",
    airtableRecordId: null,
    enrichedData: null
  },
  {
    recordingNumber: "2025-100004",
    recordDate: currentDate.toISOString(),
    debtorName: "Sarah Williams",
    debtorAddress: "321 Elm St, Mesa, AZ 85201",
    amount: "25000",
    creditorName: "Mesa General Hospital",
    county: "Maricopa County",
    status: "pending",
    documentUrl: "https://recorder.maricopa.gov/docs/2025-100004.pdf",
    downloadedPdfPath: null, // PDF available but not downloaded
    airtableRecordId: null,
    enrichedData: null
  },
  // No PDF available
  {
    recordingNumber: "2025-100005",
    recordDate: currentDate.toISOString(),
    debtorName: "Robert Brown",
    debtorAddress: "654 Cedar Ln, Glendale, AZ 85301",
    amount: "5000",
    creditorName: "Glendale Clinic",
    county: "Maricopa County",
    status: "pending",
    documentUrl: null,
    downloadedPdfPath: null,
    airtableRecordId: null,
    enrichedData: null
  }
];

// Clear existing liens first
async function clearAndAddLiens() {
  console.log('Adding test liens...');
  
  for (const lien of liens) {
    try {
      const response = await fetch('http://localhost:5000/api/liens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lien)
      });
      if (response.ok) {
        console.log(`Added lien ${lien.recordingNumber}`);
      }
    } catch (error) {
      console.error(`Error adding lien ${lien.recordingNumber}:`, error);
    }
  }
  
  console.log(`Added ${liens.length} test liens demonstrating various states`);
}

clearAndAddLiens();
