import type { PluginServerContext } from '@getpaseo/plugin/server';
import { hostname } from 'node:os';
import { openPreview, releasePreview } from './shared/contracts';
import { createPreviewService } from './server/service';

export default function contribute(server: PluginServerContext) {
  let service: ReturnType<typeof createPreviewService> | undefined;
  server.handle(openPreview, async ({ workspaceId, filePath, embedded }, { paseo }) => {
    const workspace = await paseo.workspaces.ref(workspaceId).refresh();
    if (!workspace?.workspaceDirectory) throw new Error('Workspace directory is unavailable.');
    service ??= createPreviewService();
    return { url: await (await service).open(workspace.workspaceDirectory, { filePath, embedded }), hostname: hostname() };
  });
  server.handle(releasePreview, async ({ url }) => {
    if (service) (await service).release(url);
    return {};
  });
  return async () => { if (service) await (await service).close(); };
}
