export type PreviewFormat = 'pdf' | 'png' | 'jpeg' | 'doc' | 'docx' | 'text' | 'unsupported';

export interface WatermarkInput {
  actorLabel: string;
  documentId: string;
  version: number;
  sessionId: string;
  renderedAt: Date;
  page: number;
}

export interface WatermarkLayer {
  kind: 'repeat' | 'center' | 'header' | 'footer' | 'warning';
  text: string;
  opacity: number;
  rotation: number;
}

export interface WatermarkComposition {
  input: WatermarkInput;
  text: string;
  seed: number;
  layers: WatermarkLayer[];
}
