import { Buffer } from 'buffer';
import crypto from 'crypto';
import { Logger } from './logger';
import fs from 'fs';
import path from 'path';

interface StoredPdf {
  id: string;
  buffer: Buffer;
  filename: string;
  createdAt: Date;
}

class PdfStorageService {
  private storageDir = 'stored_pdfs';
  private maxAge = 1000 * 60 * 60 * 24 * 7; // 7 days - give Airtable plenty of time
  
  constructor() {
    // Ensure storage directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
      Logger.info(`Created PDF storage directory: ${this.storageDir}`, 'pdf-storage');
    }
  }

  storePdf(buffer: Buffer, recordingNumber: string): string {
    const id = crypto.randomUUID();
    const filename = `${recordingNumber}.pdf`;
    const filePath = path.join(this.storageDir, `${id}.pdf`);
    const metaPath = path.join(this.storageDir, `${id}.json`);
    
    // Save PDF to disk
    fs.writeFileSync(filePath, buffer);
    
    // Save metadata
    const metadata = {
      id,
      filename,
      recordingNumber,
      createdAt: new Date().toISOString(),
      size: buffer.length
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    // Clean up old PDFs
    this.cleanup();

    Logger.info(`Stored PDF ${filename} with ID ${id} to disk`, 'pdf-storage');
    return id;
  }

  getPdf(id: string): StoredPdf | null {
    const filePath = path.join(this.storageDir, `${id}.pdf`);
    const metaPath = path.join(this.storageDir, `${id}.json`);
    
    // Check if files exist
    if (!fs.existsSync(filePath) || !fs.existsSync(metaPath)) {
      Logger.warning(`PDF not found: ${id}`, 'pdf-storage');
      return null;
    }
    
    try {
      // Read metadata
      const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      
      // Check if PDF is too old
      const age = Date.now() - new Date(metadata.createdAt).getTime();
      if (age > this.maxAge) {
        // Delete old files
        fs.unlinkSync(filePath);
        fs.unlinkSync(metaPath);
        Logger.info(`Deleted expired PDF: ${id}`, 'pdf-storage');
        return null;
      }
      
      // Read PDF buffer
      const buffer = fs.readFileSync(filePath);
      
      return {
        id: metadata.id,
        buffer,
        filename: metadata.filename,
        createdAt: new Date(metadata.createdAt)
      };
    } catch (error) {
      Logger.error(`Error reading PDF ${id}: ${error}`, 'pdf-storage');
      return null;
    }
  }

  private cleanup() {
    try {
      const files = fs.readdirSync(this.storageDir);
      const now = Date.now();
      
      // Check each metadata file
      files.filter(f => f.endsWith('.json')).forEach(metaFile => {
        const metaPath = path.join(this.storageDir, metaFile);
        try {
          const metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const age = now - new Date(metadata.createdAt).getTime();
          
          if (age > this.maxAge) {
            const pdfFile = metaFile.replace('.json', '.pdf');
            const pdfPath = path.join(this.storageDir, pdfFile);
            
            // Delete both files
            if (fs.existsSync(pdfPath)) {
              fs.unlinkSync(pdfPath);
            }
            fs.unlinkSync(metaPath);
            
            Logger.info(`Cleaned up old PDF: ${metadata.filename}`, 'pdf-storage');
          }
        } catch (err) {
          // Ignore individual file errors during cleanup
        }
      });
    } catch (error) {
      Logger.error(`Cleanup error: ${error}`, 'pdf-storage');
    }
  }
  
  // Method to re-download PDFs from database if needed
  async redownloadPdf(recordingNumber: string): Promise<Buffer | null> {
    try {
      const pdfUrl = `https://legacy.recorder.maricopa.gov/UnOfficialDocs/pdf/${recordingNumber}.pdf`;
      Logger.info(`Re-downloading PDF from: ${pdfUrl}`, 'pdf-storage');
      
      const response = await fetch(pdfUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/pdf,*/*'
        }
      });
      
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Verify it's a PDF
        const header = buffer.toString('utf8', 0, 5);
        if (header.startsWith('%PDF')) {
          Logger.success(`Re-downloaded PDF successfully: ${recordingNumber}`, 'pdf-storage');
          return buffer;
        }
      }
      
      return null;
    } catch (error) {
      Logger.error(`Failed to re-download PDF ${recordingNumber}: ${error}`, 'pdf-storage');
      return null;
    }
  }
}

export const pdfStorage = new PdfStorageService();