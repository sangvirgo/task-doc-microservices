import { Injectable } from '@nestjs/common';

/**
 * Document Management Service (V3 §5.4, §5.6).
 *
 * Phase 1: skeleton with mock data.
 * Phase 2: implement document lifecycle, versioning, and security pipeline.
 */
@Injectable()
export class DocumentsService {
  /**
   * Get document preview.
   * Phase 1: returns mock preview.
   * Phase 2: retrieve from encrypted storage and decrypt.
   */
  getDocumentPreview(documentId: string): {
    id: string;
    title: string;
    security_level: string;
    preview_text: string;
  } {
    // Phase 1 mock: return static preview for testing
    return {
      id: documentId,
      title: `Document ${documentId}`,
      security_level: 'CONFIDENTIAL',
      preview_text: 'Phase 1 skeleton document preview text...',
    };
  }

  /**
   * Download document metadata.
   * Phase 2: ticket-based download with expiry.
   */
  getDocumentMetadata(documentId: string): {
    id: string;
    title: string;
    owner_id: string;
    created_at: string;
    size_bytes: number;
  } {
    // Phase 1 mock
    return {
      id: documentId,
      title: `Document ${documentId}`,
      owner_id: 'user-1',
      created_at: new Date().toISOString(),
      size_bytes: 1024,
    };
  }
}
