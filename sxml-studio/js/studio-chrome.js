/* Shared SVG icons and workspace presentation. No chart/runtime semantics here. */
(function (global) {
  'use strict';
  const paths = {
    state: 'M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M9 12h6 M12 9v6',
    parallel: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M12 7v2 M12 11v2 M12 15v2',
    final: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    history: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M9 8v8 M15 8v8 M9 12h6',
    transition: 'M4 18V9a2 2 0 0 1 2-2h10',
    trash: 'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
    undo: 'M3 9h11a6 6 0 0 1 0 12h-3 M3 9l6-6 M3 9l6 6',
    redo: 'M21 9H10a6 6 0 0 0 0 12h3 M21 9l-6-6 M21 9l-6 6',
    plus: 'M12 5v14 M5 12h14', minus: 'M5 12h14',
    fit: 'M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5 M8 8h8v8H8z',
    focus: 'M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5',
    extras: 'M6.5 12a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0 M13.5 12a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0 M20.5 12a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0',
    palette: 'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4c-1-1 0-2 1-2h2a4 4 0 0 0 4-4c0-4-4-8-9-8z M7 10h.01 M10 7h.01 M15 7h.01 M18 10h.01',
    file: 'M14 3H5v18h14V8z M14 3v5h5 M8 12h8 M8 16h5',
    folder: 'M3 7V5h7l2 3h9v12H3z',
    download: 'M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4',
    image: 'M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M16 7h.01',
    structure: 'M12 3v5 M5 13V8h14v5 M3 13h4v7H3z M10 13h4v7h-4z M17 13h4v7h-4z M10 2h4v4h-4z',
    inspect: 'M4 5h16 M4 12h16 M4 19h16 M8 3v4 M16 10v4 M10 17v4',
    play: 'M8 4l12 8-12 8z', pause: 'M8 4v16 M16 4v16', stop: 'M5 5h14v14H5z',
    record: 'M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
    back: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7',
    up: 'M5 15l7-7 7 7', down: 'M5 9l7 7 7-7',
    restart: 'M3 10a9 9 0 1 1 2 8 M3 4v6h6',
    check: 'M5 12l4 4L19 6', close: 'M6 6l12 12 M18 6L6 18',
    copy: 'M8 8h12v13H8z M16 8V3H3v13h5',
    edit: 'M4 16v4h4L20 8l-4-4z M13 7l4 4',
    code: 'M8 6l-6 6 6 6 M16 6l6 6-6 6 M14 3l-4 18',
    split: 'M3 4h18v16H3z M12 4v16', diagram: 'M3 4h7v6H3z M14 14h7v6h-7z M10 7h7v7',
    settings: 'M19.391 8.939 L19.762 10.065 L22.045 10.229 L22.045 13.771 L19.762 13.935 L19.391 15.061 L18.857 16.120 L20.355 17.850 L17.850 20.355 L16.120 18.857 L15.061 19.391 L13.935 19.762 L13.771 22.045 L10.229 22.045 L10.065 19.762 L8.939 19.391 L7.880 18.857 L6.150 20.355 L3.645 17.850 L5.143 16.120 L4.609 15.061 L4.238 13.935 L1.955 13.771 L1.955 10.229 L4.238 10.065 L4.609 8.939 L5.143 7.880 L3.645 6.150 L6.150 3.645 L7.880 5.143 L8.939 4.609 L10.065 4.238 L10.229 1.955 L13.771 1.955 L13.935 4.238 L15.061 4.609 L16.120 5.143 L17.850 3.645 L20.355 6.150 L18.857 7.880 Z M15.4 12a3.4 3.4 0 1 0-6.8 0a3.4 3.4 0 1 0 6.8 0',
    upload: 'M12 16V3 M7 8l5-5 5 5 M4 17v4h16v-4',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',
    move: 'M12 2v20 M2 12h20 M8 6l4-4 4 4 M8 18l4 4 4-4 M6 8l-4 4 4 4 M18 8l4 4-4 4',
    info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 11v6 M12 7h.01',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    splitrows: 'M3 4h18v16H3z M3 12h18',
    wand: 'M4 20L15 9 M13 7l4 4 M17 3v3 M15.5 4.5h3 M20 9v3 M18.5 10.5h3 M9 3v2 M8 4h2',
    'flow-right': 'M3 5h5v5H3z M16 14h5v5h-5z M5.5 10v6.5H12',
    'flow-down': 'M4 3h5v5H4z M15 16h5v5h-5z M9 5.5h8.5V12',
    hspace: 'M4 4v16 M20 4v16 M8 12h8 M10.5 9.5L8 12l2.5 2.5 M13.5 9.5L16 12l-2.5 2.5',
    vspace: 'M4 4h16 M4 20h16 M12 8v8 M9.5 10.5L12 8l2.5 2.5 M9.5 13.5L12 16l2.5-2.5'
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',class:'ui-icon'})) svg.setAttribute(key,value);
    const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',paths[name] || paths.state); svg.append(path);
    if (name === 'extras') { path.setAttribute('fill', 'currentColor'); path.setAttribute('stroke', 'none'); }
    const arrowheads = {transition: 'M15 3L21 7L15 11Z', 'flow-right': 'M10 12.5L16 16.5L10 20.5Z', 'flow-down': 'M13.5 10L17.5 16L21.5 10Z'};
    if (arrowheads[name]) {
      const head = document.createElementNS(svg.namespaceURI, 'path');
      head.setAttribute('d', arrowheads[name]); head.setAttribute('fill', 'currentColor'); head.setAttribute('stroke', 'none'); svg.append(head);
    }
    return svg;
  }
  const ids = {'new':'plus','open':'folder','save':'download','export':'image','tool-connect':'transition','delete':'trash','undo':'undo','redo':'redo','layout-toggle':'extras','zoom-in':'plus','zoom-out':'minus','fit':'fit','tab-settings':'settings','clear':'trash','timeline-pause':'pause','timeline-previous':'back','timeline-next':'next','canvas-focus':'focus'};
  const labels = {'Edit':'edit','Remove':'trash','Send':'play','Duplicate subtree':'copy','Apply move':'move','Delete state':'trash','Delete transition':'trash','+ Add':'plus','×':'close','↑':'up','↓':'down','Collapse children':'minus','Expand children':'plus'};
  function decorate(root) {
    if (!root) return;
    for (const b of root.querySelectorAll('button')) {
      const label = b.textContent.trim();
      let name = b.dataset.icon || ids[b.id] || labels[label] || (b.dataset.add ? b.dataset.add : null);
      if (b.dataset.view) name = {diagram:'diagram',split:'split',source:'code'}[b.dataset.view];
      if (b.classList.contains('structure-name')) name = {state:'state',parallel:'parallel',final:'final',history:'history'}[b.title] || 'structure';
      if (b.closest('.structure-row') && b.hasAttribute('aria-expanded')) {name=b.getAttribute('aria-expanded')==='true'?'down':'next';b.classList.add('tree-toggle');}
      if (b.closest('#files') && !b.classList.contains('file-remove')) name = 'file';
      if (!name) continue;
      if (b.id === 'timeline-pause' && /Follow/.test(label)) name = 'play';
      const old = b.querySelector('svg');
      if (!old || old.dataset.chromeIcon !== name) { if (old) old.remove(); const svg=icon(name); svg.dataset.chromeIcon=name; b.prepend(svg); }
      for (const text of [...b.childNodes]) if (text.nodeType === 3 && text.textContent.trim()) {
        const span = document.createElement('span'); span.className='ui-button-label'; span.textContent=text.textContent.replace(/^[▷↻]\s*/, '').replace(/^\+ Add$/, 'Add'); text.replaceWith(span);
      }
      b.classList.add('ui-button');
      if (!b.title) b.title = b.getAttribute('aria-label') || label;
      if (b.closest('.chart-toolbar') || b.classList.contains('compact-action')) {
        if (!b.hasAttribute('data-original-aria')) b.dataset.originalAria = b.getAttribute('aria-label') || '';
        b.setAttribute('aria-label', b.dataset.originalAria || label);
        b.classList.add('icon-only');
      }
      if(b.id==='timeline-pause') b.title=label;
      if(b.id==='tab-run') b.title='Run and inspect events';
    }
  }
  const sectionState = new Map();
  function inspector(root) {
    if (!root || root.querySelector('.ui-section')) { decorate(root); return; }
    const headings = [...root.querySelectorAll(':scope > .section-title')];
    const names = {'DATAMODEL · PROLOG SOURCE':['Data','code'],'ENTRY ACTIONS':['Entry actions','play'],'EXIT ACTIONS':['Exit actions','stop'],'DEFERRED EVENTS':['Deferred events','clock'],'SPAWNED ACTORS':['Actors','structure'],'SUBCHART':['Subchart tools','copy']};
    for (const heading of headings) {
      const key=[...heading.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();
      if (!names[key]) continue;
      const elements=[]; for(let e=heading.nextSibling;e && !(e.nodeType===1 && e.classList.contains('section-title'));e=e.nextSibling) if(!(e.nodeType===1 && e.classList.contains('insp-actions'))) elements.push(e);
      const meaningful=elements.some(e=> e.nodeType===1 && (e.matches('.card,.tools-card') || (e.matches('textarea,input') && e.value.trim()) || e.querySelector('textarea')?.value.trim()));
      const details=document.createElement('details'); details.className='ui-section';
      const summary=document.createElement('summary'); summary.append(icon(names[key][1]), document.createTextNode(names[key][0]));
      for(const b of [...heading.querySelectorAll('button')]) summary.append(b);
      details.append(summary); heading.before(details); heading.remove();
      const content=document.createElement('div'); content.className='ui-section-body'; content.append(...elements); details.append(content);
      details.open=sectionState.has(key)?sectionState.get(key):meaningful && key !== 'SUBCHART';
      if (content.querySelector('.focus')) details.open=true;
      summary.addEventListener('click',e=>{if(!e.target.closest('button')) setTimeout(()=>sectionState.set(key,details.open),0);});
    }
    for(const actions of root.querySelectorAll(':scope > .insp-actions')) root.append(actions);
    decorate(root);
  }
  function initialise() {
    const workspace=document.querySelector('.workspace'), tree=document.querySelector('.structure-panel'), files=document.getElementById('files');
    tree.id='structure-panel'; tree.setAttribute('role','tabpanel'); tree.setAttribute('aria-labelledby','workspace-structure');
    files.setAttribute('role','tabpanel'); files.setAttribute('aria-labelledby','workspace-files');
    const tabs=document.createElement('div'); tabs.className='workspace-tabs'; tabs.setAttribute('role','tablist'); tabs.setAttribute('aria-label','Workspace navigation');
    function workspaceTab(mode,label,name) {
      const b=document.createElement('button'); b.type='button'; b.id='workspace-'+mode; b.setAttribute('role','tab'); b.setAttribute('aria-controls',mode==='files'?'files':'structure-panel'); b.dataset.icon=name; b.textContent=label;
      b.onclick=()=>{workspace.dataset.section=mode; for(const t of tabs.children){t.setAttribute('aria-selected',String(t===b));t.tabIndex=t===b?0:-1;} const panel=mode==='files'?files:tree; panel.hidden=false; (mode==='files'?tree:files).hidden=true;};
      tabs.append(b); return b;
    }
    const first=workspaceTab('files','Files','folder'); workspaceTab('structure','Structure','structure'); workspace.prepend(tabs); first.click();
    for(const [id,label] of [['new','New chart'],['open','Open'],['save','Save XML'],['export','Export']]) {
      const b=document.getElementById(id); b.title=b.title || b.textContent; b.textContent=label;
    }
    workspace.addEventListener('click',e=>{if(e.target.closest('#files .file-row > button:first-child')){document.body.dataset.drawer='';document.getElementById('toggle-workspace')?.setAttribute('aria-pressed','false');}});
    const consolePanel=document.createElement('details'); consolePanel.className='runtime-console'; consolePanel.id='runtime-console';
    const consoleSummary=document.createElement('summary'); consoleSummary.append(icon('code'),document.createTextNode('Trace & queries')); consolePanel.append(consoleSummary);
    const consoleBody=document.createElement('div');consoleBody.className='console-body';
    consoleBody.append(document.querySelector('#run .queries'),document.querySelector('#run .log-title'),document.getElementById('log'));consolePanel.append(consoleBody);document.getElementById('run').append(consolePanel);
    consolePanel.addEventListener('toggle',()=>{if(consolePanel.open){const log=document.getElementById('log');log.scrollTop=log.scrollHeight;}});
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.className='drawer-dismiss';dismiss.setAttribute('aria-label','Close side panel');
    dismiss.onclick=()=>{document.body.dataset.drawer='';for(const b of document.querySelectorAll('.panel-toggle'))b.setAttribute('aria-pressed','false');};document.body.append(dismiss);
    tabs.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault(); const next=[...tabs.children].find(b=>b.getAttribute('aria-selected')!=='true'); next.click(); next.focus();}};
    const actions=document.querySelector('.top-actions');
    const run=document.createElement('button'); run.id='toolbar-run'; run.type='button'; run.dataset.icon='play'; run.textContent='Run'; run.className='primary';
    run.onclick=()=>{startChart();if(matchMedia('(max-width:860px)').matches){document.body.dataset.drawer='inspector';document.getElementById('toggle-inspector').setAttribute('aria-pressed','true');}};
    const stop=document.createElement('button');stop.id='toolbar-stop';stop.type='button';stop.dataset.icon='stop';stop.textContent='Stop';stop.title='Stop chart';stop.setAttribute('aria-label','Stop chart');stop.disabled=true;
    stop.onclick=()=>haltChart();
    const runGroup=document.createElement('div'); runGroup.className='toolbar-group'; runGroup.setAttribute('role','group'); runGroup.setAttribute('aria-label','Run controls');
    runGroup.append(run,stop);
    document.getElementById('toolbar-group-edit').after(runGroup);
    for(const [id,label,name] of [['toggle-workspace','Files & structure','folder'],['toggle-inspector','Inspector panels','inspect']]) {
      const b=document.createElement('button'); b.id=id; b.type='button'; b.dataset.icon=name; b.textContent=label; b.className='panel-toggle compact-action'; b.setAttribute('aria-pressed','false');
      b.onclick=()=>{ const side=id==='toggle-workspace'?'workspace':'inspector'; const open=document.body.dataset.drawer===side; document.body.dataset.drawer=open?'':side; for(const t of actions.querySelectorAll('.panel-toggle'))t.setAttribute('aria-pressed',String(t===b&&!open));}; actions.append(b);
    }
    const focus=document.createElement('button'); focus.id='canvas-focus'; focus.type='button'; focus.textContent='Focus canvas'; focus.setAttribute('aria-pressed','false');
    focus.onclick=()=>{const active=document.body.dataset.focus!=='true';document.body.dataset.focus=String(active);document.body.dataset.drawer='';focus.setAttribute('aria-pressed',String(active));window.dispatchEvent(new Event('resize'));};
    document.getElementById('toolbar-group-view').append(focus);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.dataset.drawer='';for(const b of actions.querySelectorAll('.panel-toggle'))b.setAttribute('aria-pressed','false');} if((e.metaKey||e.ctrlKey)&&e.key==='.'){e.preventDefault();focus.click();}});
    decorate(document); inspector(document.getElementById('inspector')); syncRun();
  }
  let executionState={live:false,runDisabled:false,stopDisabled:true};
  function syncRun(state) {
    if(state) executionState=state;
    const target=document.getElementById('toolbar-run');if(!target)return;
    const stop=document.getElementById('toolbar-stop');if(stop)stop.disabled=executionState.stopDisabled;
    const live=executionState.live; target.disabled=executionState.runDisabled;
    const label=live?'Restart':'Run';
    target.title=live?'Restart chart':'Run chart';
    if(target.querySelector('.ui-button-label')?.textContent!==label){target.textContent=label;target.dataset.icon=live?'restart':'play';decorate(target.parentNode);}
  }
  global.SXMLChrome={icon,decorate,inspector,syncRun};
  document.addEventListener('DOMContentLoaded',initialise,{once:true});
})(window);
