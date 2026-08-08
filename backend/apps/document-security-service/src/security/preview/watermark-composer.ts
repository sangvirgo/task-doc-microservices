import type {
  WatermarkComposition,
  WatermarkInput,
  WatermarkLayer,
} from './preview.types';

export function composeWatermark(input: WatermarkInput): WatermarkComposition {
  const timestamp = input.renderedAt.toISOString();
  const text = `PREVIEW ONLY — NO DOWNLOAD | ${input.actorLabel} | ${input.documentId} | v${input.version} | ${timestamp} | ${input.sessionId} | page ${input.page}`;
  const seed = hash(`${input.sessionId}:${input.documentId}:${input.version}:${input.page}`);
  const rotation = ((seed % 11) - 5) * 1.5;

  const layers: WatermarkLayer[] = [
    {
      kind: 'repeat',
      text,
      opacity: 0.12,
      rotation: rotation - 18,
    },
    {
      kind: 'center',
      text: `${input.actorLabel} · PREVIEW ONLY`,
      opacity: 0.28,
      rotation,
    },
    {
      kind: 'header',
      text: `${input.documentId} · v${input.version} · ${input.sessionId}`,
      opacity: 0.72,
      rotation: 0,
    },
    {
      kind: 'footer',
      text: `${input.actorLabel} · ${timestamp} · page ${input.page}`,
      opacity: 0.72,
      rotation: 0,
    },
    {
      kind: 'warning',
      text: 'PREVIEW ONLY — NO DOWNLOAD',
      opacity: 0.82,
      rotation: 0,
    },
  ];

  return { input, text, seed, layers };
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
