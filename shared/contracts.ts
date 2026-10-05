import { defineRpc } from '@getpaseo/plugin';
import { z } from 'zod';

export const openPreview = defineRpc({
  name: 'preview.open',
  input: z.object({ workspaceId: z.string().min(1) }),
  output: z.object({ url: z.string().url(), hostname: z.string() }),
});
