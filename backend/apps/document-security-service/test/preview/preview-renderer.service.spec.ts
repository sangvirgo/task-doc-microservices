import { mkdtemp, readdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import sharp from 'sharp';

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
      sanitizeAndWatermark: jest.fn((content, _watermark) =>
        Promise.resolve(Buffer.concat([content, Buffer.from('-wm')])),
      ),
      watermarkPage: jest.fn((content, _watermark) =>
        Promise.resolve(Buffer.concat([content, Buffer.from('-wm')])),
      ),
      renderTextPage: jest.fn((text, _watermark) => Promise.resolve(Buffer.from(`text:${text}`))),
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
    expect(imageProcessor.sanitizeAndWatermark.mock.calls).toHaveLength(1);
    expect(imageProcessor.sanitizeAndWatermark.mock.calls[0]).toEqual([
      expect.any(Buffer),
      watermark,
    ]);
  });

  it('burns the multi-layer watermark into a real PNG output', async () => {
    const source = await sharp({
      create: { width: 120, height: 160, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const renderer = new PreviewRenderer({ tempRoot });

    const result = await renderer.render({ content: source, mimeType: 'image/png', watermark });
    const metadata = await sharp(result.pages[0]).metadata();

    expect(metadata.width).toBe(120);
    expect(metadata.height).toBe(160);
    expect(result.pages[0]).not.toEqual(source);
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
    const [command, args, cwd] = commandRunner.run.mock.calls[0] || [];
    expect(command).toBe('pdftoppm');
    expect(args).toEqual(expect.arrayContaining(['-png', '-r', '120']));
    expect(args).toEqual(expect.arrayContaining(['-scale-to', '2400']));
    expect(cwd).toEqual(expect.any(String));
    expect(imageProcessor.watermarkPage.mock.calls).toHaveLength(2);
  });

  it('uses an isolated LibreOffice profile for DOCX conversion', async () => {
    commandRunner.run.mockImplementationOnce(async (command, args, cwd) => {
      expect(command).toBe('libreoffice');
      expect(args).toEqual(expect.arrayContaining(['--headless', '--convert-to', 'pdf']));
      expect(args.some((value) => value.startsWith('-env:UserInstallation=file://'))).toBe(true);
      await writeFile(join(cwd, 'source.pdf'), Buffer.from('%PDF-1.7'));
    });

    const renderer = new PreviewRenderer({ tempRoot, commandRunner, imageProcessor });

    await expect(renderer.render({
      content: Buffer.from('PK\u0003\u0004[Content_Types].xml'),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      watermark,
    })).resolves.toEqual(expect.objectContaining({ format: 'docx', pages: expect.any(Array) }));
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

    expect(commandRunner.run.mock.calls).toHaveLength(0);
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
