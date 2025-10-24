import { Buffer } from 'buffer';
import crypto from 'crypto';
import { Logger } from './logger';

interface StoredPdf {
  id: string;
  buffer: Buffer;
  filename: string;
  createdAt: Date;
}

class PdfStorageService {
  private pdfs: Map<string, StoredPdf> = new Map();
  private maxAge = 1000 * 60 * 60 * 24; // 24 hours - give Airtable plenty of time to download

  storePdf(buffer: Buffer, recordingNumber: string): string {
    const id = crypto.randomUUID();
    const filename = `${recordingNumber}.pdf`;
    
    this.pdfs.set(id, {
      id,
      buffer,
      filename,
      createdAt: new Date()
    });

    // Clean up old PDFs
    this.cleanup();

    Logger.info(`Stored PDF ${filename} with ID ${id}`, 'pdf-storage');
    return id;
  }

  getPdf(id: string): StoredPdf | null {
    const pdf = this.pdfs.get(id);
    if (!pdf) {
      return null;
    }

    // Check if PDF is too old
    const age = Date.now() - pdf.createdAt.getTime();
    if (age > this.maxAge) {
      this.pdfs.delete(id);
      return null;
    }

    return pdf;
  }

  private cleanup() {
    const now = Date.now();
    const entries = Array.from(this.pdfs.entries());
    for (const [id, pdf] of entries) {
      const age = now - pdf.createdAt.getTime();
      if (age > this.maxAge) {
        this.pdfs.delete(id);
        Logger.info(`Cleaned up old PDF ${pdf.filename}`, 'pdf-storage');
      }
    }
  }
}

export const pdfStorage = new PdfStorageService();