import type { PluginClientContext } from '@getpaseo/plugin/client';
import { MarkdownFilePanel, PreviewPanel } from './client/preview';

export default function contribute(client: PluginClientContext) {
  client.addWorkspacePanel({ id: 'preview', title: 'Markdown Preview', icon: 'BookOpen', context: 'workspace', locations: ['workspace', 'explorer'], Component: PreviewPanel });
  client.addFilePanel({ id: 'markdown', title: 'Markdown Preview Enhanced', icon: 'BookOpen', files: { extensions: ['md', 'markdown'] }, Component: MarkdownFilePanel });
  client.addCommandCenterItem({ id: 'open-preview', title: 'Open Markdown Preview', icon: 'BookOpen', context: 'workspace', onSelect({ openPanel }) { openPanel('preview'); } });
  return () => {};
}
