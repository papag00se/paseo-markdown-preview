import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

export const openPreview = defineRpc({
  name: 'preview.open',
  input: z.object({ workspaceId: z.string().min(1), filePath: z.string().min(1).optional(), embedded: z.boolean().optional() }),
  output: z.object({ url: z.string().url(), hostname: z.string() }),
});

// A file-tab grant is distinct from workspace browsing; its session cannot enumerate
// or edit neighboring documents.
export const openFilePreview = defineRpc({
  name: 'preview.file.open',
  input: z.object({ filePath: z.string().min(1) }),
  output: z.object({ url: z.string().url(), hostname: z.string(), filePath: z.string().min(1) }),
});

export const releasePreview = defineRpc({
  name: 'preview.close',
  input: z.object({ url: z.string().url() }),
  output: z.object({}),
});
