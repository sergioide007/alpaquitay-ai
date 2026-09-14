import { MCPExecutor } from '../interfaces';
// Cap.14 Codigo Sintetico: el conocimiento desordenado se captura antes de estructurarse.
// Fowler: el inbox es Strangler del caos — no exige spec para pensar.
export interface Idea { id: string; raw: string; createdAt: string; structured?: { objetivo?: string; alcance?: string[]; noAlcance?: string[]; preguntas?: string[] }; promoted?: boolean; }
const FILE = '.alpaquitay/ideas.json';
export class IdeaInbox {
  constructor(private readonly mcp: MCPExecutor) {}
  async add(raw: string): Promise<Idea> {
    const ideas = await this.list();
    const idea: Idea = { id: `IDEA-${String(ideas.length + 1).padStart(3, '0')}`, raw: raw.slice(0, 2000), createdAt: new Date().toISOString(), structured: this.structure(raw) };
    ideas.push(idea);
    try { await this.mcp.executeTool('filesystem', 'write_file', { path: FILE, content: JSON.stringify(ideas, null, 2) }); } catch { /* best-effort */ }
    return idea;
  }
  async list(): Promise<Idea[]> {
    try {
      const f = await this.mcp.executeTool('filesystem', 'read_file', { path: FILE }) as { content: string };
      const p = JSON.parse(f.content) as Idea[];
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  // Estructura deterministica sin LLM: objetivo + bullets + preguntas. El LLM pule, no inventa.
  structure(raw: string): Idea['structured'] {
    const sents = raw.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
    const objetivo = sents[0]?.slice(0, 280);
    const alcance = sents.slice(1, 4);
    const noAlcance: string[] = /sin|no |excluye/i.test(raw) ? ['(detectado en tu texto: hay exclusiones — confírmalas antes de promover)'] : [];
    const preguntas = ['¿Cuál es el resultado mínimo que darías por bueno?', '¿Qué queda FUERA en esta primera versión?', '¿En qué carpeta/stack debe vivir?'];
    return { objetivo, alcance, noAlcance, preguntas };
  }
  toMarkdown(idea: Idea): string {
    const s = idea.structured ?? {};
    return [`**${idea.id} — borrador ordenado**`, '', `**Objetivo:** ${s.objetivo ?? idea.raw.slice(0, 200)}`, '', '**Alcance probable:**', ...((s.alcance ?? []).map(a => `- ${a}`)), '', '**No-alcance:**', ...((s.noAlcance ?? []).map(a => `- ${a}`)), '', '**Preguntas para cerrar:**', ...((s.preguntas ?? []).map(q => `- ${q}`)), '', '_Responde `promover` para pasarlo a spec.md como epica, o sigue editando la idea._'].join('\n');
  }
}
