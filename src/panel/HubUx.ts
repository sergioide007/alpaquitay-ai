/**
 * Hub UX layer: "what do I do next?" bar, one-click quick actions, command palette (Ctrl/Cmd+K),
 * tab icons + badges, keyboard shortcuts and a more legible, modern visual pass.
 *
 * Kept in its own module (same pattern as DocsTab) so MainPanel only injects a few strings.
 * No backticks or template placeholders below: this text is interpolated verbatim into the
 * webview script / stylesheet. Everything here is additive: it only reads the existing webview
 * state (S, workingTasks) and sends the message types the extension already handles.
 */

/** Pure decision logic. Exported separately so it can be unit-tested outside a browser. */
export const HUX_NEXT_JS = String.raw`
function huxNextStep(S, working) {
  var h = S.harness || {};
  var pending = Array.isArray(h.pending) ? h.pending : [];
  var debt = h.debt || { score: 0, ceiling: 100 };
  var score = Number(debt.score) || 0;
  var ceiling = Math.max(1, Number(debt.ceiling) || 100);
  var spec = S.spec;
  if (!spec) {
    return { step: 0, id: 'loading', tone: 'idle', title: 'Loading your workspace\u2026', hint: '', cta: null, sec: null };
  }
  var tasks = (spec.exists && Array.isArray(spec.tasks)) ? spec.tasks : [];
  var open = tasks.filter(function (t) { return !t.done && t.status !== 'done'; });
  var workingIds = Array.from(working || []);
  if (workingIds.length) {
    var wt = tasks.filter(function (t) { return t.id === workingIds[0]; })[0];
    return {
      step: 1, id: 'building', tone: 'busy',
      title: 'AI is building ' + (wt ? wt.id + ': ' + wt.title : workingIds[0]),
      hint: 'Nothing is written to your files until you approve it.',
      cta: { label: 'Watch progress', act: 'tab:changes' }, sec: null
    };
  }
  if (pending.length) {
    var n = pending.length;
    return {
      step: 2, id: 'review', tone: 'warn',
      title: 'Review ' + n + ' pending change' + (n === 1 ? '' : 's'),
      hint: 'Check the diff, then apply it. Quality gates run after you apply.',
      cta: { label: 'Review changes', act: 'tab:changes' },
      sec: { label: 'Apply & run gates', act: 'apply', needsIdle: true }
    };
  }
  if (!tasks.length) {
    var found = Array.isArray(spec.candidates) && spec.candidates.length > 0;
    return {
      step: 0, id: 'spec', tone: 'go',
      title: spec.exists ? 'Your spec has no tasks yet' : 'Start with a spec',
      hint: found ? 'Use a spec found in this workspace, or let the AI write one.' : 'Describe what you want to build and the AI turns it into tasks.',
      cta: { label: 'Create spec with AI', act: 'regen' }, sec: null
    };
  }
  if (score >= ceiling) {
    return {
      step: 1, id: 'blocked', tone: 'warn',
      title: 'Build is blocked by technical debt',
      hint: 'Debt is ' + score + '/' + ceiling + '. Pay it down before starting new work.',
      cta: { label: 'See debt', act: 'tab:git' }, sec: null
    };
  }
  if (open.length) {
    var pick = open.filter(function (t) { return t.status === 'todo'; })[0]
      || open.filter(function (t) { return t.status === 'backlog'; })[0]
      || open[0];
    var left = open.length + ' of ' + tasks.length + ' tasks left';
    return {
      step: 1, id: 'build', tone: 'go', taskId: pick.id,
      title: 'Next task: ' + pick.title,
      hint: (pick.epicTitle ? pick.epicTitle + ' \u00b7 ' : '') + left,
      cta: { label: (pick.status === 'in-progress' ? 'Resume ' : 'Start ') + pick.id, act: 'start:' + pick.id, needsIdle: true },
      sec: null
    };
  }
  return {
    step: 3, id: 'verify', tone: 'go',
    title: 'All ' + tasks.length + ' tasks are done',
    hint: 'Validate the result against the spec, then commit.',
    cta: { label: 'Validate against spec', act: 'skill:validate-against-spec', needsIdle: true },
    sec: { label: 'View evidence', act: 'tab:git' }
  };
}
`;

export const HUX_FLOW_HTML = `
<section class="hux-flow" id="huxFlow" aria-label="Next step" data-tone="idle">
  <ol class="hux-steps" id="huxSteps" aria-label="Workflow">
    <li data-step="0"><span class="hux-dot">1</span>Spec</li>
    <li data-step="1"><span class="hux-dot">2</span>Build</li>
    <li data-step="2"><span class="hux-dot">3</span>Review</li>
    <li data-step="3"><span class="hux-dot">4</span>Verify</li>
  </ol>
  <div class="hux-next-text" aria-live="polite">
    <div class="hux-title" id="huxTitle">Loading your workspace&hellip;</div>
    <div class="hux-hint" id="huxHint"></div>
  </div>
  <div class="hux-next-actions">
    <button class="hux-sec" id="huxSec" type="button" hidden></button>
    <button class="hux-cta" id="huxCta" type="button" hidden></button>
    <button class="hux-cmd" id="huxPalBtn" type="button" title="All commands"><span>Commands</span><kbd id="huxPalKbd">Ctrl K</kbd></button>
  </div>
</section>`;

export const HUX_QUICK_HTML = `
<div class="hux-quick" id="huxQuick" role="toolbar" aria-label="Quick actions">
  <button class="hux-chip primary" type="button" data-hux-act="next" title="Start the next task from your spec">Build next task</button>
  <button class="hux-chip" type="button" data-hux-skill="validate-against-spec" title="Check the code against your spec">Validate</button>
  <button class="hux-chip" type="button" data-hux-skill="generate-tests" title="Write tests for the open file">Tests</button>
  <button class="hux-chip" type="button" data-hux-skill="refactor" title="Refactor the open file">Refactor</button>
  <button class="hux-chip warn" type="button" data-hux-act="apply" id="huxApplyChip" title="Approve pending changes and run quality gates" hidden>Apply changes</button>
  <button class="hux-chip ghost" type="button" data-hux-act="palette" title="Every command and agent">More&hellip;</button>
</div>`;

export const HUX_OVERLAY_HTML = `
<div class="hux-pal" id="huxPal" hidden>
  <div class="hux-pal-box" role="dialog" aria-modal="true" aria-label="Command palette">
    <input id="huxPalInput" type="text" placeholder="Type a command, tab or agent&hellip;" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="false" aria-controls="huxPalList">
    <ul class="hux-pal-list" id="huxPalList" role="listbox"></ul>
    <div class="hux-pal-foot"><span><kbd>&uarr;</kbd> <kbd>&darr;</kbd> move</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></div>
  </div>
</div>`;

export const HUX_CSS = String.raw`
:root{
  --radius:8px;--radius-sm:6px;
  --border:rgba(255,255,255,.09);--border-strong:rgba(255,255,255,.17);
  --ease:cubic-bezier(.2,.7,.2,1);
  --sans:var(--vscode-font-family,'Segoe UI',system-ui,sans-serif);
  --mono:var(--vscode-editor-font-family,Consolas,'Courier New',monospace);
}
:focus-visible{outline:2px solid rgba(0,229,160,.85);outline-offset:2px}
input:focus-visible,textarea:focus-visible,select:focus-visible{outline:none}
kbd{font:11px var(--mono);padding:1px 6px;border:1px solid var(--border-strong);border-bottom-width:2px;border-radius:4px;background:var(--bg2);color:var(--muted-lt)}
.hux-flow [hidden],.hux-quick [hidden],.hux-pal[hidden]{display:none!important}

/* Next-step bar */
.hux-flow{flex-shrink:0;display:flex;align-items:center;gap:20px;padding:8px 16px;min-height:54px;background:var(--bg1);border-bottom:1px solid var(--border)}
.hux-steps{display:flex;align-items:center;list-style:none;flex-shrink:0}
.hux-steps li{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);white-space:nowrap}
.hux-steps li+li::before{content:"";width:16px;height:1px;background:var(--bg4);margin:0 9px}
.hux-dot{width:18px;height:18px;border-radius:50%;border:1.5px solid var(--bg4);display:grid;place-items:center;font:600 10px/1 var(--mono)}
.hux-steps li.done{color:var(--muted-lt)}
.hux-steps li.done .hux-dot{background:var(--signal);border-color:var(--signal);color:var(--bg0);font-size:0}
.hux-steps li.done .hux-dot::before{content:"\2713";font-size:11px;font-weight:700}
.hux-steps li.current{color:var(--text);font-weight:600}
.hux-steps li.current .hux-dot{border-color:var(--signal);color:var(--signal);box-shadow:0 0 0 3px rgba(0,229,160,.16)}
.hux-flow[data-tone="warn"] .hux-steps li.current .hux-dot{border-color:var(--warn);color:var(--warn);box-shadow:0 0 0 3px rgba(245,158,11,.16)}
.hux-next-text{flex:1;min-width:0}
.hux-title{font-size:13.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hux-hint{font-size:12px;color:var(--muted-lt);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hux-hint:empty{display:none}
.hux-next-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.hux-cta{height:34px;padding:0 18px;border:0;border-radius:var(--radius);background:var(--signal);color:var(--bg0);font:600 13px var(--sans);cursor:pointer;transition:transform .12s var(--ease),filter .12s}
.hux-cta:hover:not(:disabled){filter:brightness(1.1)}
.hux-cta:active:not(:disabled){transform:translateY(1px)}
.hux-cta:disabled{opacity:.45;cursor:not-allowed}
.hux-flow[data-tone="warn"] .hux-cta{background:var(--warn)}
.hux-flow[data-tone="busy"] .hux-cta{background:transparent;color:var(--signal);box-shadow:inset 0 0 0 1px rgba(0,229,160,.5)}
.hux-sec{height:34px;padding:0 14px;border-radius:var(--radius);background:transparent;border:1px solid var(--border-strong);color:var(--text);font:600 12.5px var(--sans);cursor:pointer;transition:border-color .12s,color .12s}
.hux-sec:hover:not(:disabled){border-color:var(--signal);color:var(--signal)}
.hux-sec:disabled{opacity:.45;cursor:not-allowed}
.hux-cmd{height:34px;display:inline-flex;align-items:center;gap:8px;padding:0 10px;border-radius:var(--radius);background:transparent;border:1px solid var(--border);color:var(--muted-lt);font:12px var(--sans);cursor:pointer}
.hux-cmd:hover{color:var(--text);border-color:var(--border-strong)}

/* Tabs: icons, badges, clearer active state */
.tab{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;padding:0 12px}
.tab:hover{background:rgba(255,255,255,.04)}
.hux-ic{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}
.hux-badge{min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:var(--warn);color:var(--bg0);font:700 10px/17px var(--mono);text-align:center}
.hux-badge.alert{background:var(--accent);color:var(--bg0)}
.hux-badge[hidden]{display:none}

/* Legibility: sentence-case labels, no 9px text, bigger hit areas */
.pane-hd span,.col-title,.epic-title,.settings-section h4,.arch-palette h4,.arch-props h4,.iac-section h4,.cand-title,.cc-label,.fl,.lang-tag{text-transform:none;letter-spacing:0;font-size:12px;font-weight:600;color:var(--muted-lt)}
.pane-hd{min-height:38px;padding:6px 12px}
.hs-label{text-transform:none;letter-spacing:0}
.harness-strip{height:28px;font-size:11px;background:var(--bg0)}
.card-id,.tid,.col-badge{font-size:10.5px}
.card-epic{font-size:11px}
.card-title{font-size:12.5px}
.card{padding:9px;border-radius:var(--radius)}
.col,.regen-panel,.correction-card{border-radius:10px}
.spec-task{position:relative;align-items:flex-start;padding:4px 0}
.spec-task input[type=checkbox]{margin-top:3px}
.spec-task label{font-size:12.5px;min-width:0}
.spec-task .tid{white-space:nowrap;flex-shrink:0;padding-top:3px}
.task-actions{position:absolute;right:0;top:2px;padding:2px 0 2px 10px;background:var(--bg0);box-shadow:-10px 0 10px var(--bg0)}
.spec-task:focus-within .task-actions{opacity:1}
.ta-btn{font-size:11px;padding:3px 8px}
.btn{min-height:28px;padding:5px 12px;font-size:12px}
.btn-sm{min-height:26px;padding:3px 10px;font-size:11.5px}
.msg-bubble{font-size:13px}
.msg-meta,.setting-desc,.skill-hint,.skill-opt-desc{font-size:11px}
.sys-bubble{font-size:11px}
#chatInput{font-size:13px;padding:8px 10px}
.send-btn{width:34px;height:34px;border-radius:var(--radius)}
.pill{font-size:11px;padding:4px 10px}
.empty-chat{padding:16px}
.empty-chat p{font-size:12.5px}

/* Board cards: visible primary action instead of drag-only */
.card-actions{margin-top:8px;display:flex;gap:6px}
.hux-card-btn{height:26px;padding:0 12px;border-radius:6px;border:1px solid var(--border-strong);background:var(--bg3);color:var(--text);font:600 11.5px var(--sans);cursor:pointer;transition:border-color .12s,background .12s}
.hux-card-btn:hover{border-color:var(--signal)}
.hux-card-btn.primary{background:var(--signal);border-color:var(--signal);color:var(--bg0)}
.hux-card-btn.primary:hover{filter:brightness(1.1)}

/* Quick actions above the chat input */
.hux-quick{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.hux-chip{height:26px;padding:0 11px;border-radius:13px;background:var(--bg2);border:1px solid var(--border);color:var(--muted-lt);font:500 12px var(--sans);cursor:pointer;transition:color .12s,border-color .12s,background .12s}
.hux-chip:hover{color:var(--text);border-color:rgba(0,229,160,.45);background:var(--bg3)}
.hux-chip.primary{color:var(--signal);border-color:rgba(0,229,160,.4);background:rgba(0,229,160,.08)}
.hux-chip.warn{color:var(--warn);border-color:rgba(245,158,11,.5);background:rgba(245,158,11,.08)}
.hux-chip.ghost{border-style:dashed}
.hux-chip:disabled{opacity:.45;cursor:not-allowed}
.hux-chip:disabled:hover{color:var(--muted-lt);border-color:var(--border);background:var(--bg2)}
.hux-starters{display:flex;flex-direction:column;gap:6px;margin-top:12px;width:min(300px,92%)}
.hux-starters button{text-align:left;padding:9px 12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--bg2);color:var(--text);font:500 12.5px var(--sans);cursor:pointer;transition:border-color .12s,background .12s}
.hux-starters button:hover{border-color:rgba(0,229,160,.45);background:var(--bg3)}

/* Command palette */
.hux-pal{position:fixed;inset:0;z-index:1000;display:flex;justify-content:center;align-items:flex-start;padding-top:12vh;background:rgba(5,8,16,.62)}
.hux-pal-box{width:min(580px,92vw);background:var(--bg1);border:1px solid var(--border-strong);border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.55);overflow:hidden;animation:hux-pop .14s var(--ease)}
.hux-pal-box input{width:100%;background:transparent;border:0;border-bottom:1px solid var(--border);color:var(--text);font:14px var(--sans);padding:15px 18px;outline:none}
.hux-pal-box input:focus-visible{outline:2px solid var(--signal);outline-offset:-2px}
.hux-pal-box input::placeholder{color:var(--muted)}
.hux-pal-list{list-style:none;max-height:46vh;overflow-y:auto;padding:6px}
.hux-pal-item{display:flex;align-items:baseline;gap:10px;padding:8px 10px;border-radius:var(--radius-sm);cursor:pointer;font-size:13px}
.hux-pal-item[aria-selected="true"]{background:rgba(0,229,160,.13)}
.hux-pal-label{color:var(--text);white-space:nowrap}
.hux-pal-hint{color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.hux-pal-grp{margin-left:auto;flex-shrink:0;font-size:11px;color:var(--muted-lt)}
.hux-pal-empty{padding:14px;text-align:center;color:var(--muted);font-size:12.5px}
.hux-pal-foot{display:flex;gap:16px;padding:8px 16px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)}
@keyframes hux-pop{from{opacity:0;transform:translateY(-6px) scale(.985)}to{opacity:1;transform:none}}

/* Work tab: stays usable in a narrow editor group */
@media(max-width:1000px){
  .studio{grid-template-columns:240px minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr)}
  .studio>.studio-pane:nth-child(1){grid-row:1 / span 2}
  .studio>.studio-pane:nth-child(2){border-right:none;border-bottom:1px solid var(--border)}
  .studio>.studio-pane:nth-child(3){display:flex;grid-column:2;border-right:none}
  .hux-steps li:not(.current) span:not(.hux-dot){display:none}
}
@media(max-width:900px){
  .hux-tl{display:none}
  .tab.active .hux-tl{display:inline}
  .hux-flow{flex-wrap:wrap;gap:8px 14px}
  .hux-next-text{flex-basis:100%;order:3}
  .hux-next-actions{margin-left:auto}
  .hux-cmd span{display:none}
}
@media(max-width:640px){
  .studio{grid-template-columns:minmax(0,1fr);grid-template-rows:none;overflow-y:auto}
  .studio>.studio-pane,.studio>.studio-pane:nth-child(n){display:flex;grid-row:auto;grid-column:auto;min-height:72vh;border-right:none;border-bottom:1px solid var(--border)}
}
@media(max-height:640px){.harness-strip{display:none}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;

export const HUX_JS = HUX_NEXT_JS + String.raw`
var HUX_ICONS = {
  studio: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 3v10M10.5 3v10"/>',
  docs: '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3M6 8h4M6 10.5h4"/>',
  git: '<path d="M1.5 8h3l2-4.5 3 9 2-4.5h3"/>',
  arch: '<rect x="6" y="2" width="4" height="3" rx=".8"/><rect x="1.5" y="11" width="4" height="3" rx=".8"/><rect x="10.5" y="11" width="4" height="3" rx=".8"/><path d="M8 5v3M3.5 11V8h9v3"/>',
  skills: '<path d="M8 2l1.4 3.6L13 7l-3.6 1.4L8 12 6.6 8.4 3 7l3.6-1.4z"/>',
  changes: '<path d="M8 2.5v5M5.5 5h5M5.5 11.5h5"/><rect x="2.5" y="1.5" width="11" height="13" rx="1.5"/>',
  settings: '<path d="M3 5h10M3 11h10"/><circle cx="6" cy="5" r="1.6"/><circle cx="10.5" cy="11" r="1.6"/>'
};
var HUX_HINTS = {
  studio: 'Spec, task board and chat',
  docs: 'Edit Word, Markdown, EPUB and PDF files',
  git: 'Commits, debt, DORA and privacy',
  arch: 'System architecture diagram',
  skills: 'Agents and skills you can run',
  changes: 'Review and apply pending file changes',
  settings: 'Providers, models and options'
};
var huxIsMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
var huxPalEl = document.getElementById('huxPal');
var huxPalIn = document.getElementById('huxPalInput');
var huxPalList = document.getElementById('huxPalList');
var huxPalItems = [];
var huxPalSel = 0;
var huxPalReturn = null;
var huxCtaAct = null;
var huxSecAct = null;

function huxSetText(el, text) { if (el && el.textContent !== text) { el.textContent = text; } }
function huxTabs() { return Array.prototype.slice.call(document.querySelectorAll('.tab')); }

function huxDecorateTabs() {
  var nav = document.querySelector('.tabs');
  if (nav) { nav.setAttribute('role', 'tablist'); }
  huxTabs().forEach(function (b, i) {
    if (b.dataset.huxDone) { return; }
    b.dataset.huxDone = '1';
    var id = b.dataset.tab;
    var label = b.textContent.trim();
    var icon = HUX_ICONS[id] ? '<svg class="hux-ic" viewBox="0 0 16 16" aria-hidden="true">' + HUX_ICONS[id] + '</svg>' : '';
    b.innerHTML = icon + '<span class="hux-tl">' + esc(label) + '</span><span class="hux-badge" hidden></span>';
    var mod = huxIsMac ? 'Option' : 'Alt';
    b.title = label + (HUX_HINTS[id] ? ' \u2013 ' + HUX_HINTS[id] : '') + ' (' + mod + '+' + (i + 1) + ')';
    b.setAttribute('role', 'tab');
  });
}

function huxSetBadge(tabId, text, alert) {
  var b = document.querySelector('.tab[data-tab="' + tabId + '"] .hux-badge');
  if (!b) { return; }
  b.hidden = !text;
  huxSetText(b, text || '');
  b.classList.toggle('alert', !!alert);
}

function huxRefresh() {
  var flow = document.getElementById('huxFlow');
  if (!flow) { return; }
  var next = huxNextStep(S, workingTasks);
  flow.dataset.tone = next.tone;
  Array.prototype.forEach.call(document.querySelectorAll('#huxSteps li'), function (li) {
    var i = Number(li.dataset.step);
    li.classList.toggle('done', i < next.step);
    li.classList.toggle('current', i === next.step);
    if (i === next.step) { li.setAttribute('aria-current', 'step'); } else { li.removeAttribute('aria-current'); }
  });
  huxSetText(document.getElementById('huxTitle'), next.title);
  huxSetText(document.getElementById('huxHint'), next.hint || '');
  var cta = document.getElementById('huxCta');
  var sec = document.getElementById('huxSec');
  huxCtaAct = next.cta ? next.cta.act : null;
  huxSecAct = next.sec ? next.sec.act : null;
  cta.hidden = !next.cta;
  sec.hidden = !next.sec;
  if (next.cta) { huxSetText(cta, next.cta.label); cta.disabled = !!(next.cta.needsIdle && S.thinking); }
  if (next.sec) { huxSetText(sec, next.sec.label); sec.disabled = !!(next.sec.needsIdle && S.thinking); }
  var pending = (S.harness && Array.isArray(S.harness.pending)) ? S.harness.pending.length : 0;
  huxSetBadge('changes', pending ? String(pending) : '', false);
  var debt = (S.harness && S.harness.debt) || { score: 0, ceiling: 100 };
  var pct = (Number(debt.score) || 0) / Math.max(1, Number(debt.ceiling) || 100);
  huxSetBadge('git', pct >= 0.7 ? '!' : '', pct >= 1);
  var nextChip = document.querySelector('[data-hux-act="next"]');
  if (nextChip) {
    nextChip.disabled = !next.taskId || !!S.thinking;
    nextChip.title = next.taskId ? 'Start ' + next.taskId + ': ' + next.title.replace('Next task: ', '') : 'No open task to start yet';
  }
  var apply = document.getElementById('huxApplyChip');
  if (apply) { apply.hidden = !pending; apply.disabled = !!S.thinking; }
  huxTabs().forEach(function (b) { b.setAttribute('aria-selected', b.classList.contains('active') ? 'true' : 'false'); });
}

function huxRun(act) {
  if (!act) { return; }
  if (act === 'regen') {
    switchTab('studio');
    var rp = document.getElementById('regenPanel');
    if (rp) { rp.style.display = 'block'; }
    var rc = document.getElementById('regenCtx');
    if (rc) { rc.focus(); }
    return;
  }
  if (act === 'apply') { runHarnessCommand('si aplicar'); return; }
  if (act === 'palette') { huxOpenPal(); return; }
  if (act === 'chat') { switchTab('studio'); chatInput.focus(); return; }
  if (act === 'refresh') {
    vscode.postMessage({ type: 'load-spec' });
    vscode.postMessage({ type: 'load-harness' });
    vscode.postMessage({ type: 'load-git' });
    toast('Refreshing\u2026', 'info');
    return;
  }
  if (act === 'provider') { vscode.postMessage({ type: 'configure-provider' }); return; }
  if (act === 'shortcuts') {
    var m = huxIsMac ? 'Cmd' : 'Ctrl';
    toast(m + '+K commands \u00b7 ' + (huxIsMac ? 'Option' : 'Alt') + '+1\u20139 switch tab \u00b7 / focus chat \u00b7 Enter send', 'info');
    return;
  }
  if (act === 'next') {
    var n = huxNextStep(S, workingTasks);
    if (n.taskId) { huxRun('start:' + n.taskId); } else { toast('No open task to start. Check the spec first.', 'info'); }
    return;
  }
  if (act.indexOf('tab:') === 0) { switchTab(act.slice(4)); return; }
  if (act.indexOf('start:') === 0) {
    var id = act.slice(6);
    toast('Starting ' + id, 'info');
    vscode.postMessage({ type: 'update-task-status', taskId: id, status: 'in-progress' });
    return;
  }
  if (act.indexOf('skill:') === 0) {
    var sid = act.slice(6);
    toast('Running /' + sid, 'info');
    vscode.postMessage({ type: 'run-skill', skillId: sid });
  }
}

function huxCommands() {
  var cmds = [];
  var mod = huxIsMac ? 'Option' : 'Alt';
  huxTabs().forEach(function (b, i) {
    var id = b.dataset.tab;
    var lbl = (b.querySelector('.hux-tl') || b).textContent.trim();
    cmds.push({ group: 'Go to', label: lbl, hint: HUX_HINTS[id] || '', act: 'tab:' + id, kbd: mod + '+' + (i + 1) });
  });
  var next = huxNextStep(S, workingTasks);
  if (next.taskId) { cmds.unshift({ group: 'Action', label: 'Start next task', hint: next.title, act: 'start:' + next.taskId }); }
  var pending = (S.harness && Array.isArray(S.harness.pending)) ? S.harness.pending.length : 0;
  if (pending) { cmds.unshift({ group: 'Action', label: 'Apply changes & run gates', hint: pending + ' pending', act: 'apply' }); }
  cmds.push({ group: 'Action', label: 'Create or regenerate spec', hint: 'Describe the project and let the AI write tasks', act: 'regen' });
  cmds.push({ group: 'Action', label: 'Validate against spec', hint: 'Check the code against spec.md', act: 'skill:validate-against-spec' });
  cmds.push({ group: 'Action', label: 'Generate tests', hint: 'For the file open in the editor', act: 'skill:generate-tests' });
  cmds.push({ group: 'Action', label: 'Refactor', hint: 'The file open in the editor', act: 'skill:refactor' });
  cmds.push({ group: 'Action', label: 'Focus chat', hint: 'Type a question or a task', act: 'chat', kbd: '/' });
  cmds.push({ group: 'Action', label: 'Refresh status', hint: 'Reload spec, git and harness', act: 'refresh' });
  cmds.push({ group: 'Action', label: 'Configure AI provider', hint: 'API keys, local models', act: 'provider' });
  cmds.push({ group: 'Action', label: 'Keyboard shortcuts', hint: '', act: 'shortcuts' });
  var seen = {};
  cmds.forEach(function (c) { if (c.act.indexOf('skill:') === 0) { seen[c.act.slice(6)] = true; } });
  (S.skills || []).forEach(function (sk) {
    if (seen[sk.id]) { return; }
    cmds.push({ group: 'Agent', label: '/' + sk.id, hint: sk.description || sk.name || '', act: 'skill:' + sk.id });
  });
  return cmds;
}

function huxRenderPal() {
  var q = huxPalIn.value.trim().toLowerCase();
  var words = q ? q.split(/\s+/) : [];
  var all = huxCommands();
  huxPalItems = words.length ? all.filter(function (c) {
    var hay = (c.label + ' ' + c.group + ' ' + (c.hint || '')).toLowerCase();
    return words.every(function (w) { return hay.indexOf(w) >= 0; });
  }) : all;
  if (huxPalSel >= huxPalItems.length) { huxPalSel = 0; }
  huxPalList.innerHTML = huxPalItems.length ? huxPalItems.map(function (c, i) {
    return '<li class="hux-pal-item" role="option" id="huxOpt' + i + '" data-i="' + i + '" aria-selected="' + (i === huxPalSel) + '">'
      + '<span class="hux-pal-label">' + esc(c.label) + '</span>'
      + '<span class="hux-pal-hint">' + esc(c.hint || '') + '</span>'
      + '<span class="hux-pal-grp">' + esc(c.kbd ? c.group + ' \u00b7 ' + c.kbd : c.group) + '</span></li>';
  }).join('') : '<li class="hux-pal-empty">No matching command</li>';
  var cur = document.getElementById('huxOpt' + huxPalSel);
  if (cur) { huxPalIn.setAttribute('aria-activedescendant', 'huxOpt' + huxPalSel); if (cur.scrollIntoView) { cur.scrollIntoView({ block: 'nearest' }); } }
  else { huxPalIn.removeAttribute('aria-activedescendant'); }
}

function huxOpenPal() {
  if (!huxPalEl.hidden) { return; }
  huxPalReturn = document.activeElement;
  huxPalEl.hidden = false;
  huxPalIn.setAttribute('aria-expanded', 'true');
  huxPalIn.value = '';
  huxPalSel = 0;
  huxRenderPal();
  huxPalIn.focus();
}

function huxClosePal() {
  if (huxPalEl.hidden) { return; }
  huxPalEl.hidden = true;
  huxPalIn.setAttribute('aria-expanded', 'false');
  if (huxPalReturn && huxPalReturn.focus) { huxPalReturn.focus(); }
  huxPalReturn = null;
}

function huxPalRunSel() {
  var c = huxPalItems[huxPalSel];
  if (!c) { return; }
  huxClosePal();
  huxRun(c.act);
}

huxPalIn.addEventListener('input', function () { huxPalSel = 0; huxRenderPal(); });
huxPalIn.addEventListener('keydown', function (e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); if (huxPalItems.length) { huxPalSel = (huxPalSel + 1) % huxPalItems.length; huxRenderPal(); } }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (huxPalItems.length) { huxPalSel = (huxPalSel - 1 + huxPalItems.length) % huxPalItems.length; huxRenderPal(); } }
  else if (e.key === 'Enter') { e.preventDefault(); huxPalRunSel(); }
  else if (e.key === 'Escape') { e.preventDefault(); huxClosePal(); }
  else if (e.key === 'Tab') { e.preventDefault(); }
});
huxPalList.addEventListener('click', function (e) {
  var li = e.target.closest ? e.target.closest('.hux-pal-item') : null;
  if (!li) { return; }
  huxPalSel = Number(li.dataset.i) || 0;
  huxPalRunSel();
});
huxPalEl.addEventListener('mousedown', function (e) { if (e.target === huxPalEl) { huxClosePal(); } });

function huxIsEditable(t) {
  if (!t || !t.tagName) { return false; }
  var tag = t.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable === true;
}

document.addEventListener('keydown', function (e) {
  var mod = e.ctrlKey || e.metaKey;
  if (mod && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    if (huxPalEl.hidden) { huxOpenPal(); } else { huxClosePal(); }
    return;
  }
  if (!huxPalEl.hidden) { return; }
  if (e.altKey && !mod && /^Digit[1-9]$/.test(e.code || '')) {
    var tabs = huxTabs();
    var t = tabs[Number(e.code.slice(5)) - 1];
    if (t) { e.preventDefault(); switchTab(t.dataset.tab); setTimeout(huxRefresh, 0); }
    return;
  }
  if (e.key === '/' && !mod && !e.altKey && !huxIsEditable(e.target)) {
    e.preventDefault();
    huxRun('chat');
  }
});

document.addEventListener('click', function (e) {
  var el = e.target.closest ? e.target.closest('[data-start-task],[data-review-task],[data-hux-act],[data-hux-skill]') : null;
  if (el) {
    if (el.dataset.startTask) { huxRun('start:' + el.dataset.startTask); }
    else if (el.dataset.reviewTask) { huxRun('tab:changes'); }
    else if (el.dataset.huxAct) { huxRun(el.dataset.huxAct); }
    else if (el.dataset.huxSkill) { huxRun('skill:' + el.dataset.huxSkill); }
  }
  setTimeout(huxRefresh, 0);
});
document.addEventListener('keydown', function (e) { if (e.key === 'Enter') { setTimeout(huxRefresh, 0); } });
window.addEventListener('message', function () { setTimeout(huxRefresh, 0); });

document.getElementById('huxCta').addEventListener('click', function () { huxRun(huxCtaAct); });
document.getElementById('huxSec').addEventListener('click', function () { huxRun(huxSecAct); });
document.getElementById('huxPalBtn').addEventListener('click', function () { huxOpenPal(); });
huxSetText(document.getElementById('huxPalKbd'), huxIsMac ? 'Cmd K' : 'Ctrl K');

(function huxEmptyChat() {
  var empty = document.getElementById('emptyChat');
  if (!empty || empty.querySelector('.hux-starters')) { return; }
  var p = empty.querySelector('p');
  if (p) { p.textContent = 'Ask anything, or start from one of these'; }
  var box = document.createElement('div');
  box.className = 'hux-starters';
  [
    ['Explain this project', 'Explain what this project does and how it is organized.'],
    ['Plan a feature', 'I want to add a feature: '],
    ['Find bugs in the open file', 'Review the open file and list likely bugs, each with a fix.'],
    ['Write a spec from an idea', 'Write a spec for this idea: ']
  ].forEach(function (s) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = s[0];
    b.addEventListener('click', function () {
      chatInput.value = s[1];
      chatInput.focus();
      chatInput.setSelectionRange(s[1].length, s[1].length);
    });
    box.appendChild(b);
  });
  empty.appendChild(box);
  chatInput.placeholder = 'Ask or describe a task\u2026';
})();

huxDecorateTabs();
huxRefresh();
`;
