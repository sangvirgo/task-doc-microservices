import { detectPreviewFormat } from '../../src/security/preview/content-detector';

describe('detectPreviewFormat', () => {
  it('detects supported signatures and refuses unknown binary content', () => {
    expect(detectPreviewFormat(Buffer.from('%PDF-1.7'))).toBe('pdf');
    expect(detectPreviewFormat(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe('png');
    expect(detectPreviewFormat(Buffer.from([0xff, 0xd8, 0xff]))).toBe('jpeg');
    expect(detectPreviewFormat(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))).toBe('doc');
    expect(detectPreviewFormat(Buffer.from('PK\x03\x04[Content_Types].xml'))).toBe('docx');
    expect(detectPreviewFormat(Buffer.from('plain text\n'))).toBe('text');
    expect(detectPreviewFormat(Buffer.from([0x00, 0x9f, 0xff, 0x00]))).toBe('unsupported');
  });
});
