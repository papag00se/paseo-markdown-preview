import { Platform } from 'react-native';

// The HTML renderer belongs to a separate, loopback-only origin. Keep the DOM bridge
// here so the plugin panel and imports remain valid in native Paseo clients.
interface Frame {
  src: string;
  title: string;
  style: { width: string; height: string; border: string; flex: string };
  setAttribute(name: string, value: string): void;
  remove(): void;
}
interface Container { appendChild(child: Frame): void }
declare const document: { createElement(tag: 'iframe'): Frame };

export function mountPreview(container: unknown, url: string, background?: string): (() => void) | undefined {
  if (Platform.OS !== 'web' || !container || typeof (container as Container).appendChild !== 'function') return;
  const frame = document.createElement('iframe');
  const color = background?.match(/^#([a-f\d]{6})$/i)?.[1];
  const dark = color ? (parseInt(color.slice(0,2),16)*0.299 + parseInt(color.slice(2,4),16)*0.587 + parseInt(color.slice(4,6),16)*0.114) < 128 : undefined;
  const target = new URL(url);
  if (dark !== undefined) target.searchParams.set('theme', dark ? 'dark' : 'light');
  frame.src = target.toString();
  frame.title = 'Markdown Preview Enhanced';
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.style.width = '100%'; frame.style.height = '100%'; frame.style.border = '0'; frame.style.flex = '1';
  (container as Container).appendChild(frame);
  return () => frame.remove();
}
