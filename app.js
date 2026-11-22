/*
 * Vanguard God's-Eye — dashboard logic.
 * Plain JS, no build step. Data lives in localStorage (key vanguard_phase1_v1) and,
 * when served by the optional dashboard server, syncs with its /api/state endpoint.
 * Globals db, save, render, $ are intentionally top-level so jarvis.js can use them.
 */
let serverMode = false; let apiToken = ""; let lastRemote = "";
const KEY = 'vanguard_phase1_v1';
const STAGES = ['Lead', 'Qualifying', 'Bid prep', 'Submitted', 'Won', 'Lost'];
const STAGE_PROB = { 'Lead': 0.1, 'Qualifying': 0.25, 'Bid prep': 0.4, 'Submitted': 0.6, 'Won': 1, 'Lost': 0 };
const CLEANING_TARGET = 15000;
const START_BALANCE = 10000;
const PIP = 0.0001, CONTRACT = 100000; // EUR/USD: 1 standard lot = 100,000 EUR, ≈ $10 per pip
const AGENTS = [
  ['Contract Scout', '🔎', 'Research opportunities and deadlines', 'Dashboard connection pending'],
  ['Partner Scout', '🤝', 'Cleaning subs and delivery carriers', 'Dashboard connection pending'],
  ['Financial', '💰', 'Pricing, margin, working capital', 'Dashboard connection pending'],
  ['Compliance', '🛡', 'Eligibility and requirements', 'Dashboard connection pending'],
  ['Operations', '⚙', 'Assignments and deadlines', 'Dashboard connection pending'],
  ['Trading', '📈', 'EUR/USD paper trading only', 'Broker connection disabled']
];
/* Street Wise Money — faceless YouTube channel division */
const VIDEO_STAGES = ['Idea', 'Script', 'Voiceover', 'Edit', 'Thumbnail', 'Approval', 'Scheduled', 'Published'];
const GATED_STAGES = ['Scheduled', 'Published']; // standing rule: nothing goes to YouTube without the owner's approval
const CHANNEL_BIBLE = {
  handle: '@streetwisemoney',
  mission: 'Practical money and business lessons for young adults, with relatable examples people can actually use to improve their financial lives, build wealth and create opportunities.',
  audience: 'Young adults (about 18–35): people improving their credit, new entrepreneurs, people learning to save, invest and build wealth, and anyone who wants financial independence but doesn’t know where to start.',
  tone: 'Confident, smooth, urban and practical. Relatable real-world examples. No fake wealth promises, no robotic lectures, no corporate-announcer voice. A practical takeaway in every upload.',
  avatar: 'Faceless channel with an avatar host: a photo-based digital host (HeyGen) speaking in the creator’s own cloned voice (ElevenLabs), keeping his natural accent and personality.',
  pillars: ['Credit & personal finance', 'Entrepreneurship — starting and growing businesses', 'Financial literacy & real-world money mistakes', 'Saving & budgeting', 'Building wealth, investing & extra income streams'],
  formula: 'Hook → Problem → Explanation → Example → Action plan → Recap',
  cadence: '2 long videos per week (Tuesday & Friday, 6–12 min) + 3–5 Shorts cut from them (goal: 5/week).',
  tools: [['ChatGPT', 'ideas & scripts'], ['ElevenLabs', 'voice'], ['HeyGen', 'avatar'], ['CapCut', 'editing'], ['Canva', 'thumbnails'], ['Zapier', 'orchestration'], ['YouTube Studio', 'uploads']],
  rule: 'Nothing is uploaded or published to YouTube without the owner’s approval.'
};
const YT_AGENTS = [
  ['Trend Researcher', '🔭', 'Finds trending money topics, search demand and competitor gaps across the five pillars; turns them into video ideas', 'Feeds the Idea column · ChatGPT'],
  ['Scriptwriter', '✍️', '6–12 min scripts in the channel formula (Hook → Problem → Explanation → Example → Action plan → Recap), plus Shorts cut-downs', 'Idea → Script · ChatGPT'],
  ['Voiceover Producer', '🎙', 'Generates narration in the host’s cloned voice, checks pacing and pronunciation, renders the avatar', 'Script → Voiceover · ElevenLabs + HeyGen'],
  ['Video Editor', '🎬', 'Assembles avatar footage, B-roll, captions, music and graphics; cuts 3–5 Shorts per long video', 'Voiceover → Edit · CapCut'],
  ['Thumbnail & Title Designer', '🖼', 'Designs thumbnails and tests title options that match the channel look', 'Edit → Thumbnail · Canva'],
  ['Upload/SEO Manager', '📤', 'Prepares title, description, hashtags and chapters; schedules Tue/Fri releases — only after owner approval', 'Approval → Scheduled → Published · YouTube Studio'],
  ['Analytics', '📊', 'Reviews the subscribers, views and revenue you enter; recommends what to make next', 'Channel KPIs (entered manually)']
];
const ALL_OWNERS = ['Executive'].concat(AGENTS.map(a => a[0]), YT_AGENTS.map(a => a[0]));

let db;
try { db = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { db = {}; }
normalize();

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(Number(n) || 0)).toLocaleString();
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const daysUntil = s => s ? Math.round((new Date(s + 'T00:00:00') - today()) / 864e5) : null;

function normalize() {
  if (!db || typeof db !== 'object') db = {};
  db.opps = Array.isArray(db.opps) ? db.opps : [];
  db.tasks = Array.isArray(db.tasks) ? db.tasks : [];
  db.trades = Array.isArray(db.trades) ? db.trades : [];
  db.log = Array.isArray(db.log) ? db.log : [];
  db.videos = Array.isArray(db.videos) ? db.videos : [];
  db.yt = db.yt && typeof db.yt === 'object' ? db.yt : {};
  if (!db.swmSeeded) {
    db.swmSeeded = true;
    if (!db.videos.length) db.videos.push(
      { id: 'swm001', title: 'Your First $1,000: The Money Move That Can Change Your Life', topic: 'Saving · Episode 001 · 2:11 · 1080p', stage: 'Approval', approved: true, publish: '', created: Date.now(), notes: 'Approved for upload. Next step: upload & publish on YouTube.' },
      { id: 'swm002', title: '5 Money Mistakes Keeping You Broke', topic: 'Financial literacy · Episode 002', stage: 'Script', approved: false, publish: '', created: Date.now() + 1, notes: 'Script drafted.' });
  }
  db.videos.forEach(v => { if (!VIDEO_STAGES.includes(v.stage)) v.stage = 'Idea'; if (!v.created) v.created = Date.now(); if (GATED_STAGES.includes(v.stage)) v.approved = true; });
  db.opps.forEach(o => { if (!STAGES.includes(o.stage)) o.stage = 'Lead'; if (!o.created) o.created = Date.now(); });
  db.tasks.forEach(t => { if (!t.status) t.status = 'Open'; });
  db.trades.forEach(t => { if (!t.status) t.status = 'Open'; if (!t.lots) t.lots = 0.1; });
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(db));
  render();
  if (serverMode) fetch("api/state", { method: "POST", headers: { "Content-Type": "application/json", ...(apiToken ? { Authorization: "Bearer " + apiToken } : {}) }, body: JSON.stringify(db) })
    .catch(() => { $("connection").textContent = "⚠ Sync failed — local copy saved"; });
}
function logEvent(msg) { db.log.unshift({ at: new Date().toISOString(), msg }); db.log = db.log.slice(0, 50); }

/* ---------------- calculations (also used by Jarvis) ---------------- */
function oppValue(o) { return Number(o.value) || 0; }
function kpis() {
  const active = db.opps.filter(o => o.stage !== 'Won' && o.stage !== 'Lost');
  const won = db.opps.filter(o => o.stage === 'Won'), lost = db.opps.filter(o => o.stage === 'Lost');
  const sum = a => a.reduce((s, o) => s + oppValue(o), 0);
  const wonClean = sum(won.filter(o => o.division === 'Cleaning'));
  const closed = db.trades.filter(t => t.status === 'Closed');
  const wins = closed.filter(t => tradePnl(t) > 0).length;
  const realized = closed.reduce((s, t) => s + tradePnl(t), 0);
  const openPnl = db.trades.filter(t => t.status === 'Open').reduce((s, t) => s + tradePnl(t, sim.price), 0);
  return {
    activeCount: active.length, pipeline: sum(active), weighted: active.reduce((s, o) => s + oppValue(o) * STAGE_PROB[o.stage], 0),
    wonCount: won.length, lostCount: lost.length, wonRevenue: sum(won), wonCleaning: wonClean,
    targetPct: Math.min(100, Math.round(wonClean / CLEANING_TARGET * 100)),
    winRate: won.length + lost.length ? Math.round(won.length / (won.length + lost.length) * 100) : null,
    openTasks: db.tasks.filter(t => t.status !== 'Done').length, approvals: db.tasks.filter(t => t.status === 'Needs approval').length,
    balance: START_BALANCE + realized, realized, openPnl, closedTrades: closed.length, openTrades: db.trades.length - closed.length,
    tradeWinRate: closed.length ? Math.round(wins / closed.length * 100) : null,
    byDivision: ['Cleaning', 'Courier'].reduce((m, d) => (m[d] = { won: sum(won.filter(o => o.division === d)), pipeline: sum(active.filter(o => o.division === d)) }, m), {})
  };
}
function deadlines(days = 21) {
  return db.opps.filter(o => o.due && o.stage !== 'Won' && o.stage !== 'Lost').map(o => ({ type: 'Contract', name: o.name, due: o.due, d: daysUntil(o.due), who: o.division }))
    .concat(db.tasks.filter(t => t.due && t.status !== 'Done').map(t => ({ type: 'Task', name: t.name, due: t.due, d: daysUntil(t.due), who: t.owner })))
    .concat(db.videos.filter(v => v.publish && v.stage !== 'Published').map(v => ({ type: 'Video', name: v.title, due: v.publish, d: daysUntil(v.publish), who: 'Street Wise Money · ' + v.stage })))
    .filter(x => x.d <= days).sort((a, b) => a.d - b.d);
}
function tradePnl(t, price) {
  const e = parseFloat(t.entry), x = t.status === 'Closed' ? parseFloat(t.exit) : parseFloat(price);
  if (!isFinite(e) || !isFinite(x)) return 0;
  return (x - e) * (t.side === 'SELL' ? -1 : 1) * CONTRACT * (parseFloat(t.lots) || 0.1);
}
function tradePips(t, price) {
  const e = parseFloat(t.entry), x = t.status === 'Closed' ? parseFloat(t.exit) : parseFloat(price);
  return isFinite(e) && isFinite(x) ? (x - e) * (t.side === 'SELL' ? -1 : 1) / PIP : 0;
}
function positionSize(riskPct, stopPips, balance) {
  balance = balance == null ? kpis().balance : balance;
  if (!(riskPct > 0) || !(stopPips > 0)) return 0;
  return Math.floor(balance * riskPct / 100 / (stopPips * 10) * 100) / 100; // $10/pip/lot
}

/* ---------------- simulated market ---------------- */
const SIM_KEY = 'vanguard_sim_v1';
const sim = (() => { let s = {}; try { s = JSON.parse(localStorage.getItem(SIM_KEY)) || {}; } catch {} return { price: s.price || 1.085, open: s.open || s.price || 1.085, hist: [], timer: null }; })();
sim.hist = [sim.price];
function simStep() {
  const r = (Math.random() + Math.random() + Math.random() - 1.5) * 2; // ~N(0,1)
  sim.price = Math.max(0.5, +(sim.price + r * 0.00012).toFixed(5));
  sim.hist.push(sim.price); if (sim.hist.length > 120) sim.hist.shift();
  localStorage.setItem(SIM_KEY, JSON.stringify({ price: sim.price, open: sim.open }));
  checkStops();
  renderMarket(); renderTradingNumbers();
}
function checkStops() {
  let changed = false;
  db.trades.filter(t => t.status === 'Open').forEach(t => {
    const buy = t.side === 'BUY', p = sim.price, sl = parseFloat(t.stop), tp = parseFloat(t.target);
    let hit = null;
    if (isFinite(sl) && (buy ? p <= sl : p >= sl)) hit = ['SL', sl];
    else if (isFinite(tp) && (buy ? p >= tp : p <= tp)) hit = ['TP', tp];
    if (hit) { closeTrade(t.id, hit[1], hit[0], true); changed = true; }
  });
  if (changed) save();
}
function simRunning() { return !!sim.timer; }
function simStart() { if (sim.timer) return; sim.timer = setInterval(simStep, Number($('sim-speed').value) || 2000); $('sim-toggle').textContent = '⏸ Pause'; }
function simStop() { clearInterval(sim.timer); sim.timer = null; $('sim-toggle').textContent = '▶ Start'; }
function simReset() { sim.price = sim.open = 1.085; sim.hist = [sim.price]; localStorage.setItem(SIM_KEY, JSON.stringify({ price: sim.price, open: sim.open })); renderMarket(); renderTradingNumbers(); }

/* ---------------- actions (also used by Jarvis) ---------------- */
function addOpp(o) {
  const opp = { id: id(), division: o.division === 'Courier' ? 'Courier' : 'Cleaning', name: String(o.name).trim(), agency: o.agency || '', value: o.value ? String(o.value) : '',
    stage: STAGES.includes(o.stage) ? o.stage : 'Lead', due: o.due || '', created: Date.now() };
  db.opps.push(opp); logEvent('Added opportunity “' + opp.name + '” (' + opp.division + ')'); save(); return opp;
}
function setStage(oppId, stage) {
  const o = db.opps.find(x => x.id === oppId); if (!o || !STAGES.includes(stage)) return null;
  o.stage = stage; logEvent('“' + o.name + '” moved to ' + stage); save(); return o;
}
function addTask(owner, name, due) {
  const t = { id: id(), owner, name: String(name).trim(), status: 'Open', due: due || '' };
  db.tasks.push(t); logEvent('Task for ' + owner + ': “' + t.name + '”'); save(); return t;
}
function openTrade(o) {
  const entry = o.entry != null && o.entry !== '' ? parseFloat(o.entry) : sim.price;
  const t = { id: id(), side: o.side === 'SELL' ? 'SELL' : 'BUY', lots: parseFloat(o.lots) || 0.1, entry: entry.toFixed(5), stop: (+o.stop).toFixed(5), target: (+o.target).toFixed(5), status: 'Open', opened: new Date().toISOString() };
  const buy = t.side === 'BUY';
  if (buy ? !(+t.stop < entry && +t.target > entry) : !(+t.stop > entry && +t.target < entry)) return { error: 'For a ' + t.side + ' the stop must be ' + (buy ? 'below' : 'above') + ' entry and the target ' + (buy ? 'above' : 'below') + ' it.' };
  db.trades.push(t); logEvent('Opened paper ' + t.side + ' ' + t.lots + ' lots @ ' + t.entry); save(); return t;
}
function closeTrade(tradeId, price, reason, silent) {
  const t = db.trades.find(x => x.id === tradeId); if (!t || t.status === 'Closed') return null;
  t.status = 'Closed'; t.exit = (+(price == null ? sim.price : price)).toFixed(5); t.reason = reason || 'Manual'; t.closedAt = new Date().toISOString();
  logEvent('Closed paper ' + t.side + ' @ ' + t.exit + ' (' + t.reason + ') ' + money(tradePnl(t)));
  if (!silent) save(); return t;
}

/* ---------------- Street Wise Money ---------------- */
function addVideo(v) {
  const vid = { id: id(), title: String(v.title || '').trim(), topic: String(v.topic || '').trim(), stage: VIDEO_STAGES.includes(v.stage) ? v.stage : 'Idea', publish: v.publish || '', created: Date.now(), script: v.script || '' };
  if (!vid.title) return null;
  db.videos.push(vid); logEvent('Street Wise Money: new video “' + vid.title + '” (' + vid.stage + ')'); save(); return vid;
}
function setVideoStage(videoId, stage) {
  const v = db.videos.find(x => x.id === videoId); if (!v || !VIDEO_STAGES.includes(stage)) return null;
  if (GATED_STAGES.includes(stage) && !v.approved) {
    v.stage = 'Approval'; logEvent('Street Wise Money: “' + v.title + '” is waiting for your approval before ' + stage); save();
    return Object.assign({ blocked: true }, v);
  }
  v.stage = stage; if (stage === 'Published' && !v.publishedAt) v.publishedAt = new Date().toISOString().slice(0, 10);
  logEvent('Street Wise Money: “' + v.title + '” → ' + stage); save(); return v;
}
function approveVideo(videoId, ok = true) {
  const v = db.videos.find(x => x.id === videoId); if (!v) return null;
  v.approved = !!ok; if (!ok && GATED_STAGES.includes(v.stage)) v.stage = 'Approval';
  logEvent('Street Wise Money: “' + v.title + '” ' + (ok ? 'approved for upload' : 'approval withdrawn')); save(); return v;
}
function setVideoScript(videoId, script) { const v = db.videos.find(x => x.id === videoId); if (!v) return null; v.script = String(script); logEvent('Script saved to “' + v.title + '”'); save(); return v; }
const YT_FIELDS = { subscribers: 'Subscribers', views: 'Total views', published: 'Videos published', revenue: 'Revenue (last 28 days)' };
function updateYt(fields) {
  Object.keys(fields).forEach(k => { if (k in YT_FIELDS && fields[k] !== '' && fields[k] != null && isFinite(+fields[k])) db.yt[k] = +fields[k]; });
  db.yt.updated = new Date().toISOString(); logEvent('Street Wise Money stats updated'); save(); return db.yt;
}
function ytStatus() {
  const by = VIDEO_STAGES.reduce((m, s) => (m[s] = db.videos.filter(v => v.stage === s).length, m), {});
  const upcoming = db.videos.filter(v => v.publish && v.stage !== 'Published').sort((a, b) => a.publish.localeCompare(b.publish));
  return { stats: Object.assign({}, db.yt), byStage: by, inProduction: db.videos.filter(v => v.stage !== 'Published').length, total: db.videos.length,
    next: upcoming[0] || null, awaiting: db.videos.filter(v => v.stage === 'Approval' && !v.approved), readyToUpload: db.videos.filter(v => v.approved && !['Scheduled', 'Published'].includes(v.stage)), ytTasks: db.tasks.filter(t => t.status !== 'Done' && YT_AGENTS.some(a => a[0] === t.owner)).length };
}
const fmtNum = n => n == null || n === '' ? '—' : Number(n).toLocaleString();

/* ---------------- rendering ---------------- */
function render() {
  const k = kpis();
  $('opcount').textContent = db.opps.length; $('taskcount').textContent = k.openTasks; $('tradecount').textContent = db.trades.length;
  $('k-pipe').textContent = money(k.pipeline); $('k-pipe-n').textContent = k.activeCount + ' active opportunit' + (k.activeCount === 1 ? 'y' : 'ies');
  $('k-weighted').textContent = money(k.weighted);
  $('k-won').textContent = money(k.wonRevenue); $('k-won-bar').style.width = k.targetPct + '%'; $('k-won-pct').textContent = k.targetPct + '% of $15,000 cleaning target';
  $('k-winrate').textContent = k.winRate == null ? '—' : k.winRate + '%'; $('k-winrate-n').textContent = k.wonCount + ' won · ' + k.lostCount + ' lost';
  $('k-approvals').textContent = k.approvals + ' awaiting approval';
  $('d-clean').textContent = money(k.byDivision.Cleaning.won) + ' / ' + money(k.byDivision.Cleaning.pipeline);
  $('d-courier').textContent = money(k.byDivision.Courier.won) + ' / ' + money(k.byDivision.Courier.pipeline);
  $('c-summary').textContent = db.opps.length + ' total · ' + money(k.pipeline) + '/mo active';

  const dl = deadlines();
  $('deadlines').innerHTML = dl.length ? dl.map(x => `<div class="row"><div><b>${esc(x.name)}</b><div class="muted">${x.type} · ${esc(x.who)} · ${esc(x.due)}</div></div><span class="${x.d < 0 ? 'bad' : x.d <= 7 ? 'warn' : 'good'}">${x.d < 0 ? Math.abs(x.d) + 'd overdue' : x.d === 0 ? 'today' : 'in ' + x.d + 'd'}</span></div>`).join('') : '<div class="empty">No deadlines in the next 21 days. Add due dates to contracts or tasks.</div>';
  const maxStage = Math.max(1, ...STAGES.map(s => db.opps.filter(o => o.stage === s).length));
  $('funnel').innerHTML = STAGES.map(s => { const a = db.opps.filter(o => o.stage === s); const v = a.reduce((t, o) => t + oppValue(o), 0);
    return `<div class="row"><span style="width:90px">${s}</span><div class="bar"><i style="width:${a.length / maxStage * 100}%"></i></div><span class="muted" style="width:120px;text-align:right">${a.length} · ${money(v)}</span></div>`; }).join('');

  renderOpps(); renderTasks(); renderAgents(); renderSwm(); renderTrades(); renderTradingNumbers(); renderMarket();
  $('log').innerHTML = db.log.length ? db.log.slice(0, 12).map(e => `<div class="row"><span>${esc(e.msg)}</span><small class="muted">${new Date(e.at).toLocaleString()}</small></div>`).join('') : '<div class="empty">Nothing logged yet.</div>';
}
function renderOpps() {
  const q = $('f-search').value.toLowerCase(), fd = $('f-division').value, fs = $('f-stage').value, sort = $('f-sort').value;
  let list = db.opps.filter(o => (!fd || o.division === fd) && (!fs || o.stage === fs) && (!q || (o.name + ' ' + (o.agency || '')).toLowerCase().includes(q)));
  const cmp = { due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999'), value: (a, b) => oppValue(b) - oppValue(a), stage: (a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage), new: (a, b) => (b.created || 0) - (a.created || 0) }[sort];
  list = list.slice().sort(cmp);
  if (!db.opps.length) { $('opps').innerHTML = '<div class="empty">No opportunities entered yet. Add one above, or tell Jarvis: “add cleaning opportunity Navarre clinic $2500”.</div>'; return; }
  if (!list.length) { $('opps').innerHTML = '<div class="empty">No contracts match these filters.</div>'; return; }
  $('opps').innerHTML = `<table class="tbl"><thead><tr><th>Opportunity</th><th>Division</th><th>Est. $/mo</th><th>Stage</th><th>Due</th><th></th></tr></thead><tbody>` +
    list.map(o => { const d = daysUntil(o.due), open = o.stage !== 'Won' && o.stage !== 'Lost';
      return `<tr><td><b>${esc(o.name)}</b>${o.agency ? `<div class="muted">${esc(o.agency)}</div>` : ''}</td><td>${esc(o.division)}</td><td>${o.value ? money(o.value) : '<span class="muted">unverified</span>'}</td>` +
        `<td><select aria-label="Stage" onchange="setStage('${o.id}',this.value)">${STAGES.map(s => `<option ${s === o.stage ? 'selected' : ''}>${s}</option>`).join('')}</select></td>` +
        `<td>${o.due ? `<span class="${open && d < 0 ? 'bad' : open && d <= 7 ? 'warn' : ''}">${esc(o.due)}</span>` : '<span class="muted">—</span>'}</td>` +
        `<td><button onclick="remove('opps','${o.id}')" title="Remove">×</button></td></tr>`; }).join('') + '</tbody></table>';
}
function renderTasks() {
  $('tasks').innerHTML = db.tasks.length ? db.tasks.map(x => { const d = daysUntil(x.due);
    return `<div class="row"><div><b>${esc(x.name)}</b><div class="muted">${esc(x.owner)} • ${esc(x.status)}${x.due ? ` • <span class="${x.status !== 'Done' && d < 0 ? 'bad' : ''}">due ${esc(x.due)}</span>` : ''}</div></div><select aria-label="Status" onchange="setStatus('${x.id}',this.value)"><option ${x.status === 'Open' ? 'selected' : ''}>Open</option><option ${x.status === 'Needs approval' ? 'selected' : ''}>Needs approval</option><option ${x.status === 'Done' ? 'selected' : ''}>Done</option></select><button onclick="remove('tasks','${x.id}')">×</button></div>`; }).join('') : '<div class="empty">No assignments entered yet.</div>';
  const vidAppr = db.videos.filter(v => v.stage === 'Approval' && !v.approved).map(v => `<div class="row"><span>🎬 Street Wise Money: ${esc(v.title)} <span class="muted">(upload approval)</span></span><span><button onclick="approveVideo('${v.id}')">Approve upload</button></span></div>`).join('');
  $('approvals').innerHTML = vidAppr + db.tasks.filter(x => x.status === 'Needs approval').map(x => `<div class="row"><span>${esc(x.name)} <span class="muted">(${esc(x.owner)})</span></span><span><button onclick="setStatus('${x.id}','Done')">Mark reviewed</button> <button onclick="setStatus('${x.id}','Open')">Send back</button></span></div>`).join('') || '<div class="empty">No approval items.</div>';
}
function agentCards(list, suffixAgent) {
  return list.map(([name, icon, desc, tag]) => { const n = db.tasks.filter(t => t.owner === name && t.status !== 'Done').length;
    return `<div class="card agent"><strong>${icon} ${esc(name)}${suffixAgent && ['Financial', 'Compliance', 'Operations', 'Trading'].includes(name) ? ' Agent' : ''}</strong><small>${esc(desc)}</small><p class="tag">${esc(tag)}</p><div class="count">${n} open task${n === 1 ? '' : 's'}</div><button type="button" onclick="assignTo('${esc(name)}')">+ Assign</button></div>`; }).join('');
}
function renderAgents() {
  $('agent-cards').innerHTML = agentCards(AGENTS, true);
  $('yt-agent-cards').innerHTML = agentCards(YT_AGENTS, false);
}
function renderBible() {
  const b = CHANNEL_BIBLE;
  $('yt-bible').innerHTML = `<div class="row"><span>Channel</span><strong>Street Wise Money · ${esc(b.handle)}</strong></div>` +
    [['Mission', b.mission], ['Audience', b.audience], ['Tone', b.tone], ['Avatar & voice', b.avatar], ['Video formula', b.formula], ['Cadence', b.cadence]]
      .map(([k, v]) => `<div class="row" style="align-items:flex-start"><span style="min-width:110px">${k}</span><span style="text-align:right">${esc(v)}</span></div>`).join('') +
    `<div class="row" style="align-items:flex-start"><span style="min-width:110px">Pillars</span><span style="text-align:right">${b.pillars.map(p => `<span class="chip">${esc(p)}</span>`).join(' ')}</span></div>` +
    `<div class="row" style="align-items:flex-start"><span style="min-width:110px">Tool stack</span><span style="text-align:right">${b.tools.map(t => `<span class="chip">${esc(t[0])} · ${esc(t[1])}</span>`).join(' ')}</span></div>` +
    `<div class="note" style="margin-top:10px">🔒 Standing rule: ${esc(b.rule)} Videos stop at <b>Approval</b> until you approve them.</div>`;
}
function renderSwm() {
  const y = db.yt, st = ytStatus();
  renderBible();
  $('yt-subs').textContent = fmtNum(y.subscribers); $('yt-views').textContent = fmtNum(y.views);
  $('yt-published').textContent = fmtNum(y.published); $('yt-revenue').textContent = y.revenue == null ? '—' : '$' + Number(y.revenue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  $('yt-updated').textContent = y.updated ? 'Entered by you · last updated ' + new Date(y.updated).toLocaleString() : 'Not entered yet — type your numbers from YouTube Studio below. No live YouTube connection.';
  $('yt-summary').textContent = st.inProduction + ' in production · ' + st.byStage.Published + ' published';
  $('o-yt').innerHTML = `<div class="row"><span>Pipeline</span><strong>${st.inProduction} in production · ${st.byStage.Published} published</strong></div>` +
    `<div class="row"><span>Next release</span><strong>${st.next ? esc(st.next.title) + ' · ' + esc(st.next.publish) : '—'}</strong></div>` +
    `<div class="row"><span>Subscribers (entered)</span><strong>${fmtNum(y.subscribers)}</strong></div>` +
    `<div class="row"><span>Open channel tasks</span><strong>${st.ytTasks}</strong></div>`;
  $('yt-board').innerHTML = VIDEO_STAGES.map((stage, i) => {
    const vids = db.videos.filter(v => v.stage === stage).sort((a, b) => (a.publish || '9999').localeCompare(b.publish || '9999'));
    return `<div class="kcol"><div class="khead">${stage} <span class="chip">${vids.length}</span></div>` + (vids.map(v => { const d = daysUntil(v.publish);
      return `<div class="kcard"><b>${esc(v.title)}</b>${v.topic ? `<div class="muted">${esc(v.topic)}</div>` : ''}` +
        `${v.publish ? `<div class="${stage !== 'Published' && d < 0 ? 'bad' : stage !== 'Published' && d <= 3 ? 'warn' : 'muted'}">📅 ${esc(v.publish)}</div>` : ''}${v.notes ? `<div class="muted">${esc(v.notes)}</div>` : ''}${v.script ? '<div class="good">📝 script saved</div>' : ''}` +
        `${stage === 'Approval' ? (v.approved ? '<div class="good">✅ Approved — ready to upload</div>' : `<div class="warn">⏳ Needs your approval</div><button onclick="approveVideo('${v.id}')">Approve upload</button>`) : ''}` +
        `<div class="kact"><select aria-label="Stage" onchange="setVideoStage('${v.id}',this.value)">${VIDEO_STAGES.map(s2 => `<option ${s2 === stage ? 'selected' : ''}>${s2}</option>`).join('')}</select>` +
        `${i < VIDEO_STAGES.length - 1 ? `<button title="Next stage" onclick="setVideoStage('${v.id}','${VIDEO_STAGES[i + 1]}')">→</button>` : ''}` +
        `${v.script ? `<button title="View script" onclick="showScript('${v.id}')">📝</button>` : ''}<button title="Remove" onclick="remove('videos','${v.id}')">×</button></div></div>`; }).join('') || '<div class="empty" style="padding:6px 0">—</div>') + '</div>';
  }).join('');
}
function renderTrades() {
  if (!db.trades.length) { $('trades').innerHTML = '<div class="empty">No paper trades yet. Start the simulated market and open one above.</div>'; return; }
  const rows = db.trades.slice().sort((a, b) => (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1) || (b.opened || '').localeCompare(a.opened || ''));
  $('trades').innerHTML = `<table class="tbl"><thead><tr><th>Side</th><th>Lots</th><th>Entry</th><th>SL / TP</th><th>Status</th><th>P&amp;L</th><th></th></tr></thead><tbody>` + rows.map(t => {
    const pnl = t.status === 'Open' ? tradePnl(t, sim.price) : tradePnl(t), pips = t.status === 'Open' ? tradePips(t, sim.price) : tradePips(t);
    return `<tr data-trade="${t.id}"><td><b class="${t.side === 'BUY' ? 'up' : 'down'}">${t.side}</b></td><td>${esc(t.lots)}</td><td>${esc(t.entry)}</td><td>${esc(t.stop)} / ${esc(t.target)}</td>` +
      `<td>${t.status === 'Open' ? '<span class="chip">Open</span>' : `Closed @ ${esc(t.exit)} <span class="muted">(${esc(t.reason || '')})</span>`}</td>` +
      `<td class="pnl ${pnl >= 0 ? 'up' : 'down'}">${money(pnl)} <small class="muted">${pips.toFixed(1)}p</small></td>` +
      `<td>${t.status === 'Open' ? `<button onclick="closeTrade('${t.id}')">Close</button> ` : ''}<button onclick="remove('trades','${t.id}')" title="Delete">×</button></td></tr>`; }).join('') + '</tbody></table>';
}
function renderTradingNumbers() {
  const k = kpis();
  $('acct-balance').textContent = money(k.balance); $('k-balance').textContent = money(k.balance + k.openPnl);
  $('k-balance-n').textContent = k.openTrades + ' open · ' + k.closedTrades + ' closed (simulation)';
  const op = $('acct-open'); op.textContent = money(k.openPnl); op.className = k.openPnl >= 0 ? 'up' : 'down';
  $('acct-winrate').textContent = k.tradeWinRate == null ? '—' : k.tradeWinRate + '%';
  document.querySelectorAll('#trades tr[data-trade]').forEach(tr => { const t = db.trades.find(x => x.id === tr.dataset.trade); if (!t || t.status !== 'Open') return;
    const p = tradePnl(t, sim.price), cell = tr.querySelector('.pnl'); cell.className = 'pnl ' + (p >= 0 ? 'up' : 'down'); cell.innerHTML = money(p) + ` <small class="muted">${tradePips(t, sim.price).toFixed(1)}p</small>`; });
  // equity curve
  const closed = db.trades.filter(t => t.status === 'Closed').sort((a, b) => (a.closedAt || '').localeCompare(b.closedAt || ''));
  let bal = START_BALANCE; const pts = [bal].concat(closed.map(t => (bal += tradePnl(t))));
  $('equity').innerHTML = line(pts, '#58e9bc');
  const calc = positionSize(parseFloat($('calc-risk').value), parseFloat($('calc-pips').value), k.balance);
  $('calc-out').value = calc ? calc.toFixed(2) + ' lots' : '—';
}
function renderMarket() {
  $('sim-price').textContent = sim.price.toFixed(5);
  const ch = (sim.price - sim.open) / PIP;
  $('sim-change').textContent = (ch >= 0 ? '+' : '') + ch.toFixed(1) + ' pips since session open' + (simRunning() ? ' · live sim' : ' · paused');
  $('sim-change').className = ch >= 0 ? 'up' : 'down';
  $('spark').innerHTML = line(sim.hist.length > 1 ? sim.hist : [sim.price, sim.price], '#43bbff');
}
function line(pts, color) {
  const min = Math.min(...pts), max = Math.max(...pts), rng = max - min || 1;
  const d = pts.map((p, i) => (i / Math.max(1, pts.length - 1) * 300).toFixed(1) + ',' + (85 - (p - min) / rng * 80).toFixed(1)).join(' ');
  return `<polyline fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke" points="${d}"/>`;
}

/* ---------------- wiring ---------------- */
window.remove = (k, i) => { db[k] = db[k].filter(x => x.id !== i); save(); };
window.setStatus = (i, v) => { const t = db.tasks.find(x => x.id === i); if (t) { t.status = v; logEvent('“' + t.name + '” → ' + v); save(); } };
window.setStage = setStage; window.closeTrade = closeTrade; window.setVideoStage = setVideoStage; window.approveVideo = approveVideo;
window.showScript = vid => { const v = db.videos.find(x => x.id === vid); if (!v) return; const w = window.open('', '_blank'); if (w) { w.document.title = v.title + ' — script'; const pre = w.document.createElement('pre'); pre.style.cssText = 'white-space:pre-wrap;font:15px/1.5 system-ui;max-width:760px;margin:30px auto'; pre.textContent = v.title + '\n\n' + v.script; w.document.body.appendChild(pre); } else alert(v.script); };
$('owner').innerHTML = '<option>Executive</option><optgroup label="Vanguard agents">' + AGENTS.map(a => `<option>${a[0]}</option>`).join('') + '</optgroup><optgroup label="Street Wise Money agents">' + YT_AGENTS.map(a => `<option>${esc(a[0])}</option>`).join('') + '</optgroup>';
$('videostage').innerHTML = VIDEO_STAGES.map(s2 => `<option>${s2}</option>`).join('');
$('videoform').onsubmit = e => { e.preventDefault(); addVideo({ title: $('videotitle').value, topic: $('videotopic').value, stage: $('videostage').value, publish: $('videodate').value }); e.target.reset(); };
$('ytform').onsubmit = e => { e.preventDefault(); updateYt({ subscribers: $('yt-in-subs').value, views: $('yt-in-views').value, published: $('yt-in-published').value, revenue: $('yt-in-revenue').value }); e.target.reset(); };
window.assignTo = name => { $('owner').value = name; $('taskname').focus(); $('taskname').scrollIntoView({ behavior: 'smooth', block: 'center' }); };

$('oppstage').innerHTML = STAGES.map(s => `<option>${s}</option>`).join('');
$('f-stage').innerHTML += STAGES.map(s => `<option>${s}</option>`).join('');
['f-search', 'f-division', 'f-stage', 'f-sort'].forEach(i => $(i).addEventListener('input', renderOpps));
['calc-risk', 'calc-pips'].forEach(i => $(i).addEventListener('input', renderTradingNumbers));
$('oppform').onsubmit = e => { e.preventDefault(); addOpp({ division: $('division').value, name: $('oppname').value, agency: $('oppagency').value, value: $('oppvalue').value, stage: $('oppstage').value, due: $('oppdue').value }); e.target.reset(); };
$('taskform').onsubmit = e => { e.preventDefault(); addTask($('owner').value, $('taskname').value, $('taskdue').value); e.target.reset(); };
$('tradeform').onsubmit = e => { e.preventDefault(); const r = openTrade({ side: $('side').value, lots: $('lots').value, entry: $('entry').value, stop: $('stop').value, target: $('target').value }); if (r.error) { alert(r.error); return; } $('entry').value = $('stop').value = $('target').value = ''; };
$('sim-toggle').onclick = () => simRunning() ? simStop() : simStart();
$('sim-speed').onchange = () => { if (simRunning()) { simStop(); simStart(); } };
$('sim-reset').onclick = simReset;
$('acct-reset').onclick = () => { if (confirm('Delete all paper trades and reset the account to $10,000?')) { db.trades = []; logEvent('Paper account reset'); save(); } };
$('export').onclick = () => { const a = document.createElement('a'), blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }); a.href = URL.createObjectURL(blob); a.download = 'vanguard-dashboard-backup.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
$('import').onclick = () => $('importfile').click();
$('importfile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const v = JSON.parse(await f.text()); if (confirm('Replace current dashboard data with ' + f.name + '?')) { db = v; normalize(); logEvent('Imported ' + f.name); save(); } } catch { alert('That file is not valid dashboard JSON.'); } e.target.value = ''; };
$('clear').onclick = () => { if (confirm('Delete all locally saved dashboard records?')) { db = { opps: [], tasks: [], trades: [], log: [], videos: [], yt: {} }; save(); } };

// highlight nav item for the section in view
const navLinks = [...document.querySelectorAll('#nav a')];
const navTargets = navLinks.map(a => document.querySelector(a.getAttribute('href')));
function updateNav() {
  let cur = 0;
  navTargets.forEach((t, i) => { if (t && t.getBoundingClientRect().top < 140) cur = i; });
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = navTargets.length - 1;
  navLinks.forEach((a, i) => a.classList.toggle('active', i === cur));
}
addEventListener('scroll', updateNav, { passive: true }); updateNav();

async function refresh() {
  if (location.protocol === 'file:') { $('connection').textContent = '○ Browser-only mode — local data'; return; }
  try {
    const r = await fetch('api/state', { headers: apiToken ? { Authorization: 'Bearer ' + apiToken } : {}, cache: 'no-store' });
    if (!r.ok) throw Error('API unavailable');
    const v = await r.json();
    if (!serverMode || v.updated !== lastRemote) { serverMode = true; db = v.data; normalize(); localStorage.setItem(KEY, JSON.stringify(db)); render(); }
    lastRemote = v.updated;
    $('connection').textContent = '● Connected to dashboard server (not external agents)';
    $('lastsync').textContent = 'Last checked ' + new Date().toLocaleTimeString();
    $('activity').innerHTML = v.events && v.events.length ? v.events.map(e => `<div class="row"><div><b>${esc(e.agent)}</b> · ${esc(e.division)}<div class="muted">${esc(e.message)}</div></div><small>${esc(String(e.at).slice(0, 19).replace('T', ' '))} UTC</small></div>`).join('') : '<div class="empty">No agent events received yet.</div>';
  } catch (e) {
    $('connection').textContent = serverMode ? '⚠ Server disconnected — local copy available' : '○ Browser-only mode — local data';
    if (!serverMode) { clearInterval(refreshTimer); } // no server (e.g. GitHub Pages): stop polling
  }
}
const refreshTimer = setInterval(refresh, 15000); refresh();
$('clock').textContent = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
render();

// Public API for Jarvis and the console
window.Vanguard = { STAGES, STAGE_PROB, VIDEO_STAGES, YT_AGENTS, ALL_OWNERS, addVideo, setVideoStage, setVideoScript, approveVideo, CHANNEL_BIBLE, GATED_STAGES, updateYt, ytStatus, kpis, deadlines, addOpp, setStage, addTask, openTrade, closeTrade, tradePnl, tradePips, positionSize,
  sim: { price: () => sim.price, start: simStart, stop: simStop, running: simRunning, reset: simReset, step: simStep } };
