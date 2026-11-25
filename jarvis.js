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
  var OWNERS = ['Executive', 'Contract Scout', 'Partner Scout', 'Financial', 'Compliance', 'Operations', 'Trading', 'Trend Researcher', 'Scriptwriter', 'Voiceover Producer', 'Video Editor', 'Thumbnail & Title Designer', 'Upload/SEO Manager', 'Analytics'];
  var lastIdeas = [], lastScript = null;
  // command word -> [element id, label]
  var SECTIONS = {
    'overview': ['overview', 'Overview'], 'kpis': ['overview', 'Overview'], 'home': ['overview', 'Overview'], 'dashboard': ['overview', 'Overview'],
    'metrics': ['overview', 'Overview'], 'deadlines': ['overview', 'Overview'],
    'contracts': ['contracts', 'Contracts Management'], 'pipeline': ['contracts', 'Contracts Management'], 'opportunities': ['contracts', 'Contracts Management'],
    'trading': ['trading', 'Trading Lab'], 'trades': ['trading', 'Trading Lab'], 'market': ['trading', 'Trading Lab'], 'positions': ['trading', 'Trading Lab'],
    'agents': ['agents', 'Agents & Assignments'], 'tasks': ['taskform', 'Agent Assignment Board'], 'assignments': ['taskform', 'Agent Assignment Board'], 'board': ['taskform', 'Agent Assignment Board'],
    'approvals': ['approvals-sec', 'CEO Approval Queue'], 'approval': ['approvals-sec', 'CEO Approval Queue'],
    'youtube': ['swm', 'Street Wise Money'], 'swm': ['swm', 'Street Wise Money'], 'street': ['swm', 'Street Wise Money'], 'channel': ['swm', 'Street Wise Money'], 'videos': ['swm', 'Street Wise Money'], 'bible': ['yt-bible', 'Channel bible'],
    'activity': ['activity-sec', 'Agent Activity'], 'connection': ['activity-sec', 'Agent Activity'], 'log': ['activity-sec', 'Agent Activity']
  };
  var AGENT_INFO = {
    'contract scout': 'Contract Scout researches opportunities and deadlines. Dashboard connection is pending.',
    'partner scout': 'Partner Scout finds cleaning subcontractors and delivery carriers. Dashboard connection is pending.',
    'financial': 'The Financial Agent covers pricing, margin and working capital. Dashboard connection is pending.',
    'compliance': 'The Compliance Agent checks eligibility and requirements. Dashboard connection is pending.',
    'operations': 'The Operations Agent handles assignments and deadlines. Dashboard connection is pending.',
    'trading': 'The Trading Agent is EUR/USD paper trading only. Broker connection is disabled. Try the Trading Lab simulator: “start market”, then “buy 0.1 lots stop 20 target 40”.'
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
  function money(n) { n = Number(n) || 0; if (Math.abs(n) < 0.005) n = 0; return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: Math.abs(n) >= 1000 ? 0 : 2 }); }

  // ---------- settings ----------
  function loadSettings() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch (e) {}
    return {
      provider: s.provider || 'openai', baseUrl: s.baseUrl || '', model: s.model || '', apiKey: s.apiKey || '',
      speak: s.speak !== false, useAi: s.useAi !== false, persona: s.persona === 'streetwise' ? 'streetwise' : 'classic', full: !!s.full
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
      '<div class="jv-scan"></div>' +
      '<div class="jv-head"><div><div class="jv-title"><span>J</span>.A.R.V.I.S</div><div class="jv-sub" id="jv-mode"></div></div>' +
      '<div><button type="button" id="jv-persona" title="Switch personality: Classic / Street Wise"></button> ' +
      '<button type="button" id="jv-voice" title="Spoken replies on/off"></button> ' +
      '<button type="button" id="jv-full" title="Full-screen HUD">⛶</button> ' +
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
      '<div class="jv-core-wrap"><div class="jv-core" id="jv-core" role="button" tabindex="0" title="Tap the core to talk">' +
      '<svg class="jv-orb" viewBox="0 0 600 600" aria-hidden="true"><defs>' +
      '<radialGradient id="jv-core-grad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#e6f6ff"/><stop offset="25%" stop-color="#4fc3ff"/><stop offset="60%" stop-color="#1e6fff"/><stop offset="100%" stop-color="#0a1a40" stop-opacity="0"/></radialGradient>' +
      '<filter id="jv-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
      '<circle class="o-r1" cx="300" cy="300" r="250" fill="none" style="stroke:var(--jv-ring1)" stroke-width="4" stroke-dasharray="40 14" filter="url(#jv-glow)"/>' +
      '<circle class="o-thin" cx="300" cy="300" r="215" fill="none" stroke="#1e90ff" stroke-width="2"/>' +
      '<circle class="o-r2" cx="300" cy="300" r="190" fill="none" style="stroke:var(--jv-ring2)" stroke-width="6" stroke-dasharray="120 30 20 30" filter="url(#jv-glow)"/>' +
      '<g class="o-core"><circle cx="300" cy="300" r="160" fill="url(#jv-core-grad)" filter="url(#jv-glow)"/>' +
      '<circle cx="300" cy="300" r="160" fill="none" style="stroke:var(--jv-ring3)" stroke-width="3" filter="url(#jv-glow)"/>' +
      '<circle cx="300" cy="300" r="70" fill="#bfe9ff" opacity="0.85" filter="url(#jv-glow)"/></g></svg>' +
      '</div><div class="jv-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="jv-state" id="jv-state" aria-live="polite">Online</div></div>' +
      '<div class="jv-log" id="jv-log" aria-live="polite"></div>' +
      '<div class="jv-chips" id="jv-chips"></div>' +
      '<form class="jv-bar" id="jv-form"><button type="button" class="jv-mic" id="jv-mic" title="Speak to Jarvis">🎙</button>' +
      '<input id="jv-input" placeholder="Ask Jarvis… (try “help”)" autocomplete="off"><button id="jv-send">Send</button></form>';
    document.body.appendChild(el.fab);
    document.body.appendChild(el.panel);
    ['mode', 'persona', 'full', 'core', 'state', 'voice', 'gear', 'close', 'settings', 'provider', 'base', 'model', 'key', 'useai', 'save', 'test', 'forget', 'log', 'chips', 'form', 'mic', 'input'].forEach(function (k) { el[k] = document.getElementById('jv-' + k); });

    Object.keys(PROVIDERS).forEach(function (k) { el.provider.appendChild(h('option', { value: k }, PROVIDERS[k].label)); });
    ['Briefing', 'YouTube status', 'Video pipeline', 'Give me 5 video ideas', 'Approvals', 'Help'].forEach(function (c) {
      var b = h('button', { type: 'button' }, c);
      b.onclick = function () { handle(c); };
      el.chips.appendChild(b);
    });

    el.fab.onclick = toggle;
    el.persona.onclick = function () { setPersona(settings.persona === 'streetwise' ? 'classic' : 'streetwise', true); };
    el.full.onclick = function () { setFull(!el.panel.classList.contains('jv-full')); };
    el.core.onclick = toggleListening;
    el.core.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleListening(); } };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && el.panel.classList.contains('jv-full')) setFull(false); });
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

    applyPersona(); setFull(!!settings.full && window.innerWidth > 700, true); setState('idle');
    refreshHeader();
    restoreChat();
  }

  // ---------- HUD state, personality, full screen ----------
  var hudState = 'idle';
  var STATE_LABEL = { idle: 'Online', listening: 'Listening…', speaking: 'Speaking', thinking: 'Thinking…' };
  function setState(st) {
    hudState = st;
    ['idle', 'listening', 'speaking', 'thinking'].forEach(function (k) { el.panel.classList.toggle('st-' + k, k === st); });
    el.fab.classList.toggle('listening', st === 'listening');
    el.state.textContent = STATE_LABEL[st] + (st === 'idle' ? ' · ' + (settings.persona === 'streetwise' ? 'Street Wise' : 'Classic') : '');
  }
  function applyPersona() {
    var sw = settings.persona === 'streetwise';
    el.panel.classList.toggle('p-streetwise', sw); el.fab.classList.toggle('p-streetwise', sw);
    el.persona.textContent = sw ? '💵' : '💠';
    el.persona.title = 'Personality: ' + (sw ? 'Street Wise' : 'Classic') + ' — click to switch';
    if (hudState === 'idle') setState('idle');
  }
  function setPersona(p, announce) {
    settings.persona = p === 'streetwise' ? 'streetwise' : 'classic'; storeSettings(); applyPersona();
    if (announce) say(settings.persona === 'streetwise' ? 'Street Wise mode on. Real talk, practical moves, no fluff. What we on?' : 'Classic mode restored. At your service.');
  }
  function setFull(on, quiet) {
    el.panel.classList.toggle('jv-full', !!on);
    el.full.textContent = on ? '–' : '⛶'; el.full.title = on ? 'Exit full screen (Esc)' : 'Full-screen HUD';
    if (!quiet) { settings.full = !!on; storeSettings(); }
    scrollLog();
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
      addMsg('bot', settings.persona === 'streetwise' ? 'What’s good. Jarvis here, Street Wise mode. Say “youtube status”, “briefing”, or “help” — let’s get this money right.' : 'Good ' + partOfDay() + '. I am Jarvis, your Vanguard command assistant. Say or type “help” to see what I can do, or “briefing” for a status report.');
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
    recog.onstart = function () { listening = true; el.mic.classList.add('on'); setState('listening'); el.input.placeholder = 'Listening…'; };
    recog.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      el.input.value = finalText + interim;
    };
    recog.onerror = function (e) { if (e.error !== 'no-speech' && e.error !== 'aborted') sys('Voice input error: ' + e.error + (e.error === 'not-allowed' ? ' (allow microphone access for this page)' : '')); };
    recog.onend = function () {
      listening = false; el.mic.classList.remove('on'); if (hudState === 'listening') setState('idle'); el.input.placeholder = 'Ask Jarvis… (try “help”)';
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
      u.onstart = function () { setState('speaking'); };
      u.onend = u.onerror = function () { if (hudState === 'speaking') setState('idle'); };
      if (settings.persona === 'streetwise') { u.rate = 1.0; u.pitch = 0.85; }
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function stopSpeaking() { try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {} if (el.panel && hudState === 'speaking') setState('idle'); }

  // ---------- dashboard helpers ----------
  function V() { return window.Vanguard || null; }
  function findSection(name) {
    var s = SECTIONS[name];
    return s ? document.getElementById(s[0]) : null;
  }
  function goTo(name) {
    var node = findSection(name);
    if (!node) return false;
    var card = node.classList.contains('sec-title') ? node.nextElementSibling : (node.closest('.card') || node);
    node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (card && card.classList) { card.classList.add('jv-flash'); setTimeout(function () { card.classList.remove('jv-flash'); }, 1800); }
    return true;
  }
  function sectionLabel(name) { return SECTIONS[name] ? SECTIONS[name][1] : name; }
  function tradeStats(t) {
    var e = parseFloat(t.entry), s = parseFloat(t.stop), g = parseFloat(t.target);
    if (!isFinite(e) || !isFinite(s) || !isFinite(g)) return null;
    var risk = Math.abs(e - s), reward = Math.abs(g - e);
    var buy = String(t.side).toUpperCase() === 'BUY';
    var valid = buy ? (s < e && g > e) : (s > e && g < e);
    return { riskPips: risk * 10000, rewardPips: reward * 10000, rr: risk ? reward / risk : 0, valid: valid };
  }
  function summaryText() {
    var d = getDb(), v = V();
    var conn = (document.getElementById('connection') || {}).textContent || 'unknown';
    if (!v) return 'Dashboard data: ' + d.opps.length + ' opportunities, ' + d.tasks.length + ' tasks, ' + d.trades.length + ' paper trades.';
    var k = v.kpis(), dl = v.deadlines(7);
    var lines = [
      'Vanguard briefing — ' + new Date().toLocaleString() + '.',
      '• Contracts: ' + k.activeCount + ' active worth ' + money(k.pipeline) + '/mo (weighted ' + money(k.weighted) + '). Won ' + k.wonCount + ', lost ' + k.lostCount + (k.winRate != null ? ' — ' + k.winRate + '% win rate.' : '.'),
      '• Won revenue: ' + money(k.wonRevenue) + '/mo. Cleaning is at ' + k.targetPct + '% of the $15,000 target.',
      '• Deadlines this week: ' + (dl.length ? dl.map(function (x) { return x.name + ' (' + (x.d < 0 ? Math.abs(x.d) + 'd overdue' : x.d === 0 ? 'today' : 'in ' + x.d + 'd') + ')'; }).join('; ') : 'none') + '.',
      '• Tasks: ' + k.openTasks + ' open, ' + k.approvals + ' awaiting your approval.',
      '• Paper trading: balance ' + money(k.balance) + ', ' + k.openTrades + ' open (' + money(k.openPnl) + ' unrealised), ' + k.closedTrades + ' closed' + (k.tradeWinRate != null ? ', ' + k.tradeWinRate + '% winners' : '') + '. Sim price ' + v.sim.price().toFixed(5) + '.',
      '• Connection: ' + conn + '.'
    ];
    if (v.ytStatus) { var y = v.ytStatus(); lines.splice(lines.length - 1, 0, '• Street Wise Money: ' + y.inProduction + ' video' + (y.inProduction === 1 ? '' : 's') + ' in production, ' + y.byStage.Published + ' published' + (y.awaiting.length ? ', ' + y.awaiting.length + ' awaiting your upload approval' : '') + (y.readyToUpload.length ? ', ' + y.readyToUpload.length + ' approved and ready to upload' : '') + (y.stats.subscribers != null ? ', ' + Number(y.stats.subscribers).toLocaleString() + ' subscribers (as you entered)' : '') + '.'); }
    if (k.approvals) lines.push('Next step: review the approval queue — say “approvals”.');
    else if (dl.some(function (x) { return x.d < 0; })) lines.push('Next step: something is overdue — say “deadlines”.');
    else if (!d.opps.length) lines.push('Next step: add your first contract, e.g. “add cleaning opportunity Pensacola federal building $4000 due in 14 days”.');
    return lines.join('\n');
  }
  function helpText() {
    return [
      'Everything below works offline, while this page is open:',
      'OVERVIEW',
      '• “briefing” / “status” — full summary · “kpis” · “deadlines”',
      'CONTRACTS',
      '• “add cleaning opportunity <name> $<monthly> [due YYYY-MM-DD | due in N days]” (or courier)',
      '• “show pipeline” · “move <name> to bid prep / submitted / won / lost”',
      'TRADING SIM (paper money, simulated prices)',
      '• “start market” / “pause market” · “price”',
      '• “buy 0.2 lots stop 20 target 40” (pips) · “sell …”',
      '• “positions” · “close trade 1” · “close all” · “account”',
      '• “position size 1% 20 pips”',
      'STREET WISE MONEY (YouTube)',
      '• “youtube status” · “video pipeline” · “channel bible”',
      '• “add video idea <title> [about <topic>] [publish YYYY-MM-DD | in N days]”',
      '• “move <video> to script / voiceover / edit / thumbnail / approval / scheduled / published”',
      '• “approve video <video>” (required before Scheduled/Published)',
      '• “set subscribers 1200”, “set views 15000”, “set revenue 42”, “set videos published 3”',
      '• “assign Scriptwriter to …” (also Trend Researcher, Voiceover Producer, Video Editor, Thumbnail & Title Designer, Upload/SEO Manager, Analytics)',
      '• With the AI brain: “give me 5 video ideas [about credit]”, “write a script about …”, then “save idea 2”, “save all ideas”, “save script [to <video>]”',
      'AGENTS & TASKS',
      '• “assign <agent> to <task>” · “add task <task>” · “open tasks”',
      '• “send <task> for approval” · “mark <task> done” · “approvals”',
      '• “who is <agent>” · “agents”',
      'OTHER',
      '• “go to contracts / trading / agents / approvals / overview / activity”',
      '• “time”, “export”, “voice on/off”, “stop”, “clear chat”, “settings”',
      '• HUD: “street wise mode” / “classic mode”, “full screen” / “exit full screen” (or ⛶, Esc), tap the core to talk',
      aiReady() ? 'AI brain is ON — anything else goes to ' + PROVIDERS[settings.provider].label + '. Start with “ask …” to force it.' : 'AI brain is OFF. Tap ⚙ to add your own OpenAI or xAI key for open-ended questions.',
      'I never submit bids, contact anyone, or place real trades.'
    ].join('\n');
  }
  function listOpps() {
    var d = getDb();
    if (!d.opps.length) return 'The pipeline is empty. Try “add courier opportunity hospital lab route $3500”.';
    return 'Contract pipeline (' + d.opps.length + '):\n' + d.opps.map(function (o, i) {
      return (i + 1) + '. ' + o.name + ' — ' + o.division + ', ' + (o.stage || 'Lead') + ', ' + (o.value ? money(o.value) + '/mo' : 'value unverified') + (o.due ? ', due ' + o.due : '');
    }).join('\n');
  }
  function listTasks() {
    var d = getDb(), open = d.tasks.filter(function (t) { return t.status !== 'Done'; });
    if (!d.tasks.length) return 'No assignments yet. Try “assign Contract Scout to find janitorial bids in Okaloosa”.';
    var done = d.tasks.length - open.length;
    return 'Open assignments (' + open.length + (done ? ', ' + done + ' done' : '') + '):\n' + (open.map(function (t, i) {
      return (i + 1) + '. ' + t.name + ' — ' + t.owner + ' · ' + t.status + (t.due ? ' · due ' + t.due : '');
    }).join('\n') || 'All assignments are done.');
  }
  function listApprovals() {
    var a = getDb().tasks.filter(function (t) { return t.status === 'Needs approval'; });
    var vids = (getDb().videos || []).filter(function (x) { return x.stage === 'Approval' && !x.approved; });
    var vtxt = vids.length ? 'Street Wise Money videos awaiting upload approval:\n' + vids.map(function (x) { return '• ' + x.title; }).join('\n') + '\nSay “approve video <name>”.' : '';
    if (!a.length) return vtxt || 'Nothing is waiting for your approval.';
    if (vtxt) return vtxt + '\n' + listApprovalsTasks(a);
    return listApprovalsTasks(a);
  }
  function listApprovalsTasks(a) {
    return a.length + ' item' + (a.length > 1 ? 's' : '') + ' awaiting approval:\n' + a.map(function (t, i) { return (i + 1) + '. ' + t.name + ' (' + t.owner + ')'; }).join('\n') + '\nSay “mark <task words> done” after you review one.';
  }
  function openTradesList() { return getDb().trades.filter(function (t) { return t.status !== 'Closed'; }); }
  function listTrades() {
    var d = getDb(), v = V();
    if (!d.trades.length) return 'No paper trades yet. Say “start market”, then e.g. “buy 0.1 lots stop 20 target 40”.';
    var price = v ? v.sim.price() : null;
    var open = openTradesList(), closed = d.trades.filter(function (t) { return t.status === 'Closed'; });
    var out = [];
    if (open.length) {
      out.push('Open positions (sim price ' + (price ? price.toFixed(5) : '?') + '):');
      open.forEach(function (t, i) {
        var s = tradeStats(t);
        out.push((i + 1) + '. ' + t.side + ' ' + t.lots + ' lots @ ' + t.entry + ' · SL ' + t.stop + ' · TP ' + t.target +
          (v ? ' → ' + money(v.tradePnl(t, price)) + ' (' + v.tradePips(t, price).toFixed(1) + ' pips)' : '') +
          (s ? ', R:R 1:' + s.rr.toFixed(2) + (s.valid ? '' : ' ⚠ stop/target on the wrong side') : ''));
      });
    } else out.push('No open positions.');
    if (closed.length && v) {
      var k = v.kpis();
      out.push('Closed: ' + closed.length + ' trades, realised ' + money(k.realized) + (k.tradeWinRate != null ? ', ' + k.tradeWinRate + '% winners' : '') + '. Balance ' + money(k.balance) + '.');
    }
    return out.join('\n');
  }
  function matchTask(words) {
    var q = words.toLowerCase().trim();
    if (!q) return null;
    var tasks = getDb().tasks;
    var n = parseInt(q.replace(/^#?/, ''), 10);
    if (/^#?\d+$/.test(q)) { var open = tasks.filter(function (t) { return t.status !== 'Done'; }); return open[n - 1] || null; }
    return tasks.find(function (t) { return t.name.toLowerCase().indexOf(q) !== -1; }) || null;
  }
  function matchOpp(words) {
    var q = words.toLowerCase().replace(/^(the\s+)?(opportunity|contract|opp)\s+/, '').trim();
    if (!q) return null;
    var opps = getDb().opps;
    if (/^#?\d+$/.test(q)) return opps[parseInt(q.replace('#', ''), 10) - 1] || null;
    return opps.find(function (o) { return o.name.toLowerCase().indexOf(q) !== -1; }) ||
      opps.find(function (o) { return q.split(/\s+/).every(function (w) { return (o.name + ' ' + (o.agency || '')).toLowerCase().indexOf(w) !== -1; }); }) || null;
  }
  function normStage(s) {
    s = s.toLowerCase().trim();
    var map = { 'lead': 'Lead', 'qualifying': 'Qualifying', 'qualify': 'Qualifying', 'qualified': 'Qualifying', 'bid prep': 'Bid prep', 'bid': 'Bid prep', 'prep': 'Bid prep', 'preparing': 'Bid prep', 'submitted': 'Submitted', 'submit': 'Submitted', 'won': 'Won', 'win': 'Won', 'lost': 'Lost', 'lose': 'Lost' };
    return map[s] || null;
  }
  function parseDue(s) {
    var m;
    if ((m = s.match(/(\d{4}-\d{2}-\d{2})/))) return m[1];
    if ((m = s.match(/in\s+(\d+)\s+days?/i))) { var d = new Date(); d.setDate(d.getDate() + parseInt(m[1], 10)); return d.toISOString().slice(0, 10); }
    if (/tomorrow/i.test(s)) { var t = new Date(); t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10); }
    return '';
  }
  function normOwner(s) {
    var q = s.toLowerCase().replace(/\bagent\b/g, '').trim();
    for (var i = 0; i < OWNERS.length; i++) if (OWNERS[i].toLowerCase() === q || OWNERS[i].toLowerCase().indexOf(q) === 0 && q.length > 3) return OWNERS[i];
    if (/scout/.test(q) && /contract/.test(q)) return 'Contract Scout';
    if (/scout/.test(q) && /partner/.test(q)) return 'Partner Scout';
    if (/^(me|ceo|exec)/.test(q)) return 'Executive';
    if (/trend|research|topic/.test(q)) return 'Trend Researcher';
    if (/script|writer/.test(q)) return 'Scriptwriter';
    if (/voice|narrat|audio/.test(q)) return 'Voiceover Producer';
    if (/editor|editing|video edit/.test(q)) return 'Video Editor';
    if (/thumb|title|design/.test(q)) return 'Thumbnail & Title Designer';
    if (/upload|seo|publish/.test(q)) return 'Upload/SEO Manager';
    if (/analytic|stats/.test(q)) return 'Analytics';
    return null;
  }
  function tradingCommand(q) {
    var v = V(), m;
    if (!v) return undefined;
    if (/^(start|run|resume|play)\s+(the\s+)?(market|sim|simulation|feed|prices?)/.test(q)) { v.sim.start(); goTo('trading'); return 'Simulated EUR/USD market running from ' + v.sim.price().toFixed(5) + '. Remember, these are not real prices.'; }
    if (/^(pause|stop|halt)\s+(the\s+)?(market|sim|simulation|feed|prices?)/.test(q)) { v.sim.stop(); return 'Simulated market paused at ' + v.sim.price().toFixed(5) + '.'; }
    if (/^(price|quote|eur\/?usd|what'?s the price|current price)\b/.test(q) && !/\btrades?\b/.test(q)) return 'Simulated EUR/USD is ' + v.sim.price().toFixed(5) + (v.sim.running() ? ' and moving.' : ' (paused — say “start market”).');
    if ((m = q.match(/^(buy|sell|long|short)\b(.*)$/))) {
      var side = /buy|long/.test(m[1]) ? 'BUY' : 'SELL', rest = m[2];
      var lots = (rest.match(/([\d.]+)\s*lots?/) || [])[1] || '0.1';
      var stopP = parseFloat((rest.match(/(?:stop|sl)\s*(?:loss\s*)?(?:of\s*)?([\d.]+)/) || [])[1] || '20');
      var tgtP = parseFloat((rest.match(/(?:target|tp|take profit)\s*(?:of\s*)?([\d.]+)/) || [])[1] || String(stopP * 2));
      var p = v.sim.price(), dir = side === 'BUY' ? 1 : -1;
      var r = v.openTrade({ side: side, lots: lots, stop: p - dir * stopP * 0.0001, target: p + dir * tgtP * 0.0001 });
      if (r.error) return r.error;
      goTo('trading');
      return 'Paper ' + side + ' ' + r.lots + ' lots opened at ' + r.entry + ', stop ' + r.stop + ' (' + stopP + ' pips), target ' + r.target + ' (' + tgtP + ' pips). Risk ≈ ' + money(stopP * 10 * r.lots) + '.' + (v.sim.running() ? '' : ' The market is paused — say “start market” to watch it play out.');
    }
    if (/^close (all|everything)/.test(q)) {
      var open = openTradesList(); if (!open.length) return 'No open positions.';
      var total = 0; open.forEach(function (t) { var c = v.closeTrade(t.id); if (c) total += v.tradePnl(c); });
      return 'Closed ' + open.length + ' position' + (open.length > 1 ? 's' : '') + ' at ' + v.sim.price().toFixed(5) + ' for ' + money(total) + '.';
    }
    if ((m = q.match(/^close (?:trade|position)?\s*#?(\d+)/))) {
      var t = openTradesList()[parseInt(m[1], 10) - 1]; if (!t) return 'There is no open position #' + m[1] + '. Say “positions” to see them.';
      var c2 = v.closeTrade(t.id); return 'Closed ' + c2.side + ' at ' + c2.exit + ' for ' + money(v.tradePnl(c2)) + '.';
    }
    if (/^(account|balance|equity|p&?l|pnl|profit)\b/.test(q)) { var k = v.kpis(); return 'Paper account: balance ' + money(k.balance) + ', open P&L ' + money(k.openPnl) + ', equity ' + money(k.balance + k.openPnl) + '. ' + k.closedTrades + ' closed trades' + (k.tradeWinRate != null ? ', ' + k.tradeWinRate + '% winners' : '') + '.'; }
    if ((m = q.match(/^(?:position size|size|how many lots)\D*([\d.]+)\s*%?\D+([\d.]+)\s*pips?/))) {
      var lotsOut = v.positionSize(parseFloat(m[1]), parseFloat(m[2]));
      return 'Risking ' + m[1] + '% of ' + money(v.kpis().balance) + ' with a ' + m[2] + '-pip stop → about ' + lotsOut.toFixed(2) + ' lots (≈ $' + (lotsOut * 10).toFixed(2) + ' per pip).';
    }
    return undefined;
  }

  // ---------- Street Wise Money ----------
  var VSTAGE_WORDS = { 'idea': 'Idea', 'ideas': 'Idea', 'script': 'Script', 'scripting': 'Script', 'voiceover': 'Voiceover', 'voice over': 'Voiceover', 'voice': 'Voiceover', 'vo': 'Voiceover', 'edit': 'Edit', 'editing': 'Edit', 'thumbnail': 'Thumbnail', 'thumbnails': 'Thumbnail', 'approval': 'Approval', 'review': 'Approval', 'scheduled': 'Scheduled', 'schedule': 'Scheduled', 'published': 'Published', 'publish': 'Published', 'live': 'Published' };
  function matchVideo(words) {
    var q = words.toLowerCase().replace(/^(the\s+)?(video|episode|ep)\s+/, '').replace(/["“”]/g, '').trim();
    if (!q) return null;
    var vids = getDb().videos || [];
    var num = q.match(/^#?0*(\d+)$/);
    if (num) { var byEp = vids.find(function (v) { return new RegExp('episode 0*' + num[1] + '\\b', 'i').test(v.topic + ' ' + v.title); }); return byEp || vids[parseInt(num[1], 10) - 1] || null; }
    return vids.find(function (v) { return v.title.toLowerCase().indexOf(q) !== -1; }) ||
      vids.find(function (v) { return q.split(/\s+/).every(function (w) { return (v.title + ' ' + (v.topic || '')).toLowerCase().indexOf(w) !== -1; }); }) || null;
  }
  function ytStatusText() {
    var v = V(), y = v.ytStatus(), st = y.stats;
    var lines = ['Street Wise Money (@streetwisemoney):'];
    lines.push('• Pipeline: ' + v.VIDEO_STAGES.map(function (s) { return s + ' ' + y.byStage[s]; }).join(' · ') + '.');
    if (y.awaiting.length) lines.push('• Awaiting your upload approval: ' + y.awaiting.map(function (x) { return x.title; }).join('; ') + '.');
    if (y.readyToUpload.length) lines.push('• Approved and ready to upload: ' + y.readyToUpload.map(function (x) { return x.title; }).join('; ') + '.');
    if (y.next) lines.push('• Next target release: ' + y.next.title + ' on ' + y.next.publish + '.');
    lines.push(st.updated ? '• Stats you entered (' + new Date(st.updated).toLocaleDateString() + '): ' + [['subscribers', 'subscribers'], ['views', 'views'], ['published', 'videos published']].map(function (f) { return (st[f[0]] != null ? Number(st[f[0]]).toLocaleString() : '—') + ' ' + f[1]; }).join(', ') + (st.revenue != null ? ', ' + money(st.revenue) + ' revenue (28 days)' : '') + '.' : '• Channel stats: not entered yet — say “set subscribers 120” etc. I don’t pull live YouTube numbers.');
    lines.push('• Open channel tasks: ' + y.ytTasks + '. Cadence goal: 2 long videos (Tue & Fri) + 3–5 Shorts per week.');
    return lines.join('\n');
  }
  function ytCommand(q, t) {
    var v = V(), m;
    if (!v || !v.ytStatus) return undefined;
    if (/^(youtube|yt|channel|street ?wise( money)?|swm)\s*(status|update|report|summary|stats)?$/.test(q) || /^how'?s (the )?(channel|youtube)/.test(q)) { goTo('swm'); return ytStatusText(); }
    if (/^(video pipeline|videos|content pipeline|show videos|list videos|youtube pipeline)$/.test(q)) {
      goTo('swm'); var vids = getDb().videos;
      return vids.length ? 'Video pipeline (' + vids.length + '):\n' + vids.map(function (x, i) { return (i + 1) + '. ' + x.title + ' — ' + x.stage + (x.stage === 'Approval' ? (x.approved ? ' ✅ approved' : ' ⏳ needs approval') : '') + (x.publish ? ', target ' + x.publish : '') + (x.topic ? ' · ' + x.topic : ''); }).join('\n') : 'No videos yet. Try “add video idea Credit score myths about credit”.';
    }
    if (/^(channel bible|bible|brand guide|style guide)$/.test(q)) { goTo('bible'); var b = v.CHANNEL_BIBLE; return 'Channel bible — ' + b.handle + '\nMission: ' + b.mission + '\nAudience: ' + b.audience + '\nTone: ' + b.tone + '\nFormula: ' + b.formula + '\nCadence: ' + b.cadence + '\nRule: ' + b.rule; }
    // add video idea
    if ((m = t.match(/^(?:add|new|create|save)\s+(?:a\s+)?(?:youtube\s+)?(?:video\s+idea|video|idea)\s*[:\-]?\s*(.+)$/i)) && !/^\d+$/.test(m[1].trim()) && !/^(ideas?)\b/i.test(m[1])) {
      var rest = m[1].trim(), topic = '', publish = '';
      var pm = rest.match(/\s+(?:publish(?:ing)?|release|due|on)\s+(?:on\s+)?(\d{4}-\d{2}-\d{2}|in\s+\d+\s+days?|tomorrow)$/i);
      if (pm) { publish = parseDue(pm[1]); rest = rest.slice(0, pm.index).trim(); }
      var tm = rest.match(/\s+(?:about|topic|on|pillar)\s*:?\s+(.+)$/i);
      if (tm) { topic = tm[1].trim(); rest = rest.slice(0, tm.index).trim(); }
      rest = rest.replace(/^["“]|["”]$/g, '');
      var nv = v.addVideo({ title: rest, topic: topic, publish: publish });
      if (!nv) return 'What is the video called?';
      goTo('swm');
      return 'Added to the Street Wise Money pipeline as an Idea: “' + nv.title + '”' + (topic ? ' (' + topic + ')' : '') + (publish ? ', target publish ' + publish : '') + '. Next: “assign Scriptwriter to script ' + nv.title + '” or “write a script about ' + (topic || nv.title) + '”.';
    }
    // approve video
    if ((m = q.match(/^(?:approve|ok|okay|greenlight)\s+(?:the\s+)?(?:video|episode|upload(?: of)?)\s+(.+)$/)) || (m = q.match(/^approve\s+(.+?)\s+(?:for upload|upload)$/))) {
      var av = matchVideo(m[1]); if (!av) return 'I could not find a video matching “' + m[1] + '”. Say “video pipeline” to see them.';
      if (av.stage !== 'Approval' && v.VIDEO_STAGES.indexOf(av.stage) < v.VIDEO_STAGES.indexOf('Approval')) v.setVideoStage(av.id, 'Approval');
      v.approveVideo(av.id, true); goTo('swm');
      return 'Approved “' + av.title + '” for upload — recorded on the dashboard. I can’t upload to YouTube myself; publish it in YouTube Studio, then say “move ' + av.title.split(':')[0].toLowerCase() + ' to published”.';
    }
    if ((m = q.match(/^(?:unapprove|revoke approval(?: for)?|withdraw approval(?: for)?)\s+(?:the\s+)?(?:video\s+)?(.+)$/))) {
      var uv = matchVideo(m[1]); if (!uv) return 'I could not find that video.'; v.approveVideo(uv.id, false); return 'Approval withdrawn for “' + uv.title + '”.';
    }
    // move video stage
    if ((m = q.match(/^(?:move|set|change|advance|push|mark)\s+(.+?)\s+(?:to|as|stage to|into)\s+(idea|script|scripting|voice ?over|voice|vo|edit|editing|thumbnails?|approval|review|scheduled|schedule|published|publish|live)$/)) ||
        (m = q.match(/^(?:mark\s+)?(.+?)\s+(?:as\s+)?(scheduled|published)$/))) {
      var mv = matchVideo(m[1]);
      if (mv) {
        var stg = VSTAGE_WORDS[m[2].replace(/\s+/, ' ')] || VSTAGE_WORDS[m[2].replace(/\s+/g, '')];
        var res = v.setVideoStage(mv.id, stg); goTo('swm');
        if (res && res.blocked) return '🔒 “' + mv.title + '” needs your approval before it can be ' + stg + '. I parked it in Approval. Say “approve video ' + mv.title.split(':')[0].toLowerCase() + '” when you’re ready.';
        return '“' + mv.title + '” moved to ' + stg + '.' + (stg === 'Published' ? ' Nice — update your numbers any time with “set subscribers …”.' : '');
      }
    }
    // manual KPIs
    if ((m = q.match(/^(?:set|update|log|record)\s+(?:my\s+)?(?:youtube\s+|channel\s+)?(subscribers?|subs|views|total views|videos published|published videos|published|revenue|earnings)\s*(?:to|=|:|at)?\s*\$?([\d,.]+)\s*(k|m)?$/))) {
      var field = /sub/.test(m[1]) ? 'subscribers' : /view/.test(m[1]) ? 'views' : /publish/.test(m[1]) ? 'published' : 'revenue';
      var num2 = parseFloat(m[2].replace(/,/g, '')) * (m[3] === 'k' ? 1000 : m[3] === 'm' ? 1e6 : 1);
      var o = {}; o[field] = num2; v.updateYt(o); goTo('swm');
      return 'Recorded ' + (field === 'revenue' ? '$' + num2.toFixed(2) + ' revenue (last 28 days)' : Number(num2).toLocaleString() + ' ' + (field === 'published' ? (num2 === 1 ? 'video published' : 'videos published') : field)) + ' for Street Wise Money (entered by you).';
    }
    // save AI output
    if ((m = q.match(/^(?:save|add)\s+(?:video\s+)?idea\s*#?(\d+)$/))) {
      var idea = lastIdeas[parseInt(m[1], 10) - 1]; if (!idea) return lastIdeas.length ? 'There are only ' + lastIdeas.length + ' ideas in the last list.' : 'Ask me for ideas first, e.g. “give me 5 video ideas about credit”.';
      var sv = v.addVideo({ title: idea.title, topic: idea.topic }); goTo('swm'); return 'Saved idea ' + m[1] + ' to the pipeline: “' + sv.title + '”.';
    }
    if (/^(?:save|add) all (?:video )?ideas$/.test(q)) {
      if (!lastIdeas.length) return 'Ask me for ideas first, e.g. “give me 5 video ideas”.';
      lastIdeas.forEach(function (i2) { v.addVideo({ title: i2.title, topic: i2.topic }); }); goTo('swm');
      var n = lastIdeas.length; lastIdeas = []; return 'Saved ' + n + ' ideas to the Idea column.';
    }
    if ((m = q.match(/^save (?:the |that )?script(?:\s+(?:to|for|on)\s+(.+))?$/))) {
      if (!lastScript) return 'There is no script to save yet. Say “write a script about …” (needs the AI brain).';
      var target = m[1] ? matchVideo(m[1]) : (getDb().videos || []).find(function (x) { return x.title.toLowerCase() === lastScript.topic.toLowerCase(); });
      if (m[1] && !target) return 'I could not find a video matching “' + m[1] + '”.';
      if (!target) target = v.addVideo({ title: lastScript.topic.charAt(0).toUpperCase() + lastScript.topic.slice(1), topic: 'Script by Jarvis', stage: 'Script' });
      v.setVideoScript(target.id, lastScript.text);
      if (target.stage === 'Idea') v.setVideoStage(target.id, 'Script');
      goTo('swm'); return 'Script saved to “' + target.title + '” (stage: Script). Open it with the 📝 button on its card.';
    }
    // AI-powered content
    if ((m = q.match(/^(?:give me|generate|brainstorm|suggest|come up with|i need)\s+(\d+)?\s*(?:new\s+|more\s+|youtube\s+|video\s+)*(?:video\s+)?(?:ideas?|topics?)(?:\s+(?:about|on|for)\s+(.+))?$/))) {
      var count = Math.min(10, parseInt(m[1] || '5', 10)), about = m[2] || '';
      if (!aiReady()) return offlineIdeas(count, about);
      askAi('Give me ' + count + ' new long-form video ideas for Street Wise Money' + (about ? ' about ' + about : '') + '. Use the channel bible. Format each as one line: "N. Title — pillar — one-sentence angle". Avoid ideas already in the pipeline. No intro or outro text.', {
        maxTokens: 700, speakText: 'Here are ' + count + ' ideas. Say save idea and a number to add one to the pipeline.',
        onReply: function (r) { lastIdeas = parseIdeas(r); return r + (lastIdeas.length ? '\n\nSay “save idea 2” or “save all ideas” to add them to the pipeline.' : ''); } });
      return null;
    }
    if ((m = t.match(/^(?:write|draft|create|generate)\s+(?:me\s+)?(?:a\s+|the\s+)?(?:(short|shorts|long|long-form)\s+)?(?:youtube\s+|video\s+)?script\s+(?:about|on|for)\s+(.+)$/i))) {
      var isShort = /short/i.test(m[1] || ''), topic2 = m[2].trim().replace(/[.?!]$/, '');
      if (!aiReady()) return offlineScriptOutline(topic2, isShort);
      askAi((isShort ? 'Write a 45–60 second YouTube Shorts voiceover script' : 'Write a complete 6–8 minute long-form YouTube voiceover script (about 1,000–1,200 words)') + ' for Street Wise Money about: ' + topic2 + '. Follow the channel formula exactly with labelled sections: Hook, Problem, Explanation, Example, Action plan, Recap, plus a short subscribe call to action. Written to be spoken by the avatar host in a confident, smooth, urban, practical voice. Relatable examples with realistic numbers. No fake wealth promises, no personalised financial advice; include a one-line "educational, not financial advice" note at the end. Then add 3 title options and a thumbnail text idea.', {
        maxTokens: isShort ? 600 : 2200, speakText: 'Your script about ' + topic2 + ' is ready in the chat. Say save script to keep it with a video.',
        onReply: function (r) { lastScript = { topic: topic2, text: r }; return r + '\n\nSay “save script” (or “save script to <video>”) to attach it to the pipeline.'; } });
      return null;
    }
    return undefined;
  }
  function parseIdeas(text) {
    return String(text).split(/\n+/).map(function (l) { var mm = l.match(/^\s*\d+[.)]\s*(.+)$/); if (!mm) return null; var parts = mm[1].replace(/\*\*/g, '').split(/\s+[—–-]\s+/); return { title: parts[0].replace(/^["“]|["”]$/g, '').trim(), topic: (parts[1] || '').trim() }; }).filter(Boolean).slice(0, 10);
  }
  function offlineIdeas(count, about) {
    var bank = [
      ['How Credit Scores Really Work (And How to Raise Yours)', 'Credit & personal finance'], ['The 50/30/20 Budget for Real Life', 'Saving & budgeting'],
      ['5 Side Hustles You Can Start This Weekend With Under $100', 'Entrepreneurship'], ['Renting vs Buying: The Math Nobody Shows You', 'Financial literacy'],
      ['Why Your Paycheck Disappears (And How to Stop It)', 'Financial literacy'], ['Building an Emergency Fund on a Small Income', 'Saving & budgeting'],
      ['Credit Card Traps That Keep Young Adults in Debt', 'Credit & personal finance'], ['How to Register Your First LLC Step by Step', 'Entrepreneurship'],
      ['Index Funds Explained Like You’re Busy', 'Building wealth'], ['Buy Now, Pay Later: Smart or Trap?', 'Financial literacy'],
      ['How to Negotiate a Raise (Scripts That Work)', 'Building wealth'], ['Business Credit vs Personal Credit', 'Entrepreneurship']
    ];
    var existing = (getDb().videos || []).map(function (x) { return x.title.toLowerCase(); });
    var a = (about || '').toLowerCase();
    var pick = bank.filter(function (b) { return existing.indexOf(b[0].toLowerCase()) === -1 && (!a || (b[0] + ' ' + b[1]).toLowerCase().indexOf(a.split(' ')[0]) !== -1); });
    if (pick.length < count) pick = pick.concat(bank.filter(function (b) { return pick.indexOf(b) === -1 && existing.indexOf(b[0].toLowerCase()) === -1; }));
    pick = pick.slice(0, count);
    lastIdeas = pick.map(function (b) { return { title: b[0], topic: b[1] }; });
    return 'AI brain is off, so here are ' + pick.length + ' starter ideas from my built-in list (tap ⚙ to add a key for fresh, trend-aware ideas):\n' + pick.map(function (b, i) { return (i + 1) + '. ' + b[0] + ' — ' + b[1]; }).join('\n') + '\n\nSay “save idea 2” or “save all ideas”.';
  }
  function offlineScriptOutline(topic, isShort) {
    return 'AI brain is off, so here is the Street Wise Money outline for “' + topic + '” to fill in (tap ⚙ and add an OpenAI or xAI key and I’ll write the full script):\n' +
      '1. HOOK (0:00–0:15): a relatable money moment about ' + topic + '.\n2. PROBLEM: why this keeps people stuck.\n3. EXPLANATION: how it actually works, in plain words.\n4. EXAMPLE: a realistic story with real numbers.\n5. ACTION PLAN: 3 steps the viewer can do this week.\n6. RECAP + CTA: one-line summary, “subscribe to Street Wise Money”.\n' +
      (isShort ? 'Shorts: keep it to Hook → one tip → CTA, under 60 seconds.' : 'Long-form target: 6–12 minutes. Cut 3–5 Shorts from the Example and Action plan.') + '\nEducational, not financial advice.';
  }

  // ---------- command router ----------
  function localCommand(raw) {
    var t = raw.trim(), q = t.toLowerCase().replace(/[.!?]+$/, '').replace(/^(hey |ok |okay )?jarvis[, ]*/, '').trim();
    var m, v = V();
    if (!q) return 'Yes? Say “help” for options.';
    if (/^(help|commands|what can you do|\?)/.test(q)) return helpText();
    if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(q) && q.split(' ').length <= 3) return 'Good ' + partOfDay() + '. Ready when you are — say “briefing” for a status report.';
    if (/^(thanks|thank you)/.test(q)) return settings.persona === 'streetwise' ? 'Anytime. Stay street wise.' : 'At your service.';
    if (/^(street ?wise|money|green)\s+(mode|personality|persona)( on)?$|^(switch to|go|be)\s+street ?wise$/.test(q)) { setPersona('streetwise'); return 'Street Wise mode on. Real talk, practical moves, no fluff. What we on?'; }
    if (/^(classic|normal|default|blue)\s+(mode|personality|persona)( on)?$|^(switch to|go|be)\s+classic$/.test(q)) { setPersona('classic'); return 'Classic mode restored. At your service.'; }
    if (/^(switch|change|toggle)\s+(personality|persona|mode)$/.test(q)) { setPersona(settings.persona === 'streetwise' ? 'classic' : 'streetwise'); return settings.persona === 'streetwise' ? 'Street Wise mode on.' : 'Classic mode on.'; }
    if (/^(full ?screen|expand|hud mode|maximi[sz]e)$/.test(q)) { setFull(true); return 'Full-screen HUD engaged. Press Esc to exit.'; }
    if (/^(exit full ?screen|minimi[sz]e|compact|small mode|shrink)$/.test(q)) { setFull(false); return 'Back to compact mode.'; }
    if (/^(briefing|status|summary|summarize|sitrep|report|overview|dashboard summary)$/.test(q) || /^(give me|what'?s) (a |the |my )?(briefing|status|summary)/.test(q)) { goTo('overview'); return summaryText(); }
    if (/^(kpis?|metrics|numbers|scoreboard)$/.test(q) && v) { var k = v.kpis(); goTo('overview'); return 'KPIs: active pipeline ' + money(k.pipeline) + '/mo · weighted ' + money(k.weighted) + ' · won ' + money(k.wonRevenue) + '/mo (' + k.targetPct + '% of cleaning target) · win rate ' + (k.winRate == null ? '—' : k.winRate + '%') + ' · ' + k.openTasks + ' open tasks · paper equity ' + money(k.balance + k.openPnl) + '.'; }
    if (/^(deadlines?|what'?s due|due soon|upcoming)/.test(q) && v) { var dl = v.deadlines(21); goTo('overview'); return dl.length ? 'Due in the next 21 days:\n' + dl.map(function (x, i) { return (i + 1) + '. ' + x.name + ' — ' + x.type + ', ' + x.who + ', ' + x.due + ' (' + (x.d < 0 ? Math.abs(x.d) + ' days overdue' : x.d === 0 ? 'today' : 'in ' + x.d + ' days') + ')'; }).join('\n') : 'Nothing is due in the next 21 days.'; }
    if (/^(stop|quiet|silence|shut up)$/.test(q)) { stopSpeaking(); return null; }
    if (/^(voice|speech|talk) (on|enable)|^unmute/.test(q)) { settings.speak = true; storeSettings(); refreshHeader(); return 'Spoken replies on.'; }
    if (/^(voice|speech|talk) (off|disable)|^mute/.test(q)) { settings.speak = false; storeSettings(); refreshHeader(); stopSpeaking(); return 'Spoken replies off.'; }
    if (/^clear( the)? chat|^reset chat/.test(q)) { el.log.innerHTML = ''; history = []; try { sessionStorage.removeItem(CHAT_KEY); } catch (e) {} return 'Chat cleared.'; }
    if (/^(settings|api key|ai settings|set ?up ai|connect ai)/.test(q)) { fillSettings(); el.settings.classList.add('open'); return 'Settings are open. Pick OpenAI or xAI, paste your API key, and press Save.'; }
    if (/^(what time|time|date|what'?s the date|today)$/.test(q)) return 'It is ' + new Date().toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '.';
    if (/^export/.test(q)) { var ex = document.getElementById('export'); if (ex) { ex.click(); return 'Exporting the dashboard data as JSON.'; } }

    var yc = ytCommand(q, t);
    if (yc !== undefined) return yc;
    var tr = tradingCommand(q);
    if (tr !== undefined) return tr;

    // add opportunity: "add cleaning opportunity <name> $4000 due in 10 days"
    if ((m = t.match(/^(?:add|new|track|create)\s+(?:a\s+|an\s+)?(cleaning|courier|janitorial|delivery)?\s*(?:opportunity|opp|contract|bid|solicitation)\s*[:\-]?\s*(.+)$/i))) {
      var div = /courier|delivery/i.test(m[1] || '') ? 'Courier' : /cleaning|janitorial/i.test(m[1] || '') ? 'Cleaning' : (/courier|delivery|route/i.test(m[2]) ? 'Courier' : 'Cleaning');
      var rest = m[2], value = '', due = '';
      var dm = rest.match(/\s+(?:due|deadline|by)\s+(.+)$/i);
      if (dm) { due = parseDue(dm[1]); rest = rest.slice(0, dm.index).trim(); }
      var vm = rest.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:\/\s*(?:mo|month)|per month|a month|monthly)?\s*$/i);
      if (vm && (/\$/.test(vm[0]) || /month|mo\b|k/i.test(vm[0]))) { value = String(Math.round(parseFloat(vm[1].replace(/,/g, '')) * (vm[2] ? 1000 : 1))); rest = rest.slice(0, vm.index).trim(); }
      rest = rest.replace(/\s+(worth|at|for)$/i, '').trim();
      if (!rest) return 'What is the opportunity called? e.g. “add cleaning opportunity Navarre clinic $2500”.';
      if (v) v.addOpp({ division: div, name: rest, value: value, due: due });
      else { getDb().opps.push({ id: newId(), division: div, name: rest, value: value, due: due, stage: 'Lead' }); commit(); }
      goTo('contracts');
      return 'Added to the ' + div + ' pipeline as a Lead: “' + rest + '”' + (value ? ' at ' + money(value) + '/month est' : ' (value unverified)') + (due ? ', due ' + due : '') + '.';
    }
    // move opportunity stage: "move navarre to submitted", "mark navarre won", "we won navarre"
    if ((m = q.match(/^(?:move|set|change|advance)\s+(.+?)\s+(?:to|stage to|as)\s+(lead|qualifying|qualified|bid prep|bid|submitted|won|lost)$/)) ||
        (m = q.match(/^(?:mark\s+)?(.+?)\s+(?:as\s+)?(won|lost|submitted)$/)) && matchOpp(m[1]) ||
        (m = q.match(/^(?:we\s+)?(won|lost|submitted)\s+(?:the\s+)?(.+)$/)) && (m = [m[0], m[2], m[1]]) && matchOpp(m[1])) {
      var o = matchOpp(m[1]), st0 = normStage(m[2]);
      if (o && st0 && v) { v.setStage(o.id, st0); goTo('contracts'); return '“' + o.name + '” moved to ' + st0 + '.' + (st0 === 'Won' ? ' Congratulations — recorded locally.' : st0 === 'Submitted' ? ' (Recorded only — I did not submit anything.)' : ''); }
      if (!o && /^(move|set|change|advance)/.test(q)) return 'I could not find a contract matching “' + m[1] + '”. Say “show pipeline” to see them.';
    }

    // assign: "assign <agent> to <task>"  /  "add task <task>" / "add task for <agent>: <task>"
    if ((m = t.match(/^(?:assign|have|ask|tell)\s+(?:the\s+)?(.+?)\s+(?:to|:)\s+(.+)$/i)) && normOwner(m[1])) {
      return addTask(normOwner(m[1]), m[2]);
    }
    if ((m = t.match(/^(?:add|new|create)\s+(?:a\s+)?task\s+(?:for\s+(.+?)\s*:\s*)?(.+)$/i))) {
      var owner = m[1] ? normOwner(m[1]) : 'Executive';
      return addTask(owner || 'Executive', m[2]);
    }

    // task status changes
    if ((m = q.match(/^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(done|complete|completed|finished|open|needs approval|for approval)$/)) ||
        (m = q.match(/^(complete|finish|done with)\s+(.+)$/)) && (m = [m[0], m[2], 'done']) ||
        (m = q.match(/^(?:send|submit)\s+(.+?)\s+(?:for|to)\s+approval$/)) && (m = [m[0], m[1], 'needs approval']) ||
        (m = q.match(/^needs approval\s*:?\s+(.+)$/)) && (m = [m[0], m[1], 'needs approval']) ||
        (m = q.match(/^(?:approve|reopen)\s+(.+)$/)) && (m = [m[0], m[1], /^reopen/.test(q) ? 'open' : 'done'])) {
      var task = matchTask(m[1].replace(/^(task|the task)\s+/, ''));
      if (!task) return 'I could not find a task matching “' + m[1] + '”. Say “open tasks” to see them.';
      var st = /approval/.test(m[2]) ? 'Needs approval' : /open/.test(m[2]) ? 'Open' : 'Done';
      if (typeof window.setStatus === 'function') window.setStatus(task.id, st); else { task.status = st; commit(); }
      return 'Marked “' + task.name + '” as ' + st + '.' + (st === 'Done' && /^approve/.test(q) ? ' (Recorded locally only — nothing was submitted.)' : '');
    }

    // lists
    if (/\b(approval|approvals|pending|waiting on me|needs my)\b/.test(q)) { goTo('approvals'); return listApprovals(); }
    if (/\b(pipeline|opportunit|contracts?|bids?|solicitations?)\b/.test(q) && !/\b(who|go to|open|scroll)\b/.test(q)) { goTo('contracts'); return listOpps(); }
    if (/\b(tasks?|assignments?|to-?dos?|board)\b/.test(q) && !/\b(go to|scroll)\b/.test(q)) { goTo('tasks'); return listTasks(); }
    if (/\b(trades?|positions?|journal)\b/.test(q) && !/\bwho\b/.test(q)) { goTo('trading'); return listTrades(); }

    // navigation
    if ((m = q.match(/^(?:go to|goto|open|show me|show|scroll to|navigate to|take me to|jump to)\s+(?:the\s+)?([a-z]+)/))) {
      var key = m[1];
      if (key === 'settings') return localCommand('settings');
      if (SECTIONS[key] && goTo(key)) return 'Showing ' + sectionLabel(key) + '.';
    }
    if (/^(youtube|channel|street wise money|swm|yt)\s+(agents|team|crew)$|^(youtube|channel) agents$/.test(q) && v && v.YT_AGENTS) { goTo('swm'); return 'Street Wise Money agents:\n' + v.YT_AGENTS.map(function (a) { return '• ' + a[0] + ' — ' + a[2]; }).join('\n') + '\nAssign one with “assign Scriptwriter to …”. They are role cards that track tasks — not connected automations.'; }
    if (/^(agents|list agents|who are the agents|team)$/.test(q)) { goTo('agents'); return 'Agents: Contract Scout, Partner Scout, Financial, Compliance, Operations and Trading, plus the Street Wise Money crew (say “youtube agents”). Their dashboard connections are pending — they are not running yet, so tasks you assign are tracked on the board. Ask “who is compliance” for details.'; }
    if ((m = q.match(/^(?:who is|what is|what does|tell me about)\s+(?:the\s+)?(.+?)(?:\s+agent)?(?:\s+do)?$/))) {
      if (v && v.YT_AGENTS) { var ya = v.YT_AGENTS.find(function (a) { var n = a[0].toLowerCase(); return m[1].indexOf(n) !== -1 || n.indexOf(m[1]) === 0 || (m[1].length > 4 && n.indexOf(m[1]) !== -1); }); if (ya) return ya[0] + ' (Street Wise Money): ' + ya[2] + '. Stage: ' + ya[3] + '.'; }
      var ak = Object.keys(AGENT_INFO).find(function (a) { return m[1].indexOf(a) !== -1 || a.indexOf(m[1]) === 0; });
      if (ak) return AGENT_INFO[ak];
      if (/jarvis|you/.test(m[1])) return 'I am Jarvis, the assistant built into Vanguard God\'s-Eye. I work while this page is open. ' + (aiReady() ? 'My AI brain is connected.' : 'Add an API key in ⚙ for an AI brain.');
    }
    if (/\b(connection|connected|server|sync)\b/.test(q)) { goTo('activity'); return ((document.getElementById('connection') || {}).textContent || 'Unknown') + ((document.getElementById('lastsync') || {}).textContent ? ' — ' + document.getElementById('lastsync').textContent : '') + '.'; }
    return undefined; // not a built-in command
  }
  function addTask(owner, name) {
    name = name.trim().replace(/[.]$/, '');
    var due = '', dm = name.match(/\s+(?:due|by)\s+(\d{4}-\d{2}-\d{2}|in\s+\d+\s+days?|tomorrow)$/i);
    if (dm) { due = parseDue(dm[1]); name = name.slice(0, dm.index).trim(); }
    if (!name) return 'What should the task say?';
    if (V()) V().addTask(owner, name, due);
    else { getDb().tasks.push({ id: newId(), owner: owner, name: name, status: 'Open', due: due }); commit(); }
    goTo('tasks');
    return 'Assigned to ' + owner + ': “' + name + '”' + (due ? ', due ' + due : '') + '. Status: Open. (The agent itself is not connected yet, so this is tracked on the board.)';
  }

  // ---------- AI brain ----------
  function systemPrompt() {
    var d = getDb(), v = V();
    return 'You are JARVIS, the AI assistant inside "Vanguard God\'s-Eye", an AI command center for Vanguard, a small business with a Cleaning Division (recurring janitorial contracts, subcontractor-first, target $15,000+/month, Escambia, Santa Rosa, Okaloosa and Walton counties, Florida) and a Courier Division (recurring delivery contracts). ' +
      'The dashboard has contracts management (stages Lead → Qualifying → Bid prep → Submitted → Won/Lost), an agent task board with a CEO approval queue, and an EUR/USD paper-trading simulator (random-walk simulated prices, paper money, no broker). Agents (Contract Scout, Partner Scout, Financial, Compliance, Operations, Trading) are planned but not connected. ' +
      'Workflow is approval-first: never claim you submitted bids, contacted anyone, or placed trades — you cannot. You only run while the user has the page open. Do not give personalised financial advice; frame trading discussion as education/risk management. ' +
      (settings.persona === 'streetwise' ? "PERSONALITY: Street Wise — you talk like the homie who happens to know money. Real talk, warm, confident, a little funny, natural urban flavor: \"what's good\", \"nah\", \"for real\", \"check it\", \"bet\", \"let's get this money right\". Short punchy sentences, never corporate, never stiff. Sharp and respectful, no slurs, no clowning the user. " : 'PERSONALITY: Classic — a calm, polished, light butler-like tone. ') + 'Be concise, confident and practical. Replies are often spoken aloud, so prefer short paragraphs and plain text (no markdown tables). ' +
      'The user can also use offline commands like "add cleaning opportunity <name> $<monthly> due in 14 days", "move <name> to submitted", "assign <agent> to <task>", "buy 0.1 lots stop 20 target 40", "briefing"; suggest these when they would help. ' +
      (v && v.CHANNEL_BIBLE ? 'Vanguard also runs STREET WISE MONEY (' + v.CHANNEL_BIBLE.handle + '), a faceless YouTube channel with an avatar host. Channel bible: ' + JSON.stringify(v.CHANNEL_BIBLE) + '. Its agents: ' + v.YT_AGENTS.map(function (a) { return a[0] + ' (' + a[2] + ')'; }).join('; ') + '. Pipeline stages: ' + v.VIDEO_STAGES.join(' → ') + '. Never say a video was uploaded; uploads need the owner\'s approval and are done by the owner in YouTube Studio. Channel stats are entered manually by the owner; never invent live statistics. ' : '') +
      'Current dashboard data (JSON): ' + JSON.stringify({ streetWiseMoney: v && v.ytStatus ? { status: v.ytStatus(), videos: (d.videos || []).map(function (x) { return { title: x.title, topic: x.topic, stage: x.stage, approved: !!x.approved, publish: x.publish }; }) } : null, kpis: v ? v.kpis() : null, deadlines: v ? v.deadlines(30) : null, simPrice: v ? v.sim.price() : null, opportunities: d.opps, tasks: d.tasks, paperTrades: d.trades, now: new Date().toString() }).slice(0, 14000);
  }
  async function callAi(messages, maxTokens) {
    var res = await fetch(effectiveBase() + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
      body: JSON.stringify({ model: effectiveModel(), messages: messages, temperature: 0.6, max_tokens: maxTokens || 600 })
    });
    var body = await res.text(), json = null;
    try { json = JSON.parse(body); } catch (e) {}
    if (!res.ok) throw new Error((json && json.error && (json.error.message || json.error)) || ('HTTP ' + res.status));
    var c = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!c) throw new Error('The API returned no answer.');
    return String(c).trim();
  }
  async function askAi(text, opts) {
    opts = opts || {};
    var thinking = addMsg('sys', 'Jarvis is thinking…');
    setState('thinking');
    try {
      var msgs = [{ role: 'system', content: systemPrompt() }].concat(history.slice(-12, -1)).concat([{ role: 'user', content: text }]);
      var reply = await callAi(msgs, opts.maxTokens);
      thinking.remove(); if (hudState === 'thinking') setState('idle');
      if (opts.onReply) reply = opts.onReply(reply);
      if (opts.speakText) { addMsg('bot', reply, { ai: true }); speak(opts.speakText); }
      else say(reply, { ai: true });
    } catch (e) {
      thinking.remove(); if (hudState === 'thinking') setState('idle');
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

  window.Jarvis = { ask: handle, open: open, toggle: toggle, command: localCommand, hud: { state: function (s) { setState(s); }, persona: function (p) { setPersona(p); }, full: function (f) { setFull(f); } }, settings: function () { return { provider: settings.provider, model: effectiveModel(), baseUrl: effectiveBase(), aiReady: aiReady(), speak: settings.speak }; } };
  if (window.speechSynthesis && speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = function () {};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildUi); else buildUi();
})();
