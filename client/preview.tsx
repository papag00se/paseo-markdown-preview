import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRpc, type PluginWorkspacePanelProps } from '@getpaseo/plugin/client';
import { openPreview, releasePreview } from '../shared/contracts';
import { ownPreviewSession } from './session';
import { mountPreview } from './web';

export function PreviewPanel({ workspaceId, theme, layout }: PluginWorkspacePanelProps) {
  const open = useRpc(openPreview);
  const close = useRpc(releasePreview);
  const container = useRef<unknown>(null);
  const [embedded, setEmbedded] = useState(true);
  const [data, setData] = useState<{ url: string; hostname: string }>();
  const [error, setError] = useState<Error>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setData(undefined);
    setError(undefined);
    if (layout.platform !== 'web') return;
    return ownPreviewSession({
      open: () => open({ workspaceId }),
      close: url => close({ url }),
      onReady: value => { setData(value); setError(undefined); },
      onError: value => setError(value),
    });
  }, [workspaceId, layout.platform, open, close, attempt]);
  useEffect(() => {
    if (!data) return;
    const cleanup = mountPreview(container.current, data.url, theme.colors.surface0);
    setEmbedded(!!cleanup);
    return cleanup;
  }, [data, theme.colors.surface0]);
  return <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
    {layout.platform !== 'web' ? <Text style={{ color: theme.colors.foreground, padding: 16 }}>This preview uses the existing HTML renderer and is available in Paseo Desktop and web on the daemon machine.</Text> : null}
    {!data && !error && layout.platform === 'web' ? <Text style={{ color: theme.colors.foregroundMuted, padding: 16 }}>Opening Markdown preview…</Text> : null}
    {error ? <View style={{ padding: 16, gap: 12 }}><Text style={{ color: theme.colors.statusDanger }}>{error.message}</Text><Pressable onPress={() => setAttempt(value => value + 1)} accessibilityRole="button"><Text style={{ color: theme.colors.accent }}>Retry preview</Text></Pressable></View> : null}
    {data && layout.platform === 'web' ? <Text style={{ color: theme.colors.foregroundMuted, paddingHorizontal: 12, paddingVertical: 4, fontSize: 12 }}>Preview host: {data.hostname}. Open this panel on that machine; remote clients cannot reach its local renderer.</Text> : null}
    {!embedded && layout.platform === 'web' ? <Text style={{ color: theme.colors.statusDanger, padding: 16 }}>This client cannot embed the Markdown renderer.</Text> : null}
    <View ref={node => { container.current = node; }} style={{ flex: 1 }} />
  </View>;
}
