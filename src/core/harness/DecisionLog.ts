import { MCPExecutor } from '../interfaces';
import { Decision } from '../reception/Decider';
const FILE = '.alpaquitay/decisions.jsonl';
export interface DecisionEntry {
  ts: string; input: string; route: string; lane: string;
  confidence: number; reasons: string[];
  stack?: string; sources?: string;
  policy?: string; checkpoint?: string;
}
export async function logDecision(mcp: MCPExecutor, input: string, d: Decision, extra?: { stack?: string; sources?: string; policy?: string; checkpoint?: string }): Promise<void> {
  const entry: DecisionEntry = { ts: new Date().toISOString(), input: input.slice(0, 300), route: d.route, lane: d.lane, confidence: d.confidence, reasons: d.reasons, ...extra };
  try {
    let prev = '';
    try { const f = await mcp.executeTool('filesystem', 'read_file', { path: FILE }) as { content: string }; prev = f.content; } catch { /* nuevo */ }
    const line = JSON.stringify(entry);
    await mcp.executeTool('filesystem', 'write_file', { path: FILE, content: (prev ? prev.replace(/\s+$/, '') + '\n' : '') + line + '\n' });
  } catch { /* traza best-effort, nunca bloquea */ }
}

