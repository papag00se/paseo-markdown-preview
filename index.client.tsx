import type { PluginClientContext } from '@getpaseo/plugin/client';
import { PreviewPanel } from './client/preview';

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({ id: 'preview', title: 'Markdown Preview', icon: 'BookOpen', context: 'workspace', locations: ['workspace', 'explorer'], Component: PreviewPanel });
  client.addCommandCenterItem({ id: 'open-preview', title: 'Open Markdown Preview', icon: 'BookOpen', context: 'workspace', onSelect({ openPanel }) { openPanel('preview'); } });
  return () => {};
}
