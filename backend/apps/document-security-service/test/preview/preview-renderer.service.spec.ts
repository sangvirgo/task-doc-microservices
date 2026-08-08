import { mkdtemp, readdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  PreviewRenderer,
  PreviewUnavailableError,
  type PreviewImageProcessor,
  type PreviewCommandRunner,
} from '../../src/security/preview/preview-renderer.service';

const watermark = {
  actorLabel: 'alice@example.test',
  documentId: '00000000-0000-4000-8000-000000000001',
  version: 1,
  sessionId: '00000000-0000-4000-8000-000000000002',
  renderedAt: new Date('2026-08-08T10:00:00.000Z'),
  page: 1,
};

describe('PreviewRenderer', () => {
  let tempRoot: string;
  let imageProcessor: jest.Mocked<PreviewImageProcessor>;
  let commandRunner: jest.Mocked<PreviewCommandRunner>;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'c17-preview-test-'));
    imageProcessor = {
      sanitizeAndWatermark: jest.fn(async (content, _watermark) => Buffer.concat([content, Buffer.from('-wm')])),
      watermarkPage: jest.fn(async (content, _watermark) => Buffer.concat([content, Buffer.from('-wm')])),
      renderTextPage: jest.fn(async (text, _watermark) => Buffer.from(`text:${text}`)),
    };
    commandRunner = {
      run: jest.fn(async (_command, args, cwd) => {
        const prefix = args[args.length - 1];
        await writeFile(`${prefix}-1.png`, Buffer.from('page-one'));
        await writeFile(`${prefix}-2.png`, Buffer.from('page-two'));
        void cwd;
      }),
    };
  });

  afterEach(async () => {
    const entries = await readdir(tempRoot);
    expect(entries).toEqual([]);
  });

  it('renders a supported image as one watermarked page', async () => {
    const renderer = new PreviewRenderer({ tempRoot, commandRunner, imageProcessor });

    const result = await renderer.render({
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mimeType: 'image/png',
      watermark,
    });

    expect(result.format).toBe('png');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x2d, 0x77, 0x6d]));
    expect(imageProcessor.sanitizeAndWatermark).toHaveBeenCalledWith(
      expect.any(Buffer),
      watermark,
    );
  });

  it('renders PDF pages through a controlled converter and cleans temporary files', async () => {
    const renderer = new PreviewRenderer({ tempRoot, commandRunner, imageProcessor });

    const result = await renderer.render({
      content: Buffer.from('%PDF-1.7'),
      mimeType: 'application/pdf',
      watermark,
    });

    expect(result.format).toBe('pdf');
    expect(result.pages).toHaveLength(2);
    expect(commandRunner.run).toHaveBeenCalledWith(
      'pdftoppm',
      expect.arrayContaining(['-png', '-r', '120']),
      expect.any(String),
    );
    expect(imageProcessor.watermarkPage).toHaveBeenCalledTimes(2);
  });

  it('rejects unknown binary content without returning source bytes', async () => {
    const renderer = new PreviewRenderer({ tempRoot, commandRunner, imageProcessor });

    await expect(
      renderer.render({
        content: Buffer.from([0x00, 0x9f, 0xff, 0x00]),
        mimeType: 'application/octet-stream',
        watermark,
      }),
    ).rejects.toBeInstanceOf(PreviewUnavailableError);

    expect(commandRunner.run).not.toHaveBeenCalled();
  });

  it('cleans temporary files when conversion fails', async () => {
    commandRunner.run.mockRejectedValueOnce(new Error('converter failed'));
    const renderer = new PreviewRenderer({ tempRoot, commandRunner, imageProcessor });

    await expect(
      renderer.render({
        content: Buffer.from('%PDF-1.7'),
        mimeType: 'application/pdf',
        watermark,
      }),
    ).rejects.toThrow('converter failed');
  });
});
