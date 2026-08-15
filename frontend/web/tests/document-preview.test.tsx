import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DocumentPreview } from '@/features/documents/document-preview';

const { createPreviewSession, getPreviewPage, revokePreviewSession } = vi.hoisted(() => ({
  createPreviewSession: vi.fn(),
  getPreviewPage: vi.fn(),
  revokePreviewSession: vi.fn(),
}));

vi.mock('@/api/documents', () => ({
  documentsApi: {
    createPreviewSession,
    getPreviewPage,
    revokePreviewSession,
  },
}));

describe('DocumentPreview', () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('loads watermarked page images and hides original-file actions for preview-only users', async () => {
    createPreviewSession.mockResolvedValue({
      id: 'session-1',
      document_id: 'document-1',
      version: 1,
      page_count: 1,
      mime_type: 'image/png',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
      capabilities: { preview: true, download: false },
      title: 'Sensitive memo',
    });
    getPreviewPage.mockResolvedValue(new Blob(['watermarked-page'], { type: 'image/png' }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview-page');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    render(<DocumentPreview documentId="document-1" version={1} />);

    expect(await screen.findByAltText('Preview page 1')).toHaveAttribute(
      'src',
      'blob:preview-page',
    );
    expect(screen.getByText('PREVIEW ONLY — NO DOWNLOAD')).toBeVisible();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /print/i })).not.toBeInTheDocument();
    expect(getPreviewPage).toHaveBeenCalledWith('document-1', 1, 'session-1', 1);
  });
});
