// Cap.05 El arnes + Cap.09 Invariantes + Cap.17 Seguridad.
// Uncle Bob: "Functions should do one thing." PolicyGuard solo dice allow|confirm|deny.
export type Verdict = 'allow' | 'confirm' | 'deny';
const DENY_RE = /(\.env$|\.env\.|id_rsa|id_ed25519|\.pem$|\.key$|secrets?\/|credentials?\.|token)/i;
const CONFIRM_RE = /(delete_file|write_file|create_directory|\.alpaquitay\/fingerprint)/;
export function guardWrite(relPath: string): { verdict: Verdict; reason: string } {
  if (!relPath) { return { verdict: 'deny', reason: 'ruta vacía' }; }
  if (DENY_RE.test(relPath)) { return { verdict: 'deny', reason: `protegido: ${relPath} (secretos)` }; }
  if (relPath === 'spec.md' || relPath.endsWith('/spec.md')) { return { verdict: 'confirm', reason: 'spec.md requiere confirmación + backup' }; }
  return { verdict: 'confirm', reason: 'toda escritura pide confirmación (harness)' };
}
export function guardTool(server: string, tool: string): { verdict: Verdict; reason: string } {
  if (CONFIRM_RE.test(tool)) { return { verdict: 'confirm', reason: `${server}.${tool} muta disco` }; }
  return { verdict: 'allow', reason: 'lectura' };
}
