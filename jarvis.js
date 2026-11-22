/*
 * Jarvis — AI assistant for Vanguard God's-Eye.
 *
 * - Works fully offline with built-in commands that read and update the dashboard
 *   (opportunities, assignments, approvals, paper trades, navigation).
 * - Voice input (Web Speech API SpeechRecognition) and spoken replies (speechSynthesis)
 *   where the browser supports them.
 * - Optional "AI brain": any OpenAI-compatible chat API (OpenAI, xAI, or a custom base URL).
 *   The API key is entered by the user in Jarvis settings and stored ONLY in this
 *   browser's localStorage. Nothing secret is ever written to this repository.
 *
 * Jarvis follows the dashboard's approval-first rule: it never submits bids, contacts
 * companies, or places trades. It only edits the same local records the dashboard does.
 */
(function () {
  'use strict';

  var SETTINGS_KEY = 'vanguard_jarvis_settings_v1';
  var CHAT_KEY = 'vanguard_jarvis_chat_v1';
  var PROVIDERS = {
    openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    xai: { label: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', model: 'grok-3-mini' },
    custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '', model: '' }
  };
  var OWNERS = ['Executive', 'Contract Scout', 'Partner Scout', 'Financial', 'Compliance', 'Operations', 'Trading'];
  var SECTIONS = {
    'cleaning': 'Cleaning Division', 'courier': 'Courier Division', 'coordinator': 'EXECUTIVE COORDINATOR',
    'metrics': 'Command Metrics', 'trading': 'Trading Lab', 'trades': 'Trading Lab', 'pipeline': 'Opportunity Pipeline',
    'opportunities': 'Opportunity Pipeline', 'tasks': 'Agent Assignment Board', 'assignments': 'Agent Assignment Board',
    'board': 'Agent Assignment Board', 'approvals': 'CEO Approval Queue', 'approval': 'CEO Approval Queue',
    'activity': 'Agent Activity', 'connection': 'Agent Activity', 'agents': 'Contract Scout'
  };
  var AGENT_INFO = {
    'contract scout': 'Contract Scout researches opportunities and deadlines. Dashboard connection is pending.',
    'partner scout': 'Partner Scout finds cleaning subcontractors and delivery carriers. Dashboard connection is pending.',
    'financial': 'The Financial Agent covers pricing, margin and working capital. Dashboard connection is pending.',
    'compliance': 'The Compliance Agent checks eligibility and requirements. Dashboard connection is pending.',
    'operations': 'The Operations Agent handles assignments and deadlines. Dashboard connection is pending.',
    'trading': 'The Trading Agent is EUR/USD paper trading only. Broker connection is disabled.'
  };

  // ---------- dashboard bridge (index.html defines db, save, render as globals) ----------
  function getDb() {
    try { if (typeof db !== 'undefined' && db) return db; } catch (e) {}
    try { return JSON.parse(localStorage.getItem('vanguard_phase1_v1')) || { opps: [], tasks: [], trades: [] }; }
    catch (e) { return { opps: [], tasks: [], trades: [] }; }
  }
  function commit() {
    try { if (typeof save === 'function') { save(); return; } } catch (e) {}
    localStorage.setItem('vanguard_phase1_v1', JSON.stringify(getDb()));
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function money(n) { return '$' + Number(n).toLocaleString(); }

  // ---------- settings ----------
  function loadSettings() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) {}
    return {
      provider: s.provider || 'openai', baseUrl: s.baseUrl || '', model: s.model || '', apiKey: s.apiKey || '',
      speak: s.speak !== false, useAi: s.useAi !== false
    };
  }
  var settings = loadSettings();
  function storeSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  function aiReady() { return !!(settings.apiKey && settings.useAi && effectiveBase() && effectiveModel()); }
  function effectiveBase() { return (settings.baseUrl || (PROVIDERS[settings.provider] || {}).baseUrl || '').replace(/\/+$/, ''); }
  function effectiveModel() { return settings.model || (PROVIDERS[settings.provider] || {}).model || ''; }

  // ---------- UI ----------
  var el = {};
  function h(tag, attrs, text) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }

  function buildUi() {
    el.fab = h('button', { id: 'jarvis-fab', type: 'button', title: 'Jarvis assistant (Ctrl+J)', 'aria-label': 'Open Jarvis assistant' }, '🤖');
    el.panel = h('div', { id: 'jarvis-panel', role: 'dialog', 'aria-label': 'Jarvis assistant' });
    el.panel.innerHTML =
      '<div class="jv-head"><div><div class="jv-title"><span>J</span>ARVIS</div><div class="jv-sub" id="jv-mode"></div></div>' +
      '<div><button type="button" id="jv-voice" title="Spoken replies on/off"></button> ' +
      '<button type="button" id="jv-gear" title="AI brain settings">⚙</button> ' +
      '<button type="button" id="jv-close" title="Close">✕</button></div></div>' +
      '<div class="jv-settings" id="jv-settings">' +
      '<b>AI brain (optional)</b><div class="muted" style="font-size:12px">Without a key Jarvis still runs all built-in commands offline.</div>' +
      '<label for="jv-provider">Provider</label><select id="jv-provider"></select>' +
      '<label for="jv-base">Base URL</label><input id="jv-base" placeholder="https://api.openai.com/v1" autocomplete="off">' +
      '<label for="jv-model">Model</label><input id="jv-model" placeholder="gpt-4o-mini" autocomplete="off">' +
      '<label for="jv-key">API key</label><input id="jv-key" type="password" placeholder="sk-… or xai-…" autocomplete="off">' +
      '<label><input type="checkbox" id="jv-useai" style="width:auto"> Use AI brain for questions the built-in commands don\'t cover</label>' +
      '<div class="jv-row"><button type="button" id="jv-save">Save</button><button type="button" id="jv-test">Test connection</button><button type="button" id="jv-forget" class="danger">Forget key</button></div>' +
      '<div class="note">Your key is stored only in this browser (localStorage) and sent only to the base URL above. It is never saved to the repo or the dashboard server. Anyone using this browser profile could read it, so use a restricted key and a shared/public computer is not recommended.</div>' +
      '</div>' +
      '<div class="jv-log" id="jv-log" aria-live="polite"></div>' +
      '<div class="jv-chips" id="jv-chips"></div>' +
      '<form class="jv-bar" id="jv-form"><button type="button" class="jv-mic" id="jv-mic" title="Speak to Jarvis">🎙</button>' +
      '<input id="jv-input" placeholder="Ask Jarvis… (try “help”)" autocomplete="off"><button id="jv-send">Send</button></form>';
    document.body.appendChild(el.fab);
    document.body.appendChild(el.panel);
    ['mode', 'voice', 'gear', 'close', 'settings', 'provider', 'base', 'model', 'key', 'useai', 'save', 'test', 'forget', 'log', 'chips', 'form', 'mic', 'input'].forEach(function (k) { el[k] = document.getElementById('jv-' + k); });

    Object.keys(PROVIDERS).forEach(function (k) { el.provider.appendChild(h('option', { value: k }, PROVIDERS[k].label)); });
    ['Briefing', 'Show pipeline', 'Open tasks', 'Approvals', 'Paper trades', 'Help'].forEach(function (c) {
      var b = h('button', { type: 'button' }, c);
      b.onclick = function () { handle(c); };
      el.chips.appendChild(b);
    });

    el.fab.onclick = toggle;
    el.close.onclick = toggle;
    el.gear.onclick = function () { fillSettings(); el.settings.classList.toggle('open'); };
    el.voice.onclick = function () { settings.speak = !settings.speak; storeSettings(); if (!settings.speak) stopSpeaking(); refreshHeader(); };
    el.provider.onchange = function () {
      var p = PROVIDERS[el.provider.value];
      el.base.value = p.baseUrl; el.model.value = p.model;
    };
    el.save.onclick = function () { readSettings(); sys(aiReady() ? 'AI brain saved and on (' + PROVIDERS[settings.provider].label + ', ' + effectiveModel() + ').' : 'Settings saved. AI brain is off — built-in commands only.'); el.settings.classList.remove('open'); };
    el.test.onclick = function () { readSettings(); testAi(); };
    el.forget.onclick = function () { settings.apiKey = ''; storeSettings(); el.key.value = ''; refreshHeader(); sys('API key removed from this browser.'); };
    el.form.onsubmit = function (e) { e.preventDefault(); var v = el.input.value.trim(); if (!v) return; el.input.value = ''; handle(v); };
    el.mic.onclick = toggleListening;
    document.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) { e.preventDefault(); toggle(); } });
    if (!Recognition) { el.mic.title = 'Voice input is not supported in this browser (try Chrome, Edge or Safari)'; el.mic.style.opacity = '.45'; }

    refreshHeader();
    restoreChat();
  }

  function fillSettings() {
    el.provider.value = settings.provider;
    el.base.value = settings.baseUrl || PROVIDERS[settings.provider].baseUrl;
    el.model.value = settings.model || PROVIDERS[settings.provider].model;
    el.key.value = settings.apiKey;
    el.useai.checked = settings.useAi;
  }
  function readSettings() {
    settings.provider = el.provider.value;
    settings.baseUrl = el.base.value.trim();
    settings.model = el.model.value.trim();
    settings.apiKey = el.key.value.trim();
    settings.useAi = el.useai.checked;
    storeSettings(); refreshHeader();
  }
  function refreshHeader() {
    el.mode.textContent = aiReady() ? 'AI brain: ' + PROVIDERS[settings.provider].label + ' · ' + effectiveModel() : 'Offline commands · AI brain off';
    el.voice.textContent = settings.speak ? '🔊' : '🔇';
  }
  function toggle() {
    var open = el.panel.classList.toggle('open');
    el.fab.setAttribute('aria-expanded', open);
    if (open) { el.input.focus(); scrollLog(); } else stopSpeaking();
  }
  function open() { if (!el.panel.classList.contains('open')) toggle(); }

  // ---------- chat log ----------
  var history = [];
  function scrollLog() { el.log.scrollTop = el.log.scrollHeight; }
  function addMsg(role, text, opts) {
    var cls = 'jv-msg ' + role + (opts && opts.ai ? ' ai' : '');
    var n = h('div', { 'class': cls }, text);
    el.log.appendChild(n); scrollLog();
    if (role !== 'sys') {
      history.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
      history = history.slice(-40);
      try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(history)); } catch (e) {}
    }
    return n;
  }
  function sys(text) { addMsg('sys', text); }
  function say(text, opts) { addMsg('bot', text, opts); speak(text); }
  function restoreChat() {
    var saved = [];
    try { saved = JSON.parse(sessionStorage.getItem(CHAT_KEY)) || []; } catch (e) {}
    if (saved.length) {
      saved.forEach(function (m) { addMsg(m.role === 'user' ? 'user' : 'bot', m.content); });
    } else {
      addMsg('bot', 'Good ' + partOfDay() + '. I am Jarvis, your Vanguard command assistant. Say or type “help” to see what I can do, or “briefing” for a status report.');
    }
  }
  function partOfDay() { var hr = new Date().getHours(); return hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'; }

  // ---------- speech ----------
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recog = null, listening = false;
  function toggleListening() {
    if (!Recognition) { sys('Voice input is not supported in this browser. Try Chrome, Edge or Safari.'); return; }
    if (listening) { recog && recog.stop(); return; }
    stopSpeaking();
    recog = new Recognition();
    recog.lang = navigator.language || 'en-US';
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    var finalText = '';
    recog.onstart = function () { listening = true; el.mic.classList.add('on'); el.fab.classList.add('listening'); el.input.placeholder = 'Listening…'; };
    recog.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      el.input.value = finalText + interim;
    };
    recog.onerror = function (e) { if (e.error !== 'no-speech' && e.error !== 'aborted') sys('Voice input error: ' + e.error + (e.error === 'not-allowed' ? ' (allow microphone access for this page)' : '')); };
    recog.onend = function () {
      listening = false; el.mic.classList.remove('on'); el.fab.classList.remove('listening'); el.input.placeholder = 'Ask Jarvis… (try “help”)';
      var t = (finalText || el.input.value).trim();
      if (t) { el.input.value = ''; handle(t); }
    };
    try { recog.start(); } catch (e) { sys('Could not start voice input: ' + e.message); }
  }
  function pickVoice() {
    if (!window.speechSynthesis) return null;
    var voices = speechSynthesis.getVoices();
    var prefs = [/Daniel/i, /en-GB.*Male/i, /Google UK English Male/i, /en-GB/i, /en[-_]/i];
    for (var i = 0; i < prefs.length; i++) {
      for (var j = 0; j < voices.length; j++) if (prefs[i].test(voices[j].name + ' ' + voices[j].lang)) return voices[j];
    }
    return voices[0] || null;
  }
  function speak(text) {
    if (!settings.speak || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(String(text).replace(/[•·]/g, ',').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '').slice(0, 1200));
      var v = pickVoice(); if (v) u.voice = v;
      u.rate = 1.02; u.pitch = 0.95;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function stopSpeaking() { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} }

  // ---------- dashboard helpers ----------
  function findSection(name) {
    var target = SECTIONS[name];
    if (!target) return null;
    var heads = document.querySelectorAll('.card h3, .card h2, .card strong');
    for (var i = 0; i < heads.length; i++) if (heads[i].textContent.indexOf(target) !== -1) return heads[i].closest('.card') || heads[i];
    return null;
  }
  function goTo(name) {
    var node = findSection(name);
    if (!node) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.add('jv-flash');
    setTimeout(function () { node.classList.remove('jv-flash'); }, 1800);
    return true;
  }
  function tradeStats(t) {
    var e = parseFloat(t.entry), s = parseFloat(t.stop), g = parseFloat(t.target);
    if (!isFinite(e) || !isFinite(s) || !isFinite(g)) return null;
    var risk = Math.abs(e - s), reward = Math.abs(g - e);
    var buy = String(t.side).toUpperCase() === 'BUY';
    var valid = buy ? (s < e && g > e) : (s > e && g < e);
    return { riskPips: risk * 10000, rewardPips: reward * 10000, rr: risk ? reward / risk : 0, valid: valid };
  }
  function summaryText() {
    var d = getDb(), open = d.tasks.filter(function (t) { return t.status !== 'Done'; });
    var approvals = d.tasks.filter(function (t) { return t.status === 'Needs approval'; });
    var total = d.opps.reduce(function (a, o) { return a + (Number(o.value) || 0); }, 0);
    var byDiv = { Cleaning: 0, Courier: 0 }, cleanTotal = 0;
    d.opps.forEach(function (o) { byDiv[o.division] = (byDiv[o.division] || 0) + 1; if (o.division === 'Cleaning') cleanTotal += Number(o.value) || 0; });
    var conn = (document.getElementById('connection') || {}).textContent || '';
    var lines = [
      'Vanguard briefing — ' + new Date().toLocaleString() + '.',
      '• Pipeline: ' + d.opps.length + ' opportunit' + (d.opps.length === 1 ? 'y' : 'ies') + ' (' + byDiv.Cleaning + ' cleaning, ' + byDiv.Courier + ' courier)' + (total ? ', about ' + money(total) + '/month estimated.' : '.'),
      '• Cleaning target: $15,000+/month' + (cleanTotal ? ' — cleaning pipeline estimates (' + money(cleanTotal) + ') would cover ' + Math.round(cleanTotal / 150) + '% of that if every one closed.' : '.'),
      '• Assignments: ' + open.length + ' open, ' + approvals.length + ' awaiting your approval.',
      '• Paper trades: ' + d.trades.length + ' logged (EUR/USD, simulation only).',
      '• Connection: ' + (conn || 'unknown') + '.'
    ];
    if (approvals.length) lines.push('Next step: review the approval queue — say “approvals”.');
    else if (!d.opps.length) lines.push('Next step: add your first opportunity, e.g. “add cleaning opportunity Pensacola federal building $4000”.');
    return lines.join('\n');
  }
  function helpText() {
    return [
      'Here is what I can do offline:',
      '• “briefing” / “status” — summary of the whole dashboard',
      '• “show pipeline” — list opportunities',
      '• “add cleaning opportunity <name> $<monthly>” (or courier)',
      '• “open tasks” — list assignments',
      '• “assign <agent> to <task>” e.g. assign Compliance to check SAM registration',
      '• “add task <description>” (goes to Executive)',
      '• “mark <task words> done” / “needs approval <task words>”',
      '• “approvals” — what is waiting on you',
      '• “paper trades” — positions with risk/reward',
      '• “go to trading / pipeline / tasks / approvals / metrics / activity”',
      '• “who is <agent>”, “agents”, “time”, “export”',
      '• “voice on/off”, “stop”, “clear chat”, “settings”',
      aiReady() ? 'AI brain is ON — anything else goes to ' + PROVIDERS[settings.provider].label + '. Start with “ask …” to force it.' : 'AI brain is OFF. Tap ⚙ to add your own OpenAI or xAI key for open-ended questions.',
      'I never submit bids, contact anyone, or place real trades.'
    ].join('\n');
  }
  function listOpps() {
    var d = getDb();
    if (!d.opps.length) return 'The pipeline is empty. Try “add courier opportunity hospital lab route $3500”.';
    return 'Opportunity pipeline (' + d.opps.length + '):\n' + d.opps.map(function (o, i) {
      return (i + 1) + '. ' + o.name + ' — ' + o.division + ', ' + (o.value ? money(o.value) + '/month est.' : 'value unverified');
    }).join('\n');
  }
  function listTasks() {
    var d = getDb(), open = d.tasks.filter(function (t) { return t.status !== 'Done'; });
    if (!d.tasks.length) return 'No assignments yet. Try “assign Contract Scout to find janitorial bids in Okaloosa”.';
    var done = d.tasks.length - open.length;
    return 'Open assignments (' + open.length + (done ? ', ' + done + ' done' : '') + '):\n' + (open.map(function (t, i) {
      return (i + 1) + '. ' + t.name + ' — ' + t.owner + ' · ' + t.status;
    }).join('\n') || 'All assignments are done.');
  }
  function listApprovals() {
    var a = getDb().tasks.filter(function (t) { return t.status === 'Needs approval'; });
    if (!a.length) return 'Nothing is waiting for your approval.';
    return a.length + ' item' + (a.length > 1 ? 's' : '') + ' awaiting approval:\n' + a.map(function (t, i) { return (i + 1) + '. ' + t.name + ' (' + t.owner + ')'; }).join('\n') + '\nSay “mark <task words> done” after you review one.';
  }
  function listTrades() {
    var d = getDb();
    if (!d.trades.length) return 'No paper trades logged. Use the Trading Lab form to journal one — it is simulation only.';
    var rrs = [];
    var lines = d.trades.map(function (t, i) {
      var s = tradeStats(t);
      if (s && s.valid) rrs.push(s.rr);
      return (i + 1) + '. ' + t.side + ' EUR/USD @ ' + t.entry + ' · SL ' + t.stop + ' · TP ' + t.target +
        (s ? ' → risk ' + s.riskPips.toFixed(1) + ' pips, reward ' + s.rewardPips.toFixed(1) + ' pips, R:R 1:' + s.rr.toFixed(2) + (s.valid ? '' : ' ⚠ stop/target on the wrong side for a ' + t.side) : '');
    });
    var avg = rrs.length ? rrs.reduce(function (a, b) { return a + b; }, 0) / rrs.length : 0;
    return 'Paper trades (' + d.trades.length + '):\n' + lines.join('\n') + (rrs.length ? '\nAverage R:R 1:' + avg.toFixed(2) + '. No live prices are fetched, so open P&L is not available.' : '');
  }
  function matchTask(words) {
    var q = words.toLowerCase().trim();
    if (!q) return null;
    var tasks = getDb().tasks;
    var n = parseInt(q.replace(/^#?/, ''), 10);
    if (/^#?\d+$/.test(q)) { var open = tasks.filter(function (t) { return t.status !== 'Done'; }); return open[n - 1] || null; }
    return tasks.find(function (t) { return t.name.toLowerCase().indexOf(q) !== -1; }) || null;
  }
  function normOwner(s) {
    var q = s.toLowerCase().replace(/\bagent\b/g, '').trim();
    for (var i = 0; i < OWNERS.length; i++) if (OWNERS[i].toLowerCase() === q || OWNERS[i].toLowerCase().indexOf(q) === 0 && q.length > 3) return OWNERS[i];
    if (/scout/.test(q) && /contract/.test(q)) return 'Contract Scout';
    if (/scout/.test(q) && /partner/.test(q)) return 'Partner Scout';
    if (/^(me|ceo|exec)/.test(q)) return 'Executive';
    return null;
  }

  // ---------- command router ----------
  function localCommand(raw) {
    var t = raw.trim(), q = t.toLowerCase().replace(/[.!?]+$/, '').replace(/^(hey |ok |okay )?jarvis[, ]*/, '').trim();
    var m;
    if (!q) return 'Yes? Say “help” for options.';
    if (/^(help|commands|what can you do|\?)/.test(q)) return helpText();
    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(q) && q.split(' ').length <= 3) return 'Good ' + partOfDay() + '. Ready when you are — say “briefing” for a status report.';
    if (/^(thanks|thank you)/.test(q)) return 'At your service.';
    if (/^(briefing|status|summary|summarize|sitrep|report|overview|dashboard summary)\b/.test(q) || /^(give me|what'?s) (a |the |my )?(briefing|status|summary)/.test(q)) return summaryText();
    if (/^(stop|quiet|silence|shut up)$/.test(q)) { stopSpeaking(); return null; }
    if (/^(voice|speech|talk) (on|enable)|^unmute/.test(q)) { settings.speak = true; storeSettings(); refreshHeader(); return 'Spoken replies on.'; }
    if (/^(voice|speech|talk) (off|disable)|^mute/.test(q)) { settings.speak = false; storeSettings(); refreshHeader(); stopSpeaking(); return 'Spoken replies off.'; }
    if (/^clear( the)? chat|^reset chat/.test(q)) { el.log.innerHTML = ''; history = []; try { sessionStorage.removeItem(CHAT_KEY); } catch (e) {} return 'Chat cleared.'; }
    if (/^(settings|api key|ai settings|set ?up ai|connect ai)/.test(q)) { fillSettings(); el.settings.classList.add('open'); return 'Settings are open. Pick OpenAI or xAI, paste your API key, and press Save.'; }
    if (/^(what time|time|date|what'?s the date|today)/.test(q)) return 'It is ' + new Date().toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '.';
    if (/^export/.test(q)) { var ex = document.getElementById('export'); if (ex) { ex.click(); return 'Exporting the dashboard data as JSON.'; } }

    // add opportunity: "add cleaning opportunity <name> $4000"
    if ((m = t.match(/^(?:add|new|track|create)\s+(?:a\s+|an\s+)?(cleaning|courier|janitorial|delivery)?\s*(?:opportunity|opp|contract|bid|solicitation)\s*[:\-]?\s*(.+)$/i))) {
      var div = /courier|delivery/i.test(m[1] || '') ? 'Courier' : /cleaning|janitorial/i.test(m[1] || '') ? 'Cleaning' : (/courier|delivery|route/i.test(m[2]) ? 'Courier' : 'Cleaning');
      var rest = m[2], value = '';
      var vm = rest.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:\/\s*(?:mo|month)|per month|a month|monthly)?\s*$/i);
      if (vm && (/\$/.test(vm[0]) || /month|mo\b|k/i.test(vm[0]))) { value = String(Math.round(parseFloat(vm[1].replace(/,/g, '')) * (vm[2] ? 1000 : 1))); rest = rest.slice(0, vm.index).trim(); }
      rest = rest.replace(/\s+(worth|at|for)$/i, '').trim();
      if (!rest) return 'What is the opportunity called? e.g. “add cleaning opportunity Navarre clinic $2500”.';
      getDb().opps.push({ id: newId(), division: div, name: rest, value: value });
      commit(); goTo('pipeline');
      return 'Added to the ' + div + ' pipeline: “' + rest + '”' + (value ? ' at ' + money(value) + '/month est.' : ' (value unverified).');
    }

    // assign: "assign <agent> to <task>"  /  "add task <task>" / "add task for <agent>: <task>"
    if ((m = t.match(/^(?:assign|have|ask|tell)\s+(?:the\s+)?(.+?)\s+(?:to|:)\s+(.+)$/i)) && normOwner(m[1])) {
      return addTask(normOwner(m[1]), m[2]);
    }
    if ((m = t.match(/^(?:add|new|create)\s+(?:a\s+)?task\s+(?:for\s+(.+?)\s*:\s*)?(.+)$/i))) {
      var owner = m[1] ? normOwner(m[1]) : 'Executive';
      return addTask(owner || 'Executive', m[2]);
    }

    // status changes
    if ((m = q.match(/^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(done|complete|completed|finished|open|needs approval|for approval)$/)) ||
        (m = q.match(/^(complete|finish|done with)\s+(.+)$/)) && (m = [m[0], m[2], 'done']) ||
        (m = q.match(/^(?:send|submit)\s+(.+?)\s+(?:for|to)\s+approval$/)) && (m = [m[0], m[1], 'needs approval']) ||
        (m = q.match(/^needs approval\s*:?\s+(.+)$/)) && (m = [m[0], m[1], 'needs approval']) ||
        (m = q.match(/^(?:approve|reopen)\s+(.+)$/)) && (m = [m[0], m[1], /^reopen/.test(q) ? 'open' : 'done'])) {
      var task = matchTask(m[1].replace(/^(task|the task)\s+/, ''));
      if (!task) return 'I could not find a task matching “' + m[1] + '”. Say “open tasks” to see them.';
      var st = /approval/.test(m[2]) ? 'Needs approval' : /open/.test(m[2]) ? 'Open' : 'Done';
      task.status = st; commit();
      return 'Marked “' + task.name + '” as ' + st + '.' + (st === 'Done' && /^approve/.test(q) ? ' (Recorded locally only — nothing was submitted.)' : '');
    }

    // lists
    if (/\b(approval|approvals|pending|waiting on me|needs my)\b/.test(q)) { goTo('approvals'); return listApprovals(); }
    if (/\b(pipeline|opportunit|contracts?|bids?|solicitations?)\b/.test(q) && !/\bwho\b/.test(q)) { goTo('pipeline'); return listOpps(); }
    if (/\b(tasks?|assignments?|to-?dos?|board)\b/.test(q)) { goTo('tasks'); return listTasks(); }
    if (/\b(trades?|positions?|trading|eur\/?usd|journal)\b/.test(q) && !/\bwho\b/.test(q)) { goTo('trading'); return listTrades(); }
    // navigation
    if ((m = q.match(/^(?:go to|goto|open|show me|scroll to|navigate to|take me to|jump to)\s+(?:the\s+)?([a-z]+)/))) {
      var key = m[1];
      if (key === 'settings') return localCommand('settings');
      if (SECTIONS[key] && goTo(key)) return 'Showing ' + SECTIONS[key] + '.';
    }

    if (/^(agents|list agents|who are the agents|team)$/.test(q)) return 'Agents: Contract Scout, Partner Scout, Financial, Compliance, Operations and Trading. All dashboard connections are pending — they are not running yet. Ask “who is compliance” for details.';
    if ((m = q.match(/^(?:who is|what is|what does|tell me about)\s+(?:the\s+)?(.+?)(?:\s+agent)?(?:\s+do)?$/))) {
      var k = Object.keys(AGENT_INFO).find(function (a) { return m[1].indexOf(a) !== -1 || a.indexOf(m[1]) === 0; });
      if (k) return AGENT_INFO[k];
      if (/jarvis|you/.test(m[1])) return 'I am Jarvis, the assistant built into Vanguard God\'s-Eye. ' + (aiReady() ? 'My AI brain is connected.' : 'I run offline; add an API key in ⚙ for an AI brain.');
    }
    if (/\b(connection|connected|server|sync)\b/.test(q)) { goTo('activity'); return ((document.getElementById('connection') || {}).textContent || 'Unknown') + ((document.getElementById('lastsync') || {}).textContent ? ' — ' + document.getElementById('lastsync').textContent : '') + '.'; }
    if ((m = q.match(/^(?:show|go to)\s+(.+)$/)) && SECTIONS[m[1]]) { goTo(m[1]); return 'Showing ' + SECTIONS[m[1]] + '.'; }
    return undefined; // not a built-in command
  }
  function addTask(owner, name) {
    name = name.trim().replace(/[.]$/, '');
    if (!name) return 'What should the task say?';
    getDb().tasks.push({ id: newId(), owner: owner, name: name, status: 'Open' });
    commit(); goTo('tasks');
    return 'Assigned to ' + owner + ': “' + name + '”. Status: Open. (The agent itself is not connected yet, so this is tracked on the board for now.)';
  }

  // ---------- AI brain ----------
  function systemPrompt() {
    var d = getDb();
    return 'You are JARVIS, the AI assistant inside "Vanguard God\'s-Eye", an AI command center for Vanguard, a small business with a Cleaning Division (recurring janitorial contracts, subcontractor-first, target $15,000+/month, Escambia, Santa Rosa, Okaloosa and Walton counties, Florida) and a Courier Division (recurring delivery contracts). ' +
      'The dashboard also has an EUR/USD paper-trading journal (simulation only, no live prices, no broker). Agents (Contract Scout, Partner Scout, Financial, Compliance, Operations, Trading) are planned but not connected. ' +
      'Workflow is approval-first: never claim you submitted bids, contacted anyone, or placed trades — you cannot. Do not give personalised financial advice; frame trading discussion as education/risk management. ' +
      'Be concise, confident and practical, with a light butler-like tone. Replies are often spoken aloud, so prefer short paragraphs and plain text (no markdown tables). ' +
      'The user can also use offline commands like "add cleaning opportunity <name> $<monthly>", "assign <agent> to <task>", "mark <task> done", "briefing"; suggest these when they would help. ' +
      'Current dashboard data (JSON): ' + JSON.stringify({ opportunities: d.opps, tasks: d.tasks, paperTrades: d.trades, now: new Date().toString() }).slice(0, 12000);
  }
  async function callAi(messages) {
    var res = await fetch(effectiveBase() + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
      body: JSON.stringify({ model: effectiveModel(), messages: messages, temperature: 0.4, max_tokens: 600 })
    });
    var body = await res.text(), json = null;
    try { json = JSON.parse(body); } catch (e) {}
    if (!res.ok) throw new Error((json && json.error && (json.error.message || json.error)) || ('HTTP ' + res.status));
    var c = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!c) throw new Error('The API returned no answer.');
    return String(c).trim();
  }
  async function askAi(text) {
    var thinking = addMsg('sys', 'Jarvis is thinking…');
    try {
      var msgs = [{ role: 'system', content: systemPrompt() }].concat(history.slice(-12, -1)).concat([{ role: 'user', content: text }]);
      var reply = await callAi(msgs);
      thinking.remove();
      say(reply, { ai: true });
    } catch (e) {
      thinking.remove();
      var msg = String(e && e.message || e);
      if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg += ' — the browser could not reach ' + effectiveBase() + '. Check the base URL and your connection (some providers block requests made directly from a web page).';
      say('I could not reach the AI brain: ' + msg + '\nBuilt-in commands still work — say “help”.');
    }
  }
  async function testAi() {
    if (!settings.apiKey) { sys('Paste an API key first.'); return; }
    sys('Testing ' + effectiveBase() + ' with model ' + effectiveModel() + '…');
    try {
      var r = await callAi([{ role: 'user', content: 'Reply with exactly: Jarvis online.' }]);
      sys('✓ Connected. The model replied: ' + r.slice(0, 120));
    } catch (e) { sys('✗ Test failed: ' + (e && e.message || e)); }
  }

  // ---------- entry point ----------
  function handle(text) {
    open();
    addMsg('user', text);
    var forceAi = /^ask\s+/i.test(text);
    var local = forceAi ? undefined : localCommand(text);
    if (local === null) return;            // handled silently (e.g. "stop")
    if (local !== undefined) { say(local); return; }
    if (aiReady()) { askAi(forceAi ? text.replace(/^ask\s+/i, '') : text); return; }
    say('I don\'t have a built-in command for that yet. Say “help” for what I can do offline, or tap ⚙ to connect an AI brain (your own OpenAI or xAI key) for open-ended questions.');
  }

  window.Jarvis = { ask: handle, open: open, toggle: toggle, command: localCommand, settings: function () { return { provider: settings.provider, model: effectiveModel(), baseUrl: effectiveBase(), aiReady: aiReady(), speak: settings.speak }; } };
  if (window.speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = function () {};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUi); else buildUi();
})();
