import { AIProvider, ChatOptions } from '../core/interfaces';

// ── Small model detection ─────────────────────────────────────────────────────
// Models with < ~4B parameters have limited instruction-following ability and
// tend to emit verbose, redundant comments that narrate every line.  We detect
// them by name patterns so we can apply stricter prompts and post-processing.

const SMALL_MODEL_PATTERNS = [
  /\b1[._]?3\s*b\b/i,   // 1.3b, 1_3b
  /\b1[._]?5\s*b\b/i,   // 1.5b
  /\b1\s*b\b/i,          // 1b
  /\b3\s*b\b/i,          // 3b
  /[:_-]mini\b/i,        // phi3:mini, phi-mini
  /\btiny\b/i,
  /\bnano\b/i,
  /\bphi[-_]?2\b/i,      // phi-2, phi2
  /\bphi[-_]?1\b/i,
  /\bsmollm\b/i,
  /\bgemma[-_]?2b\b/i,
  /\bqwen.*1[._]?5b/i,
];

export function isSmallModel(modelName: string): boolean {
  return SMALL_MODEL_PATTERNS.some(re => re.test(modelName));
}

// ── Verbose comment stripping (for small models) ──────────────────────────────
// Small models write comments that narrate what the next line of code does.
// These patterns match "what" comments, not "why" comments.

const TRIVIAL_COMMENT_LINE = [
  // Control flow narration
  /^\s*(\/\/|#)\s*(loop|iterate|iterating|for each|foreach)\b/i,
  /^\s*(\/\/|#)\s*(initialize|initialise|init(ializing)?)\b/i,
  /^\s*(\/\/|#)\s*(check|checking)\s+(if|whether|for|the)\b/i,
  /^\s*(\/\/|#)\s*(set|setting)\s+(the|a|an|this)\s+\w/i,
  /^\s*(\/\/|#)\s*(get|getting|retrieve|retrieving)\s+(the|a|an|this)\s+\w/i,
  /^\s*(\/\/|#)\s*(return|returning)\s+(the|a|an|this)\s+\w/i,
  /^\s*(\/\/|#)\s*(create|creating)\s+(a|an|new|the)\s+\w/i,
  /^\s*(\/\/|#)\s*(add|adding|append|appending)\s+(the|a|an|to)\s+\w/i,
  /^\s*(\/\/|#)\s*(define|defining)\s+(a|an|the)\s+(class|function|method|interface|type)\b/i,
  /^\s*(\/\/|#)\s*(increment|decrement|increase|decrease)\s+(the|a|counter|index)\b/i,
  /^\s*(\/\/|#)\s*(call|calling|invoke|invoking)\s+(the|a|an)\s+\w/i,
  /^\s*(\/\/|#)\s*(import|importing)\s+(the|a|an|required|needed)\b/i,
  /^\s*(\/\/|#)\s*(export|exporting)\s+(the|a|an|default)\b/i,
  /^\s*(\/\/|#)\s*(declare|declaring|define|defining)\s+(a|an|the)\b/i,
  /^\s*(\/\/|#)\s*(assign|assigning)\s+(the|a|an|value|result)\b/i,
  // Obvious section headers from small models
  /^\s*(\/\/|#)\s*(main\s+function|entry\s+point|constructor|helper|utility)\s*$/i,
  /^\s*(\/\/|#)\s*(start|begin|end)\s+(of|the)\s+(class|module|function|file)\b/i,
  /^\s*(\/\/|#)\s*[-=*]{4,}\s*$/,
  // "This function/method does X" type comments
  /^\s*(\/\/|#)\s*this\s+(function|method|class|component)\s+(does|returns|handles|creates|takes|accepts)\b/i,
  /^\s*(\/\/|#)\s*(function|method)\s+to\s+\w/i,
  // Assumption / disclaimer comments — never add code value
  /^\s*(\/\/|#)\s*[Aa]ssuming\s+(that|this|the)\b/i,
  /^\s*(\/\/|#)\s*(assumed\s+here|assuming\s+here)\b/i,
  /^\s*(\/\/|#)\s*this\s+could\s+be\s+(expanded|extended|modified|improved|changed)\b/i,
  /^\s*(\/\/|#)\s*in\s+real\s+(world|life|application|scenario|project)\b/i,
  /^\s*(\/\/|#)\s*the\s+actual\s+(implementation|url|endpoint|code|value|logic)\b/i,
  /^\s*(\/\/|#)\s*(optional\s+field|this\s+field\s+is\s+optional)\b/i,
  /^\s*(\/\/|#)\s*if\s+it['']?s\s+not\s+(provided|available|specified|given)\b/i,
  /^\s*(\/\/|#)\s*this\s+is\s+(just|only|a\s+simple|a\s+basic)\b/i,
  /^\s*(\/\/|#)\s*(you\s+may|you\s+will|you\s+should|you\s+can)\s+(need|want|add|implement|replace)\b/i,
  /^\s*(\/\/|#)\s*[Dd]ecorator\s+that\s+marks\b/i,
  /^\s*(\/\/|#)\s*[Aa]ngular\s+will\s+(inject|create|use|call)\b/i,
  /^\s*(\/\/|#)\s*(this\s+)?(could\s+change|may\s+change|might\s+change|depending\s+upon)\b/i,
];

export function stripVerboseComments(code: string, language = ''): string {
  const isJavaPy = /^(java|kotlin|python|go|c#|csharp|rust|swift|cpp|c\+\+)$/i.test(language.trim());

  const lines = code.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    const prevIsBlank = result.length > 0 && result[result.length - 1].trim() === '';

    if (TRIVIAL_COMMENT_LINE.some(re => re.test(trimmed))) {
      const commentOnlyLine = /^(\/\/|#)/.test(trimmed);
      if (commentOnlyLine) {
        // Pure comment line — remove it entirely
        if (!prevIsBlank) { result.push(''); }
        continue;
      }

      // Code + inline verbose comment — strip just the comment, keep the code
      const inlineIdx = line.indexOf('//');
      if (inlineIdx > 0) {
        const commentText = line.slice(inlineIdx);
        // Preserve a trailing closing brace that the model put inside the comment text
        const trailingBrace = /\}\s*$/.test(commentText.trimEnd()) ? ' }' : '';
        result.push(line.slice(0, inlineIdx).trimEnd() + trailingBrace);
        continue;
      }
    }

    // For Java/compiled langs: strip obvious end-of-block comments like // end class
    if (isJavaPy && /^\s*(\/\/|#)\s*(end\s+(of\s+)?(class|interface|method|function|block)|close\s+(bracket|brace))\b/i.test(trimmed)) {
      continue;
    }

    result.push(line);
  }

  // Collapse multiple blank lines left by stripping into a single blank
  return result
    .reduce<string[]>((acc, ln) => {
      if (ln.trim() === '' && acc.length > 0 && acc[acc.length - 1].trim() === '') { return acc; }
      return [...acc, ln];
    }, [])
    .join('\n');
}

// ── Fence stripping ───────────────────────────────────────────────────────────

export function stripFences(raw: string): string {
  return raw.replace(/^```[\w]*\r?\n?/, '').replace(/\r?\n?```[\w]*$/g, '').trim();
}

// ── Meta-line detection ───────────────────────────────────────────────────────
// Lines the model writes ABOUT the file instead of writing the file itself.

const META_PREFIXES = [
  /^File\s*:/i,
  /^Task\s*:/i,
  /^Tâche\s*:/i,
  /^Tache\s*:/i,
  /^Context\s*:/i,
  /^Spec\s+[Cc]ontext\s*:/i,
  /^Task\s+[Cc]ontext\s*:/i,
  /^Language\s*:/i,
  /^Expected\s*(functional\s*content)?\s*:/i,
  /^Here\s+is\b/i,
  /^Here'?s\b/i,
  /^The following\b/i,
  /^Below\s+is\b/i,
  /^Output\s*:/i,
  /^Generate\s*:/i,
  /^(This file|This is the main entry|This will serve)/i,
  /^##\s+GENERATE FILE/i,
  /^##\s+FILES ALREADY/i,
  /^##\s+NOW GENERATE/i,
  /^This class represents/i,
  /^This represents/i,
  /^CORRECT\s*[-–—]/i,
  /^WINNER\s+IS/i,
  /^CONGRATULAT/i,
  // Conversational preambles models write before the first line of code
  /^Sure[,!]?\s+/i,
  /^Of\s+course[,!]?\s*/i,
  /^Certainly[,!]?\s*/i,
  /^Absolutely[,!]?\s*/i,
  /^I['']?ll\s+(create|generate|write|provide|show|implement)\b/i,
  /^Let\s+me\s+(create|write|show|explain|provide|implement)\b/i,
  /^I\s+(will|can|have)\s+(create|generate|write|provide|show)\b/i,
  /^(A\s+)?[Ss]imple\s+example\s+of\b/i,
  /^[Ee]xample\s+of\s+(how|a|an)\b/i,
  /^[Aa]s\s+(requested|asked|per)\b/i,
];

function isMetaLine(line: string): boolean {
  const t = line.trim();
  if (META_PREFIXES.some(re => re.test(t))) { return true; }
  // Lines that are only emoji/status markers (no real code)
  if (/^[\s✅❌🔄🎉🚀⭐💡🛑🔥👉👈⚡🏆🎯]+$/u.test(t)) { return true; }
  return false;
}

// ── Prompt-artifact cleaning ──────────────────────────────────────────────────
// The model sometimes echoes fragments of the system prompt into comments or
// directly into code lines (e.g. "✅ CORRECT - start directly with code:").

const COMMENT_ARTIFACT_PHRASES = [
  /CORRECT\s*[-–—]\s*start\s+directly/i,
  /REQUIRED\s+FOR\s+ENTITY\s+IDENTIFICATION/i,
  /WINNER\s+IS\s+YOUR/i,
  /CONGRATULAT/i,
  /FUNCTIONAL\s+CODE\s+OF\s+THIS\s+PROJECT/i,
  /NOW\s+WE\s+HAVE\s+A\s+FUNCTIONAL/i,
  /SPRING[-\s]BOOT\s+APPLICATION/i,
  /END\s+OF\s+\w+\s+CLASS\s+DEFINITION/i,
  /REQUIRED\s+FOR\s+ENTITY/i,
];

// Unicode emoji block pattern (covers most emoji ranges)
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}✅❌🔄]/u;

export function cleanLineArtifacts(line: string): string {
  const commentIdx = line.indexOf('//');
  if (commentIdx < 0) {
    // No inline comment — strip trailing emoji/artifact text from the code
    return line.replace(/\s+[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✅❌🔄].*$/u, '').trimEnd();
  }

  const codePart = line.slice(0, commentIdx);
  let commentPart = line.slice(commentIdx);

  // Strip trailing artifact emojis from the code portion.
  // Only trimEnd if an artifact was actually removed so spacing before `//` is preserved.
  const codeAfterClean = codePart.replace(/\s+[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✅❌🔄].*$/u, '');
  const cleanCode = codeAfterClean !== codePart ? codeAfterClean.trimEnd() : codePart;

  // Truncate comment at the first artifact phrase
  for (const pattern of COMMENT_ARTIFACT_PHRASES) {
    const match = commentPart.search(pattern);
    if (match !== -1) {
      commentPart = commentPart.slice(0, match).trimEnd();
      break;
    }
  }

  // Remove emojis from the comment if any remain
  if (EMOJI_RE.test(commentPart)) {
    commentPart = commentPart.replace(/\s*[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✅❌🔄][^\n]*/gu, '').trimEnd();
  }

  // Drop bare `//` with nothing meaningful after it; trim trailing space on the code part
  if (commentPart.trim() === '//') { return cleanCode.trimEnd(); }
  return cleanCode + commentPart;
}

// ── Brace rescue from verbose inline comments ─────────────────────────────────
// The model writes: `code;  // long explanation }` where the `}` at the end of the
// comment was meant to close the enclosing block.  We detect this by checking brace
// balance in the code portion: if it has unclosed `{`, rescue the needed `}` braces.
// If code is already balanced, the trailing `}` was spurious and is dropped.
// Only runs on comments longer than 30 chars (short comments like `} // ok` are safe).

function fixTrailingBraceInComment(line: string): string {
  const commentIdx = line.indexOf('//');
  if (commentIdx <= 0) { return line; }

  const codePart = line.slice(0, commentIdx).trimEnd();
  const commentText = line.slice(commentIdx);

  const commentBody = commentText.slice(2).trim();
  const isVerbose = commentBody.length >= 30 ||
    TRIVIAL_COMMENT_LINE.some(re => re.test(commentText.trim()));
  if (!isVerbose) { return line; }

  const trailingBraceMatch = commentText.trimEnd().match(/(\}+)\s*$/);
  const openCount = (codePart.match(/\{/g) ?? []).length;
  const closeCount = (codePart.match(/\}/g) ?? []).length;
  const deficit = openCount - closeCount;

  if (trailingBraceMatch && deficit > 0) {
    const rescued = '}'.repeat(Math.min(trailingBraceMatch[1].length, deficit));
    return `${codePart} ${rescued}`;
  }

  // Balanced or no trailing brace — strip the verbose comment entirely
  return codePart;
}

// ── Bare English prose detection ──────────────────────────────────────────────
// Small models embed explanation sentences directly into code files (not in comments).
// These patterns match lines that are clearly English prose, not source code.

const PROSE_LINE_RE = [
  /^Please\s+(note|see|remember|ensure)\b/i,
  /^Note\s+that\b/i,
  /^This\s+(code|class|file|function|method|component|service|implementation|script|module)\s+/i,
  /^You\s+(may|will|can|should)\s+(need|want|have|add|implement|replace|also|put)\b/i,
  /^\(you\s+(may|will|can|should)\b/i,
  /^\(this is just\b/i,
  /^This is just\b/i,
  /^This is (your|an example|a simple|a basic|only)\b/i,
  /^This will\s+(serve|call|handle|create|validate|check)\b/i,
  /^Replace (the |this )?(placeholder|import|method|function|class|with)\b/i,
  /^Make sure (to|that)\b/i,
  /^Remember (to|that)\b/i,
  /^It should be placed\b/i,
  /^The above\b/i,
  /^Assuming\s+(the|this|a|an)\b/i,
  /^Also,?\s+(you|make|ensure|remember|note)\b/i,
  /^Additionally,?\s+/i,
  /^In this (file|case|example|service|class|module)\b/i,
  /^As (you|mentioned|specified|per|noted)\b/i,
  /^For (example|instance|more|your)\b/i,
  /^Due to (the|space|context|complexity|time)\b/i,
];

function isBareProseLine(line: string): boolean {
  const t = line.trim();
  if (!t) { return false; }
  // Lines starting with comment markers or code-leading characters are code
  if (/^[/*#<[{@$`"']/.test(t)) { return false; }
  // Lines with any code syntax tokens are code
  if (/[:;={}[\]=><!+\-*/&|^~]/.test(t)) { return false; }
  return PROSE_LINE_RE.some(re => re.test(t));
}

function stripEmbeddedProse(code: string): string {
  return code.split('\n').filter(l => !isBareProseLine(l)).join('\n');
}

// ── JSX tag stripping from non-JSX TypeScript/JavaScript files ────────────────
// Small models sometimes append React JSX closing tags (</Component>) after
// Express middleware or service code, producing a syntax error.

function stripJsxFromNonJsx(code: string, filePath: string): string {
  if (/\.(tsx|jsx)$/.test(filePath)) { return code; }
  // On each line, remove JSX closing tags and any trailing prose after them.
  // Handles patterns like: `} };     }}>}</ReactComponent>  Prose text here`
  return code.split('\n').map(l =>
    l.replace(/\s*}?>?}<\/[A-Z][A-Za-z0-9]+>.*$/g, '')
     .replace(/\s*<\/[A-Z][A-Za-z0-9]+>.*$/g, '')
  ).join('\n');
}

// ── Trailing footer removal for compiled languages ────────────────────────────
// The model sometimes appends prose or status text after the last closing brace.
// TypeScript and JavaScript are included because Express services/controllers
// follow the same compiled-file structure (single top-level closing brace).

const COMPILED_LANG_RE = /^(java|kotlin|c#|csharp|go|c\+\+|rust|swift|typescript|ts|javascript|js)$/i;

export function stripTrailingFooter(code: string, language: string): string {
  if (!COMPILED_LANG_RE.test(language.trim())) { return code; }

  const lines = code.split('\n');
  // Walk backward to find the last line that is only a closing brace
  let lastBrace = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*\}\s*$/.test(lines[i])) { lastBrace = i; break; }
  }

  if (lastBrace < 0 || lastBrace === lines.length - 1) { return code; }

  const trailing = lines.slice(lastBrace + 1).join('\n').trim();
  if (trailing.length === 0) { return code; }

  return lines.slice(0, lastBrace + 1).join('\n');
}

// ── Repetition loop detection & truncation ────────────────────────────────────
// If the same line (or block) appears 3+ times consecutively, keep only the first.

function deduplicateRepetitions(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    // 1. Block repetition: a block of 2–5 lines repeated 3+ times consecutively.
    //    Catches patterns like "Spec Context: ...\nTache: ...\n" looping forever.
    let foundBlock = false;
    for (let sz = 2; sz <= 5 && !foundBlock; sz++) {
      if (i + sz * 3 > lines.length) { continue; }
      const block = lines.slice(i, i + sz);
      let reps = 1;
      let pos = i + sz;
      while (pos + sz <= lines.length && lines.slice(pos, pos + sz).every((l, k) => l === block[k])) {
        reps++;
        pos += sz;
      }
      if (reps >= 3) {
        result.push(...block);
        i = pos;
        foundBlock = true;
      }
    }
    if (foundBlock) { continue; }

    // 2. Single-line repetition: same line 3+ times in a row.
    result.push(lines[i]);
    let j = i + 1;
    while (j < lines.length && lines[j] === lines[i]) { j++; }
    if (j - i >= 3) {
      i = j;
    } else {
      i++;
    }
  }
  return result.join('\n');
}

// ── Degenerate output detection ───────────────────────────────────────────────

const SURVEY_PATTERNS = [
  /what problem is/i,
  /identify key features/i,
  /key and secondary features/i,
  /thesis (submission|defense)/i,
  /respond to a survey/i,
];

export function isDegenerate(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.length < 10) { return true; }

  // Contains obvious survey / meta text near the top
  const top = trimmed.slice(0, 600);
  if (SURVEY_PATTERNS.some(re => re.test(top))) { return true; }

  const lines = trimmed.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) { return true; }

  // Standalone ellipsis (...) — small model placeholder stub, always invalid code
  if (lines.some(l => /^\s*\.{3}\s*;?\s*$/.test(l))) { return true; }

  // Count comment + prose lines vs actual code lines
  const commentCount = lines.filter(l => {
    const t = l.trim();
    return (
      t.startsWith('//') ||
      t.startsWith('#') ||
      t.startsWith('*') ||
      t.startsWith('<!--') ||
      isMetaLine(l) ||
      isBareProseLine(l)
    );
  }).length;

  // >75% comment/prose → degenerate (was 80%, lowered to catch mixed files)
  if (commentCount / lines.length > 0.75) { return true; }

  // Unclosed fence still present (model stopped mid-generation)
  const fenceCount = (trimmed.match(/^```/gm) ?? []).length;
  if (fenceCount % 2 !== 0 && fenceCount > 1) { return true; }

  return false;
}

// ── Spec task deduplication ───────────────────────────────────────────────────
// Removes duplicate checkbox tasks from a spec.md. A task is a duplicate when
// its title (case-insensitive, trimmed) has already appeared in the document.
// Sub-bullets belonging to a duplicate task are also dropped.

export function deduplicateSpecTasks(spec: string): string {
  const lines = spec.split('\n');
  const result: string[] = [];
  const seenTasks = new Set<string>();
  let skipSubBullets = false;
  let taskIndent = 0;

  for (const line of lines) {
    const taskMatch = line.match(/^(\s*)[-*]\s+\[[ x]\]\s*(.+)/i);

    if (taskMatch) {
      const taskTitle = taskMatch[2].trim().toLowerCase();
      taskIndent = taskMatch[1].length;

      if (seenTasks.has(taskTitle)) {
        skipSubBullets = true;
        continue;
      }
      seenTasks.add(taskTitle);
      skipSubBullets = false;
      result.push(line);
      continue;
    }

    if (skipSubBullets) {
      const lineIndent = (line.match(/^(\s*)/) ?? ['', ''])[1].length;
      const isEmpty = line.trim() === '';
      if (isEmpty || lineIndent > taskIndent) {
        continue;
      }
      skipSubBullets = false;
    }

    result.push(line);
  }

  return result.join('\n');
}

// ── Main sanitizer ────────────────────────────────────────────────────────────

export interface SanitizeResult {
  code: string;
  degenerate: boolean;
}

export function sanitizeCode(raw: string, language = '', _modelName = '', filePath = ''): SanitizeResult {
  // 1. Strip all markdown fences
  let code = stripFences(raw);

  // 2. Remove any dangling fences that were inside the content
  code = code.replace(/^```[\w]*\r?\n?/gm, '').replace(/\r?\n?```[\w]*$/gm, '');

  // 3. Remove meta-header lines the model added despite instructions
  code = code.split('\n').filter(l => !isMetaLine(l)).join('\n');

  // 4. Clean prompt artifacts from individual lines (echoed markers, emoji comments)
  code = code.split('\n').map(cleanLineArtifacts).join('\n');

  // 4.5. Rescue closing braces trapped inside verbose inline comments.
  //      Fixes: `code; // long explanation }` → `code; }` when code has unclosed {
  code = code.split('\n').map(fixTrailingBraceInComment).join('\n');

  // 5. Remove trailing prose/status footer after the last closing brace
  code = stripTrailingFooter(code, language);

  // 6. Strip bare English prose sentences embedded directly in code (not in comments).
  //    Small models (1–3B) explain what they wrote instead of writing only code.
  code = stripEmbeddedProse(code);

  // 7. Strip JSX closing tags from non-JSX TypeScript/JavaScript files.
  //    Small models sometimes append React component syntax to Express middleware.
  if (filePath) { code = stripJsxFromNonJsx(code, filePath); }

  // 8. Truncate repetition loops
  code = deduplicateRepetitions(code);

  // 9. Strip trivially obvious "what" comments regardless of model size —
  //    BASE_RULES already prohibits them; post-processing enforces it universally.
  code = stripVerboseComments(code, language);

  code = code.trim();

  return { code, degenerate: isDegenerate(code) };
}

// ── Generation with retry ─────────────────────────────────────────────────────

const RETRY_PROMPT = (filePath: string, description: string, language: string) =>
  `Write the complete source code for \`${filePath}\`.\n` +
  `Language: ${language}\n` +
  `Purpose: ${description}\n\n` +
  `START IMMEDIATELY WITH THE FIRST LINE OF CODE. NO TEXT BEFORE OR AFTER. NO FENCES.`;

export async function generateCode(
  ai: AIProvider,
  primaryPrompt: string,
  filePath: string,
  description: string,
  language: string,
  options: ChatOptions = {},
  modelName = ''
): Promise<string> {
  // Use lower temperature for small models — they are more stable with near-zero randomness
  const baseTemp = modelName && isSmallModel(modelName) ? 0.05 : 0.15;
  const defaultOpts: ChatOptions = { maxTokens: 2048, temperature: baseTemp, ...options };

  const firstRaw = await ai.complete(primaryPrompt, defaultOpts);
  const first = sanitizeCode(firstRaw, language, modelName, filePath);
  if (!first.degenerate) { return first.code; }

  const retryRaw = await ai.complete(
    RETRY_PROMPT(filePath, description, language),
    { ...defaultOpts, temperature: 0.05 }
  );
  const retry = sanitizeCode(retryRaw, language, modelName, filePath);
  return retry.code;
}

// ── Spec content normalizer ───────────────────────────────────────────────────
// Converts AI-generated spec content in non-standard formats (numbered lists,
// plain bullets, h1 headings, bold task titles) into the canonical
// `- [ ] task` checkbox format that _parse() expects.

function _cleanTaskTitle(raw: string): string {
  let title = raw
    .replace(/\*\*/g, '')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/\(\*?\[.*?\]\(.*?\)\*?\)/g, '')   // (*[text](url)*)
    .replace(/\([^)]*https?:\/\/[^)]*\)/g, '')   // (url)
    .replace(/^Task(?:\s+Name(?:\s+and\s+Description)?)?\s*:\s*/i, '')
    .replace(/\([^)]+\)\s*$/, '')
    .replace(/[.!?;]\s*$/, '')
    .trim();

  // Keep only the first sentence when description runs long
  const sentEnd = title.search(/[.!?]\s+[A-Z]/);
  if (sentEnd > 10 && sentEnd < 100) { title = title.slice(0, sentEnd); }
  if (title.length > 120) { title = title.slice(0, 117) + '...'; }

  return title.trim();
}

export function normalizeSpecContent(content: string): string {
  // Strip code-fence wrappers
  const text = content
    .replace(/^```(?:markdown|md)?\s*\n/m, '')
    .replace(/\n```\s*$/m, '')
    .trim();

  // Already well-formed? (3+ checkbox tasks with actual content)
  const existingTasks = (text.match(/^\s*[-*]\s+\[([ x])\]\s*.+/gim) ?? []);
  if (existingTasks.length >= 3) { return text; }

  const lines = text.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    // Already-correct checkbox format
    if (/^\s*[-*]\s+\[([ x])\]\s*.+/i.test(line)) {
      result.push(line);
      continue;
    }

    // ## heading — keep as-is
    if (/^##\s+/.test(line)) {
      result.push(line);
      continue;
    }

    // # heading → normalize to ##, strip trailing parenthetical tags
    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      const title = h1Match[1].replace(/\s*\(.*?\)\s*$/, '').trim();
      result.push(`## ${title}`);
      continue;
    }

    // Numbered list → checkbox task
    const numberedMatch = line.match(/^\d+\.\s+(.*)/);
    if (numberedMatch) {
      const title = _cleanTaskTitle(numberedMatch[1]);
      if (title) { result.push(`- [ ] ${title}`); }
      continue;
    }

    // Plain bullet without checkbox → checkbox task
    const bulletMatch = line.match(/^(\s*)[-*]\s+(?!\[[ x]\])(.+)/);
    if (bulletMatch) {
      const title = _cleanTaskTitle(bulletMatch[2]);
      if (title) { result.push(`${bulletMatch[1]}- [ ] ${title}`); }
      continue;
    }

    // Skip bold-only metadata lines (e.g. "**Epic Completion Status: [ ]**")
    if (/^\s*\*\*[^*\n]+\*\*\s*$/.test(line)) { continue; }

    // Skip italic-only description lines
    if (/^\s*\*[^*\n]+\*\s*$/.test(line)) { continue; }

    // Empty lines: keep (they separate sections)
    if (!line.trim()) { result.push(''); }
  }

  return result.join('\n').trim();
}
