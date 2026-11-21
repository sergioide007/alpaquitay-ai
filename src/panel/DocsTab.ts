/**
 * "Docs" tab of the Hub: chat with the agent about any Word / Markdown / EPUB / PDF / text file.
 * Same harness contract as the Work tab: propose → preview (word diff) → approve → write → verify.
 * Kept in its own module so MainPanel only injects three strings. No backticks or template
 * placeholders below: this text is interpolated verbatim into the webview script.
 */
export const DOCS_TAB_BUTTON = '<button class="tab" data-tab="docs">Docs</button>';

export const DOCS_CSS = String.raw`
.docs-wrap{display:flex;flex:1;min-height:0}
.docs-side{width:260px;flex-shrink:0;background:var(--bg1);border-right:1px solid var(--border);padding:12px;overflow-y:auto;display:flex;flex-direction:column;gap:8px}
.docs-h{font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.docs-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);padding:10px;font-size:12px;color:var(--muted-lt);line-height:1.5;word-break:break-word}
.docs-card b{color:var(--text)}.docs-fmt{font-family:var(--mono);font-size:10px;color:var(--signal);border:1px solid rgba(0,229,160,.4);border-radius:8px;padding:0 6px;margin-left:6px}
.docs-warn{color:var(--warn);font-size:11px;margin-top:6px}
.docs-sections{max-height:38vh;overflow-y:auto;display:flex;flex-direction:column;gap:2px}
.docs-sections label{display:flex;gap:6px;align-items:flex-start;font-size:11.5px;color:var(--muted-lt);cursor:pointer;padding:3px 4px;border-radius:4px}
.docs-sections label:hover{background:var(--bg2)}.docs-sections small{color:var(--muted)}
.docs-row{display:flex;gap:6px;flex-wrap:wrap}
.docs-btn{background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:var(--radius);padding:5px 10px;font-size:11.5px;cursor:pointer;font-family:var(--sans)}
.docs-btn:hover{border-color:rgba(0,229,160,.4)}.docs-btn.p{background:rgba(0,229,160,.12);border-color:rgba(0,229,160,.5);color:var(--signal)}.docs-btn:disabled{opacity:.45;cursor:default}
.docs-main{flex:1;min-width:0;display:flex;flex-direction:column}
.docs-chip{flex-shrink:0;padding:6px 14px;background:var(--bg1);border-bottom:1px solid var(--border);font-family:var(--mono);font-size:10.5px;color:var(--muted-lt)}
.docs-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
.dmsg{border:1px solid var(--border);background:var(--bg2);border-radius:var(--radius);padding:10px 12px;font-size:12.5px;line-height:1.55;max-width:920px;word-break:break-word}
.dmsg.user{align-self:flex-end;background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.35)}
.dmsg.ok{border-color:rgba(0,229,160,.4)}.dmsg.err{border-color:rgba(255,75,110,.5);color:#ffb3c1}.dmsg.warn{border-color:rgba(245,158,11,.5)}
.dmsg h4{margin:8px 0 4px;font-size:13px;color:var(--text)}.dmsg ul{margin:4px 0 4px 18px}.dmsg p{margin:4px 0}
.dchg{border:1px solid var(--border);border-radius:var(--radius);padding:8px;margin:6px 0;background:var(--bg1)}
.dchg.review{border-color:rgba(245,158,11,.5)}.dchg-h{display:flex;gap:8px;align-items:center;font-size:11px;color:var(--muted);margin-bottom:4px}
.dchg-t{font-size:12.5px;line-height:1.6;white-space:pre-wrap}.dchg-t del{background:rgba(255,75,110,.18);color:#ffb3c1;text-decoration:line-through}.dchg-t ins{background:rgba(0,229,160,.16);color:#8ff5d1;text-decoration:none}
.dbadge{font-family:var(--mono);font-size:9.5px;border-radius:8px;padding:0 6px;border:1px solid var(--border)}.dbadge.review{color:var(--warn);border-color:rgba(245,158,11,.6)}
.dprog{height:3px;background:var(--bg3);border-radius:2px;overflow:hidden}.dprog i{display:block;height:100%;background:var(--signal);width:0;transition:width .2s}
.docs-quick{flex-shrink:0;display:flex;gap:6px;flex-wrap:wrap;padding:8px 14px 0;align-items:center}
.docs-input{flex-shrink:0;display:flex;gap:8px;padding:10px 14px 14px;align-items:flex-end}
.docs-input textarea{flex:1;min-height:54px;max-height:160px;resize:vertical;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;font-family:var(--sans);font-size:12.5px}
.docs-input textarea:focus{outline:none;border-color:rgba(0,229,160,.5)}
.docs-side select{background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius);padding:4px;font-size:11.5px;width:100%}
@media(max-width:720px){.docs-wrap{flex-direction:column}.docs-side{width:auto;max-height:36vh;border-right:0;border-bottom:1px solid var(--border)}}
`;

export const DOCS_HTML = String.raw`
  <div class="panel" id="panel-docs">
    <div class="docs-wrap">
      <aside class="docs-side">
        <div class="docs-h">Document</div>
        <div class="docs-row"><button class="docs-btn p" id="docsOpen">Open file…</button><button class="docs-btn" id="docsReveal" disabled>Show</button></div>
        <select id="docsRecent"><option value="">Documents in this workspace…</option></select>
        <div class="docs-card" id="docsCard">No document open.<br>Works with <b>.docx</b> · <b>.md</b> · <b>.txt</b> · <b>.epub</b> · <b>.pdf</b> (read-only).</div>
        <div class="docs-h">Scope</div>
        <div class="docs-sections" id="docsSections"><small style="color:var(--muted)">Open a document to choose a chapter.</small></div>
        <div class="docs-h">Convert / export</div>
        <div class="docs-row"><button class="docs-btn" data-export="md" disabled>Markdown</button><button class="docs-btn" data-export="docx" disabled>Word</button><button class="docs-btn" data-export="epub" disabled>EPUB</button></div>
        <div class="docs-h">How it stays safe</div>
        <div class="docs-card">The agent only <b>proposes</b>. You see a word-level diff, approve what you want, and the result goes to a <b>new file</b> (overwrite makes a backup). Word edits arrive as <b>tracked changes</b>. The written file is re-read to verify it.</div>
      </aside>
      <main class="docs-main">
        <div class="docs-chip" id="docsChip">Build lane · Docs · preview → approve → write → verify · nothing is written until you apply</div>
        <div class="dprog" id="docsProg" hidden><i></i></div>
        <div class="docs-log" id="docsLog"></div>
        <div class="docs-quick" id="docsQuick">
          <button class="docs-btn" data-op="proofread">Proofread</button>
          <button class="docs-btn" data-op="style">Improve style</button>
          <button class="docs-btn" data-op="shorten">Shorten</button>
          <button class="docs-btn" data-op="translate">Translate to</button>
          <select id="docsLang" style="width:auto"><option>English</option><option>Spanish</option><option>French</option><option>German</option><option>Italian</option><option>Portuguese</option></select>
          <button class="docs-btn" data-op="summarize">Summarize</button>
          <button class="docs-btn" data-op="outline">Outline</button>
          <button class="docs-btn" data-op="consistency">Consistency check</button>
          <button class="docs-btn" data-op="feedback">Editorial feedback</button>
        </div>
        <div class="docs-input">
          <textarea id="docsInput" placeholder="Tell the agent what to do, e.g. “corrige la ortografía del capítulo 3”, “hazlo más directo”, “¿qué le falta a este capítulo?”…  (Ctrl+Enter to send)"></textarea>
          <button class="docs-btn p" id="docsRun">Send</button><button class="docs-btn" id="docsCancel" hidden>Cancel</button>
        </div>
      </main>
    </div>
  </div>
`;

export const DOCS_JS = String.raw`
// ── Docs tab ─────────────────────────────────────────────────────────────────
var DS = { inited:false, doc:null, scope:'all', busy:false, changes:[], last:null };
function dEl(id){ return document.getElementById(id); }
function dPost(m){ vscode.postMessage(m); }
function docsOnShow(){ if(!DS.inited){ DS.inited=true; dPost({ type:'docs-init' }); dLog('', 'Open a document and tell me what to do with it: proofread, restyle, translate, summarize, check a whole book for consistency… I will always show you a diff first.'); } }
function dLog(kind, html){ var l=dEl('docsLog'); var d=document.createElement('div'); d.className='dmsg '+kind; d.innerHTML=html; l.appendChild(d); l.scrollTop=l.scrollHeight; return d; }
function dChip(t){ dEl('docsChip').textContent='Build lane · Docs · '+t; }
function dBusy(b, calls){ DS.busy=b; dEl('docsRun').disabled=b; dEl('docsCancel').hidden=!b; dEl('docsProg').hidden=!b; if(b){ dEl('docsProg').firstChild.style.width='0%'; } if(b&&calls){ dChip('working · up to '+calls+' model call(s)'); } }
function dMd(md){
  var out=[], inList=false, lines=String(md||'').split('\n');
  for(var i=0;i<lines.length;i++){
    var t=lines[i], m;
    if((m=/^(#{1,4})\s+(.*)$/.exec(t))){ if(inList){out.push('</ul>');inList=false;} out.push('<h4>'+dInline(m[2])+'</h4>'); }
    else if((m=/^\s*[-*]\s+(.*)$/.exec(t))){ if(!inList){out.push('<ul>');inList=true;} out.push('<li>'+dInline(m[1])+'</li>'); }
    else if(t.trim()===''){ if(inList){out.push('</ul>');inList=false;} }
    else { if(inList){out.push('</ul>');inList=false;} out.push('<p>'+dInline(t)+'</p>'); }
  }
  if(inList){ out.push('</ul>'); }
  return out.join('');
}
function dInline(s){ return esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>'); }
function dRenderDoc(d){
  DS.doc=d; DS.scope='all';
  var w=d.warnings&&d.warnings.length ? '<div class="docs-warn">'+d.warnings.map(esc).join('<br>')+'</div>' : '';
  dEl('docsCard').innerHTML='<b>'+esc(d.title||d.name)+'</b><span class="docs-fmt">'+esc(d.format)+(d.readOnly?' · read-only':'')+'</span><br>'+esc(d.name)+'<br>'+d.words.toLocaleString()+' words · '+d.sections.length+' section(s)'+(d.protectedBlocks?' · '+d.protectedBlocks+' protected block(s)':'')+(d.author?'<br>'+esc(d.author):'')+w;
  var h='<label><input type="radio" name="dscope" value="all" checked> <span>Whole document</span></label>';
  d.sections.slice(0,400).forEach(function(s){ h+='<label><input type="radio" name="dscope" value="'+esc(s.id)+'"> <span>'+esc(s.title)+' <small>'+s.words+' w</small></span></label>'; });
  dEl('docsSections').innerHTML=h;
  dEl('docsSections').querySelectorAll('input').forEach(function(r){ r.addEventListener('change',function(){ DS.scope=r.value; }); });
  dEl('docsReveal').disabled=false;
  document.querySelectorAll('[data-export]').forEach(function(b){ b.disabled=false; });
}
function dDiffHtml(diff){ return diff.map(function(o){ var s=esc(o.s); return o.t==='del'?'<del>'+s+'</del>':o.t==='ins'?'<ins>'+s+'</ins>':s; }).join(''); }
function dRenderChanges(msg){
  DS.changes=msg.changes||[]; DS.tracked = !!(DS.doc && DS.doc.format==='docx');
  var warn=(msg.warnings||[]).length?'<div class="docs-warn">'+msg.warnings.map(esc).join('<br>')+'</div>':'';
  if(!DS.changes.length){ dLog('ok','No changes needed for that request. '+warn); dChip('no changes proposed'); return; }
  var review=DS.changes.filter(function(c){return c.risk==='review';}).length;
  var card=dLog('', '<b>'+DS.changes.length+' proposed change(s)</b> · '+review+' need a closer look (not pre-selected) · '+msg.calls+' model call(s) · '+esc(msg.model||'')+warn+
    '<div class="docs-row" style="margin:8px 0"><button class="docs-btn" data-sel="all">Select all</button><button class="docs-btn" data-sel="safe">Only safe</button><button class="docs-btn" data-sel="none">None</button></div><div class="dlist"></div>'+
    '<div class="docs-row" style="margin-top:8px;align-items:center"><label style="font-size:12px"><input type="radio" name="dout" value="new" checked> New file (original untouched)</label>'+
    (DS.doc&&DS.doc.readOnly?'':'<label style="font-size:12px"><input type="radio" name="dout" value="overwrite"> Overwrite (backup first)</label>')+
    (DS.tracked?'<label style="font-size:12px"><input type="checkbox" class="dtrack" checked> Word tracked changes</label>':'')+
    '<button class="docs-btn p dapply">Apply selected</button></div>');
  var list=card.querySelector('.dlist'); var shown=0;
  function more(){
    DS.changes.slice(shown, shown+40).forEach(function(c){
      var row=document.createElement('div'); row.className='dchg '+c.risk;
      row.innerHTML='<div class="dchg-h"><input type="checkbox" data-id="'+esc(c.id)+'"'+(c.risk==='low'?' checked':'')+'> <span>'+esc(c.sectionTitle)+'</span>'+(c.risk==='review'?'<span class="dbadge review">review: '+esc(c.reason||'')+'</span>':'')+'</div><div class="dchg-t">'+dDiffHtml(c.diff)+'</div>';
      list.appendChild(row);
    });
    shown=Math.min(DS.changes.length, shown+40);
    var mb=card.querySelector('.dmore'); if(mb){ mb.remove(); }
    if(shown<DS.changes.length){ var b=document.createElement('button'); b.className='docs-btn dmore'; b.textContent='Show more ('+(DS.changes.length-shown)+' left)'; b.addEventListener('click',more); list.appendChild(b); }
  }
  more();
  function sel(mode){ DS.changes.forEach(function(c){ var cb=card.querySelector('input[data-id="'+c.id+'"]'); if(cb){ cb.checked = mode==='all' || (mode==='safe' && c.risk==='low'); } }); }
  card.querySelectorAll('[data-sel]').forEach(function(b){ b.addEventListener('click',function(){ sel(b.dataset.sel); }); });
  card.querySelector('.dapply').addEventListener('click',function(){
    var ids=[]; card.querySelectorAll('input[data-id]').forEach(function(cb){ if(cb.checked){ ids.push(cb.dataset.id); } });
    // Changes not rendered yet (behind "show more") follow the same default as the buttons: only the safe ones.
    if(shown<DS.changes.length){ DS.changes.slice(shown).forEach(function(c){ if(c.risk==='low'){ ids.push(c.id); } }); }
    if(!ids.length){ toast('Select at least one change','err'); return; }
    var out=card.querySelector('input[name="dout"]:checked').value; var tr=card.querySelector('.dtrack');
    dPost({ type:'docs-apply', ids:ids, output:out, trackChanges: tr?tr.checked:true }); dChip('applying '+ids.length+' change(s)…');
  });
  dChip(DS.changes.length+' change(s) proposed · review the diff, then apply');
}
function docsOnMessage(m){
  switch(m.type){
    case 'docs-list': var sel=dEl('docsRecent'); sel.innerHTML='<option value="">Documents in this workspace…</option>'+(m.files||[]).map(function(f){ return '<option value="'+esc(f.path)+'">'+esc(f.rel)+'</option>'; }).join(''); if(m.doc){ dRenderDoc(m.doc); } break;
    case 'docs-doc': dRenderDoc(m.doc); dLog('ok','Loaded <b>'+esc(m.doc.name)+'</b> ('+m.doc.words.toLocaleString()+' words, '+m.doc.sections.length+' sections). What should I do with it?'); dChip(esc(m.doc.name)+' loaded'); break;
    case 'docs-busy': dBusy(!!m.busy, m.calls); if(!m.busy){ dChip('idle'); } break;
    case 'docs-progress': var pct=m.total?Math.round(100*m.done/m.total):0; dEl('docsProg').firstChild.style.width=pct+'%'; dChip((m.total?m.done+'/'+m.total+' · ':'')+m.text); break;
    case 'docs-changes': dRenderChanges(m); break;
    case 'docs-report':
      var c=dLog('', dMd(m.markdown)+((m.warnings||[]).length?'<div class="docs-warn">'+m.warnings.map(esc).join('<br>')+'</div>':'')+'<div class="docs-row" style="margin-top:8px"><button class="docs-btn dsave">Save report as .md</button></div>');
      c.querySelector('.dsave').addEventListener('click',function(){ dPost({ type:'docs-save-report' }); }); dChip('report ready · '+m.calls+' model call(s)'); break;
    case 'docs-confirm':
      var k=dLog('warn','This needs <b>'+m.calls+' model calls</b>'+(m.local?' (local model: free, private).':'. The provider is <b>cloud</b>: text is sent to it with PII redacted.')+' Continue?<div class="docs-row" style="margin-top:6px"><button class="docs-btn p dgo">Continue</button><button class="docs-btn dno">Cancel</button></div>');
      k.querySelector('.dgo').addEventListener('click',function(){ k.remove(); var r=DS.last||{}; dPost({ type:'docs-run', instruction:r.instruction, scope:r.scope, op:r.op, confirmed:true }); });
      k.querySelector('.dno').addEventListener('click',function(){ k.remove(); dChip('cancelled'); }); break;
    case 'docs-applied':
      dLog(m.verified?'ok':'warn', (m.verified?'Verified. ':'Written, but verification found issues: '+esc((m.problems||[]).join('; '))+'. ')+'Saved <b>'+esc(m.name)+'</b> with '+m.applied+' change(s)'+(m.overwrite?' (backup: '+esc(m.backup)+')':' — your original is untouched')+(m.trackChanges?'. Open it in Word and use Review → Accept/Reject.':'.')+'<div class="docs-row" style="margin-top:6px"><button class="docs-btn dshow">Show file</button></div>').querySelector('.dshow').addEventListener('click',function(){ dPost({ type:'docs-reveal', path:m.path }); });
      dChip('applied · '+(m.verified?'verified':'needs attention')); break;
    case 'docs-exported': dLog('ok','Created <b>'+esc(m.name)+'</b>.<div class="docs-row" style="margin-top:6px"><button class="docs-btn dshow">Show file</button></div>').querySelector('.dshow').addEventListener('click',function(){ dPost({ type:'docs-reveal', path:m.path }); }); break;
    case 'docs-error': dBusy(false); dLog('err', esc(m.error)); dChip('error'); break;
  }
}
function dRun(op, text){
  if(!DS.doc){ toast('Open a document first','err'); return; }
  var t=(text!==undefined?text:dEl('docsInput').value).trim();
  if(!t && !op){ toast('Tell the agent what to do','err'); return; }
  var label = t || ({ proofread:'Proofread', style:'Improve style', shorten:'Shorten', translate:'Translate to '+dEl('docsLang').value, summarize:'Summarize', outline:'Outline', consistency:'Consistency check', feedback:'Editorial feedback' })[op];
  if(op==='translate' && !/translate|traduc/i.test(label)){ label='Translate to '+dEl('docsLang').value; }
  var sc=DS.scope!=='all'?(' — chapter: '+((DS.doc.sections.filter(function(s){return s.id===DS.scope;})[0]||{}).title||'')):'';
  dLog('user', esc(label)+esc(sc));
  DS.last={ instruction:label, scope:DS.scope, op:op||undefined };
  dPost({ type:'docs-run', instruction:label, scope:DS.scope, op:op||undefined });
  dEl('docsInput').value='';
}
dEl('docsOpen').addEventListener('click',function(){ dPost({ type:'docs-pick' }); });
dEl('docsReveal').addEventListener('click',function(){ if(DS.doc){ dPost({ type:'docs-reveal', path:DS.doc.path }); } });
dEl('docsRecent').addEventListener('change',function(e){ if(e.target.value){ dPost({ type:'docs-open', path:e.target.value }); } });
dEl('docsRun').addEventListener('click',function(){ dRun(undefined); });
dEl('docsCancel').addEventListener('click',function(){ dPost({ type:'docs-cancel' }); });
dEl('docsInput').addEventListener('keydown',function(e){ if(e.key==='Enter' && (e.ctrlKey||e.metaKey)){ e.preventDefault(); dRun(undefined); } });
document.querySelectorAll('[data-op]').forEach(function(b){ b.addEventListener('click',function(){ dRun(b.dataset.op, ''); }); });
document.querySelectorAll('[data-export]').forEach(function(b){ b.addEventListener('click',function(){ dPost({ type:'docs-export', format:b.dataset.export }); }); });
`;
