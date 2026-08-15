import type { PreviewFormat } from './preview.types';

const PDF_SIGNATURE = Buffer.from('%PDF-');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const DOC_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOCX_CONTENT_TYPE_MARKER = Buffer.from('[Content_Types].xml');

export function detectPreviewFormat(content: Buffer): PreviewFormat {
  if (startsWithPdfSignature(content)) return 'pdf';
  if (content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return 'png';
  if (content.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)) return 'jpeg';
  if (content.subarray(0, DOC_SIGNATURE.length).equals(DOC_SIGNATURE)) return 'doc';

  if (
    content.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE) &&
    content.includes(DOCX_CONTENT_TYPE_MARKER)
  ) {
    return 'docx';
  }

  return isSafeUtf8Text(content) ? 'text' : 'unsupported';
}

function startsWithPdfSignature(content: Buffer): boolean {
  let offset = 0;
  while (offset < content.length && isPdfLeadingWhitespace(content[offset])) offset += 1;
  return content.subarray(offset, offset + PDF_SIGNATURE.length).equals(PDF_SIGNATURE);
}

function isPdfLeadingWhitespace(byte: number): boolean {
  return byte === 0x09 || byte === 0x0a || byte === 0x0c || byte === 0x0d || byte === 0x20;
}

function isSafeUtf8Text(content: Buffer): boolean {
  if (content.includes(0)) return false;

  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(content);
    return [...decoded].every((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d || codePoint >= 0x20;
    });
  } catch {
    return false;
  }
}
