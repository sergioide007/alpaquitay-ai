import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { formatBytes, type ManifestSummary } from './cdnPolicy';
import { assertPromptSize, gpuRequired, stripThinking } from './enginePolicy';
import type { LocalEngineApi, ProbeResult } from './LocalEngineHost';
import type { EngineMessage, LocalEngineSettings } from './protocol';
import { friendlyFsError, isUsableRoot } from '../core/WorkspaceRoot';

export const GENERATE_SPEC_LOCAL = 'alpaquitay-ai.generateSpecLocal';
export const CLEAR_LOCAL_CACHE = 'alpaquitay-ai.clearLocalModelCache';

const SPEC_SYSTEM_PROMPT = [
  'You are a senior business analyst. Turn the request into a specification in Markdown.',
  'Use EXACTLY this format and nothing else:',
  '# <Project or feature title>',
  '<one short paragraph of context>',
  '## Epic: <epic name>',
  '- [ ] SPEC-001 <small, verifiable task>',
  '- [ ] SPEC-002 <small, verifiable task>',
  'Rules: 2 to 5 epics, 2 to 6 tasks per epic, task ids numbered continuously from SPEC-001,',
  'every task starts with a verb, no code fences, no text before the title or after the last task.',
  'Write in the same language as the request.',
].join('\n');

export function buildSpecMessages(description: string): EngineMessage[] {
  return [
    { role: 'system', content: SPEC_SYSTEM_PROMPT },
    { role: 'user', content: description.trim() },
  ];
}

/** Small local models often add a preamble or wrap the answer in a fence; keep only the spec. */
export function extractSpecMarkdown(raw: string): string {
  let text = stripThinking(raw).replace(/^```(?:markdown|md)?\s*\n/i, '').replace(/\n```\s*$/i, '').trim();
  const start = text.search(/^#\s+\S/m);
  if (start > 0) { text = text.slice(start); }
  return text.trim() + '\n';
}

export function slugify(input: string): string {
  const slug = input
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'spec-local';
}

export function titleOf(markdown: string, fallback: string): string {
  return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() || fallback;
}

class UserCancelled extends Error {}

/**
 * Refuse BEFORE downloading gigabytes when the model cannot run here (no WebGPU for a model that is WebGPU-only
 * or too big for single-thread Wasm, not enough RAM), instead of failing after the download or grinding for hours.
 */
export function capabilityProblem(m: ManifestSummary, probe: Pick<ProbeResult, 'webgpu' | 'gpuReason'>, totalMem: number = os.totalmem()): string | undefined {
  if (!probe.webgpu && gpuRequired(m)) {
    const why = probe.gpuReason ? ` Motivo: ${probe.gpuReason}` : '';
    return `El modelo "${m.label}" (${formatBytes(m.totalBytes)}) necesita WebGPU y VS Code no lo expone ahora mismo.${why} En CPU seria inutilizable de lento; mientras tanto usa otro modelo o un proveedor como Ollama.`;
  }
  if (m.minRamBytes && totalMem < m.minRamBytes) {
    return `El modelo "${m.label}" necesita al menos ${formatBytes(m.minRamBytes)} de RAM y este equipo tiene ${formatBytes(totalMem)}.`;
  }
  return undefined;
}

/** Shown when VS Code exposes no WebGPU adapter: the engine then runs on the CPU (Wasm, one thread in a Webview). */
export const CPU_NOTICE = 'Sin WebGPU en este VS Code: se ejecutara en la CPU (Wasm, 1 hilo). Funciona, pero puede tardar varios minutos; veras el avance token a token.';

async function confirmDownload(m: ManifestSummary, webgpu: boolean): Promise<void> {
  const lines = [
    `Modelo: ${m.label}${m.license ? ` · licencia ${m.license}` : ''}`,
    `Descarga: ${formatBytes(m.totalBytes)} (una sola vez; queda en la cache local del Webview).`,
    'La integridad se verifica con un manifiesto firmado antes de usar cualquier archivo.',
    'Tu texto nunca se envia a la CDN: la inferencia ocurre en tu equipo.',
  ];
  if (!webgpu) { lines.push(CPU_NOTICE); }
  if (m.source === 'offline-copy') { lines.push('Aviso: no se pudo contactar la CDN; se usa la ultima copia verificada del manifiesto.'); }
  const pick = await vscode.window.showInformationMessage(
    'Alpaquitay: el motor local necesita descargar el modelo.',
    { modal: true, detail: lines.join('\n') },
    'Descargar y generar',
  );
  if (pick !== 'Descargar y generar') { throw new UserCancelled(); }
}

/** Creates the file with O_EXCL ("wx"): an existing spec is never overwritten, even under a race. */
async function writeNewFile(dir: string, slug: string, content: string): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const file = path.join(dir, i === 0 ? `${slug}.md` : `${slug}-${i + 1}.md`);
    try { await fs.writeFile(file, content, { encoding: 'utf-8', flag: 'wx' }); return file; }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== 'EEXIST') { throw err; } }
  }
  const fallback = path.join(dir, `${slug}-${Date.now()}.md`);
  await fs.writeFile(fallback, content, { encoding: 'utf-8', flag: 'wx' });
  return fallback;
}

export function registerLocalEngineCommands(
  context: vscode.ExtensionContext,
  engine: LocalEngineApi,
  getSettings: () => LocalEngineSettings,
  workspaceRoot: string,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(GENERATE_SPEC_LOCAL, async () => {
      const editor = vscode.window.activeTextEditor;
      const selected = editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '';
      const description = selected.trim() || (await vscode.window.showInputBox({
        prompt: 'Describe el proyecto o la funcionalidad que quieres especificar (se procesa en tu equipo)',
        placeHolder: 'Ej.: portal de reservas para un club de padel con pagos y recordatorios',
        ignoreFocusOut: true,
      }))?.trim();
      if (!description) { return; }

      if (!isUsableRoot(workspaceRoot)) {
        vscode.window.showErrorMessage('Alpaquitay: abre una carpeta de trabajo escribible antes de generar la especificacion.');
        return;
      }

      const settings = getSettings();
      try {
        assertPromptSize(buildSpecMessages(description));
        const { text, device } = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'Alpaquitay (local)', cancellable: true },
          async (progress, token) => {
            progress.report({ message: 'Preparando motor local…' });
            const probe = await engine.probe(settings);
            const problem = capabilityProblem(probe.manifest, probe);
            if (problem) { throw new Error(problem); }
            if (!probe.cached) { await confirmDownload(probe.manifest, probe.webgpu); }
            let last = 0;
            return engine.generate(
              settings,
              { messages: buildSpecMessages(description), temperature: 0.3 },
              (stage, pct) => { progress.report({ message: stage, increment: Math.max(0, pct - last) }); last = Math.max(last, pct); },
              token,
            );
          },
        );

        const markdown = extractSpecMarkdown(text);
        if (!/^- \[ \] /m.test(markdown)) {
          vscode.window.showWarningMessage('Alpaquitay: el modelo local no devolvio tareas en formato spec.md; revisa y edita el borrador.');
        }
        const specsDir = path.join(workspaceRoot, 'specs');
        const slug = slugify(titleOf(markdown, description));
        let filePath = '';
        try {
          await fs.mkdir(specsDir, { recursive: true });
          filePath = await writeNewFile(specsDir, slug, markdown);
        } catch (err) {
          vscode.window.showErrorMessage(`Alpaquitay: no se pudo guardar la especificacion — ${friendlyFsError(err, filePath || specsDir)}`);
          return;
        }
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(filePath));
        vscode.window.showInformationMessage(
          `Alpaquitay: especificacion generada localmente (${device === 'webgpu' ? 'GPU' : 'CPU/Wasm'}) en specs/${path.basename(filePath)}.`);
      } catch (err) {
        if (err instanceof UserCancelled) { return; }
        vscode.window.showErrorMessage(`Alpaquitay: no se pudo generar la especificacion local — ${(err as Error).message}`);
      }
    }),

    vscode.commands.registerCommand(CLEAR_LOCAL_CACHE, async () => {
      try {
        const r = await engine.clearCache(getSettings());
        vscode.window.showInformationMessage(`Alpaquitay: cache del modelo local vaciada (${r.files} archivos, ${formatBytes(r.bytes)}).`);
      } catch (err) {
        vscode.window.showErrorMessage(`Alpaquitay: no se pudo vaciar la cache local — ${(err as Error).message}`);
      }
    }),
  );
}
