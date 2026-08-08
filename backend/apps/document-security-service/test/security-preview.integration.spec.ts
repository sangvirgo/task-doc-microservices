import { SecurityController } from '../src/security/security.controller';
import type { SecurityPipelineService } from '../src/security/security-pipeline.service';

describe('Security preview boundary', () => {
  it('returns only prepared preview metadata and image bytes', async () => {
    const service = {
      preparePreview: jest.fn().mockResolvedValue({
        preview_id: '00000000-0000-4000-8000-000000000001',
        page_count: 2,
        mime_type: 'image/png',
        expires_at: '2026-08-08T10:05:00.000Z',
      }),
      getPreviewPage: jest.fn().mockResolvedValue({
        bytes: Buffer.from('watermarked-image'),
        mime_type: 'image/png',
      }),
      revokePreview: jest.fn().mockResolvedValue(undefined),
    } as unknown as SecurityPipelineService;
    const controller = new SecurityController(service);
    const response = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await expect(
      controller.preparePreview('00000000-0000-4000-8000-000000000010', '1', {
        actor_label: 'alice-id',
        session_id: '00000000-0000-4000-8000-000000000011',
      }),
    ).resolves.toEqual({
      preview_id: '00000000-0000-4000-8000-000000000001',
      page_count: 2,
      mime_type: 'image/png',
      expires_at: '2026-08-08T10:05:00.000Z',
    });

    await controller.getPreviewPage(
      '00000000-0000-4000-8000-000000000001',
      '1',
      response as never,
    );

    expect(response.setHeader).toHaveBeenCalledWith('content-type', 'image/png');
    expect(response.setHeader).toHaveBeenCalledWith('cache-control', 'private, no-store');
    expect(response.send).toHaveBeenCalledWith(Buffer.from('watermarked-image'));
  });
});
