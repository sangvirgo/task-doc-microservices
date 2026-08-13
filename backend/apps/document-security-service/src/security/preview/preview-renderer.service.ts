import { execFile } from 'child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

import sharp from 'sharp';

import { detectPreviewFormat } from './content-detector';
import { composeWatermark } from './watermark-composer';
import type { PreviewFormat, WatermarkInput } from './preview.types';

const execFileAsync = promisify(execFile);
const DEFAULT_MAX_INPUT_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 200;
const DEFAULT_MAX_DIMENSION = 2400;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_TEXT_LINES_PER_PAGE = 58;
const DEFAULT_TEMP_ROOT = join(tmpdir(), 'c17-document-preview');

export interface PreviewRenderRequest {
  content: Buffer;
  mimeType: string;
  watermark: WatermarkInput;
}

export interface RenderedPreview {
  format: Exclude<PreviewFormat, 'unsupported'>;
  pages: Buffer[];
  mimeType: 'image/png';
}

export interface PreviewCommandRunner {
  run(command: string, args: string[], cwd: string): Promise<void>;
}

export interface PreviewImageProcessor {
  sanitizeAndWatermark(content: Buffer, watermark: WatermarkInput): Promise<Buffer>;
  watermarkPage(content: Buffer, watermark: WatermarkInput): Promise<Buffer>;
  renderTextPage(text: string, watermark: WatermarkInput): Promise<Buffer>;
}

export interface PreviewRendererOptions {
  tempRoot?: string;
  maxInputBytes?: number;
  maxPages?: number;
  maxDimension?: number;
  timeoutMs?: number;
  commandRunner?: PreviewCommandRunner;
  imageProcessor?: PreviewImageProcessor;
}

export class PreviewUnavailableError extends Error {
  readonly code = 'PREVIEW_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'PreviewUnavailableError';
  }
}

export class PreviewRenderer {
  private readonly options: Required<
    Omit<PreviewRendererOptions, 'commandRunner' | 'imageProcessor'>
  >;
  private readonly commandRunner: PreviewCommandRunner;
  private readonly imageProcessor: PreviewImageProcessor;

  constructor(options: PreviewRendererOptions = {}) {
    this.options = {
      tempRoot: options.tempRoot || DEFAULT_TEMP_ROOT,
      maxInputBytes: options.maxInputBytes || DEFAULT_MAX_INPUT_BYTES,
      maxPages: options.maxPages || DEFAULT_MAX_PAGES,
      maxDimension: options.maxDimension || DEFAULT_MAX_DIMENSION,
      timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    };
    this.commandRunner = options.commandRunner || createCommandRunner(this.options.timeoutMs);
    this.imageProcessor =
      options.imageProcessor || new SharpPreviewImageProcessor(this.options.maxDimension);
  }

  async render(request: PreviewRenderRequest): Promise<RenderedPreview> {
    if (request.content.length > this.options.maxInputBytes) {
      throw new PreviewUnavailableError('Document exceeds the preview size limit');
    }

    const format = detectPreviewFormat(request.content);
    if (format === 'unsupported') {
      throw new PreviewUnavailableError('Document format cannot be previewed safely');
    }

    await mkdir(this.options.tempRoot, { recursive: true });
    const jobDir = await mkdtemp(join(this.options.tempRoot, 'render-'));

    try {
      const pages = await this.renderPages(request, format, jobDir);
      if (pages.length === 0) {
        throw new PreviewUnavailableError('Document contains no previewable pages');
      }
      if (pages.length > this.options.maxPages) {
        throw new PreviewUnavailableError('Document exceeds the preview page limit');
      }

      return { format, pages, mimeType: 'image/png' };
    } finally {
      await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async renderPages(
    request: PreviewRenderRequest,
    format: Exclude<PreviewFormat, 'unsupported'>,
    jobDir: string,
  ): Promise<Buffer[]> {
    switch (format) {
      case 'png':
      case 'jpeg':
        return [
          await this.imageProcessor.sanitizeAndWatermark(request.content, {
            ...request.watermark,
            page: 1,
          }),
        ];
      case 'text':
        return this.renderTextPages(request.content.toString('utf8'), request.watermark);
      case 'pdf':
        return this.renderPdfPages(request.content, '.pdf', request.watermark, jobDir);
      case 'doc':
      case 'docx':
        return this.renderOfficePages(request.content, format, request.watermark, jobDir);
    }
  }

  private async renderTextPages(text: string, watermark: WatermarkInput): Promise<Buffer[]> {
    const lines = text.split(/\r?\n/);
    const pages: Buffer[] = [];
    for (let start = 0; start < Math.max(lines.length, 1); start += DEFAULT_TEXT_LINES_PER_PAGE) {
      const page = pages.length + 1;
      pages.push(
        await this.imageProcessor.renderTextPage(
          lines.slice(start, start + DEFAULT_TEXT_LINES_PER_PAGE).join('\n'),
          {
            ...watermark,
            page,
          },
        ),
      );
    }
    return pages;
  }

  private async renderOfficePages(
    content: Buffer,
    format: 'doc' | 'docx',
    watermark: WatermarkInput,
    jobDir: string,
  ): Promise<Buffer[]> {
    const sourcePath = join(jobDir, `source${format === 'doc' ? '.doc' : '.docx'}`);
    const libreOfficeProfile = join(jobDir, 'libreoffice-profile');
    await writeFile(sourcePath, content, { mode: 0o600 });
    await mkdir(libreOfficeProfile, { recursive: true });
    await this.commandRunner.run(
      'libreoffice',
      [
        `-env:UserInstallation=${pathToFileURL(libreOfficeProfile).href}`,
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        jobDir,
        sourcePath,
      ],
      jobDir,
    );

    const pdfPath = join(jobDir, 'source.pdf');
    return this.renderPdfPagesFromFile(pdfPath, watermark, jobDir);
  }

  private async renderPdfPages(
    content: Buffer,
    extension: '.pdf',
    watermark: WatermarkInput,
    jobDir: string,
  ): Promise<Buffer[]> {
    const sourcePath = join(jobDir, `source${extension}`);
    await writeFile(sourcePath, content, { mode: 0o600 });
    return this.renderPdfPagesFromFile(sourcePath, watermark, jobDir);
  }

  private async renderPdfPagesFromFile(
    sourcePath: string,
    watermark: WatermarkInput,
    jobDir: string,
  ): Promise<Buffer[]> {
    const outputPrefix = join(jobDir, 'page');
    await this.commandRunner.run(
      'pdftoppm',
      ['-png', '-r', '120', sourcePath, outputPrefix],
      jobDir,
    );

    const pageFiles = (await readdir(jobDir))
      .filter((name) => /^page-\d+\.png$/i.test(name))
      .sort((left, right) => extractPageNumber(left) - extractPageNumber(right));

    if (pageFiles.length > this.options.maxPages) {
      throw new PreviewUnavailableError('Document exceeds the preview page limit');
    }

    return Promise.all(
      pageFiles.map(async (pageFile, index) =>
        this.imageProcessor.watermarkPage(await readFile(join(jobDir, pageFile)), {
          ...watermark,
          page: index + 1,
        }),
      ),
    );
  }
}

class SharpPreviewImageProcessor implements PreviewImageProcessor {
  constructor(private readonly maxDimension: number) {}

  async sanitizeAndWatermark(content: Buffer, watermark: WatermarkInput): Promise<Buffer> {
    const normalized = await sharp(content)
      .rotate()
      .resize({
        width: this.maxDimension,
        height: this.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    return this.watermarkPage(normalized, watermark);
  }

  async watermarkPage(content: Buffer, watermark: WatermarkInput): Promise<Buffer> {
    const metadata = await sharp(content).metadata();
    const width = metadata.width || 1200;
    const height = metadata.height || 1600;
    const overlay = Buffer.from(createWatermarkSvg(width, height, watermark));
    return sharp(content)
      .composite([{ input: overlay }])
      .png()
      .toBuffer();
  }

  async renderTextPage(text: string, watermark: WatermarkInput): Promise<Buffer> {
    const width = 1600;
    const height = 2200;
    const lines = text.split('\n').map(escapeXml).join('</tspan><tspan x="100" dy="1.45em">');
    const pageSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <rect width="100%" height="100%" fill="white"/>
      <text x="100" y="130" fill="#111827" font-family="monospace" font-size="30"><tspan x="100">${lines || ' '}</tspan></text>
    </svg>`;
    return this.watermarkPage(await sharp(Buffer.from(pageSvg)).png().toBuffer(), watermark);
  }
}

function createCommandRunner(timeoutMs: number): PreviewCommandRunner {
  return {
    async run(command, args, cwd) {
      await execFileAsync(command, args, { cwd, timeout: timeoutMs, maxBuffer: 1024 * 1024 });
    },
  };
}

function createWatermarkSvg(width: number, height: number, input: WatermarkInput): string {
  const watermark = composeWatermark(input);
  const escapedText = escapeXml(watermark.text);
  const shortText = escapeXml(`${input.actorLabel} · PREVIEW ONLY`);
  const header = escapeXml(`${input.documentId} · v${input.version} · ${input.sessionId}`);
  const footer = escapeXml(
    `${input.actorLabel} · VIEWED AT: ${input.renderedAt.toISOString()} · page ${input.page}`,
  );
  const rotation = watermark.layers.find((layer) => layer.kind === 'repeat')?.rotation || -20;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <g fill="#991b1b" font-family="Arial, sans-serif">
      <g opacity="0.12" font-size="34" transform="rotate(${rotation} ${width / 2} ${height / 2})">
        ${Array.from({ length: 12 }, (_, row) => `<text x="-${width}" y="${row * 190}">${escapedText} · ${escapedText}</text>`).join('')}
      </g>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" font-size="72" opacity="0.28" transform="rotate(${rotation + 18} ${width / 2} ${height / 2})">${shortText}</text>
      <text x="48" y="58" font-size="24" opacity="0.72">${header}</text>
      <text x="48" y="${height - 42}" font-size="24" opacity="0.72">${footer}</text>
      <text x="${width - 48}" y="58" text-anchor="end" font-size="24" opacity="0.82">PREVIEW ONLY — NO DOWNLOAD</text>
    </g>
  </svg>`;
}

function extractPageNumber(fileName: string): number {
  const match = fileName.match(/page-(\d+)\.png$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
