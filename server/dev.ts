import { createPreviewService } from './service';
async function main() {
  const service = await createPreviewService();
  console.log(await service.open(process.argv[2] ?? process.cwd()));
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void service.close().then(() => process.exit(0)); });
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
