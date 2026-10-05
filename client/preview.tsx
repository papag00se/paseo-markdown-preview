import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRpc, type PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { openPreview } from '../shared/contracts';
import { mountPreview } from './web';

export function PreviewPanel({ workspaceId, theme, layout }: PluginWorkspacePanelProps) {
  const open = useRpc(openPreview);
  const container = useRef<unknown>(null);
  const [embedded, setEmbedded] = useState(true);
  const query = useQuery({ queryKey: ['markdown-preview', workspaceId], queryFn: () => open({ workspaceId }), staleTime: Infinity, retry: false, enabled: layout.platform === 'web' });
  useEffect(() => {
    if (!query.data) return;
    const cleanup = mountPreview(container.current, query.data.url, theme.colors.surface0);
    setEmbedded(!!cleanup);
    return cleanup;
  }, [query.data, theme.colors.surface0]);
  return <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
    {layout.platform !== 'web' ? <Text style={{ color: theme.colors.foreground, padding: 16 }}>This preview uses the existing HTML renderer and is available in Paseo Desktop and web on the daemon machine.</Text> : null}
    {query.isPending && layout.platform === 'web' ? <Text style={{ color: theme.colors.foregroundMuted, padding: 16 }}>Opening Markdown preview…</Text> : null}
    {query.error ? <View style={{ padding: 16, gap: 12 }}><Text style={{ color: theme.colors.statusDanger }}>{query.error.message}</Text><Pressable onPress={() => query.refetch()} accessibilityRole="button"><Text style={{ color: theme.colors.accent }}>Retry preview</Text></Pressable></View> : null}
    {query.data && layout.platform === 'web' ? <Text style={{ color: theme.colors.foregroundMuted, paddingHorizontal: 12, paddingVertical: 4, fontSize: 12 }}>Preview host: {query.data.hostname}. Open this panel on that machine; remote clients cannot reach its local renderer.</Text> : null}
    {!embedded && layout.platform === 'web' ? <Text style={{ color: theme.colors.statusDanger, padding: 16 }}>This client cannot embed the Markdown renderer.</Text> : null}
    <View ref={node => { container.current = node; }} style={{ flex: 1 }} />
  </View>;
}
