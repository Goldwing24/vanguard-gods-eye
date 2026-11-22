# Vanguard God's-Eye
AI command center for Vanguard business operations: contracts management, trading simulation and agent coordination — with **Jarvis**, a built-in voice/chat assistant.

Plain HTML/CSS/JS, no build step: `index.html`, `styles.css`, `app.js` (dashboard), `jarvis.js` + `jarvis.css` (assistant).

## Run it
- **Locally:** open `index.html`, or serve the folder: `python3 -m http.server 8000` → http://localhost:8000
- **Live site (GitHub Pages, from `main`):** https://goldwing24.github.io/vanguard-gods-eye/. All asset paths are relative and `.nojekyll` is included.

Data is stored in your browser (localStorage), per device. Use **Export / Import JSON** to back up or move it. If the optional dashboard server (not in this repo) serves the page, records sync through its `api/state` endpoint; on GitHub Pages the dashboard runs in browser-only mode.

## Dashboard
- **Overview:** KPI cards (active and stage-weighted pipeline, won monthly revenue vs the $15,000 cleaning target, win rate, open tasks, paper equity), upcoming deadlines (21 days) and a pipeline-by-stage funnel, division summaries.
- **Contracts management:** add opportunities with division, agency/client, est. monthly value, stage (Lead → Qualifying → Bid prep → Submitted → Won/Lost) and due date; search, filter, sort, change stage inline; overdue/soon-due highlighting.
- **Trading Lab (simulation):** random-walk EUR/USD price feed (start/pause, 1×/3×/8× speed — *not live data*), open paper trades at market or a set entry, automatic stop-loss/take-profit, live P&L in $ and pips, paper balance from $10,000, win rate, equity curve, position-size calculator. No broker, no real orders.
- **Agents & tasks:** agent cards with open-task counts and quick “Assign”, task board with owners, due dates and statuses, CEO approval queue.
- **Activity:** server connection / agent events (when served by the dashboard server) and a local activity log.

## 🎬 Street Wise Money (YouTube division)
A division for the faceless YouTube channel **Street Wise Money** (`@streetwisemoney`): practical money and business lessons for young adults, with relatable examples.

- **Content pipeline** (board): Idea → Script → Voiceover → Edit → Thumbnail → **Approval** → Scheduled → Published. Each video has a title, topic/pillar and target publish date. Videos with publish dates appear in the Overview deadlines.
- **Approval gate:** nothing can move to Scheduled or Published until you approve it (the standing rule: nothing uploads to YouTube without the owner's approval). Videos waiting on you show in the CEO Approval Queue. The dashboard does **not** upload to YouTube; you publish in YouTube Studio.
- **Channel KPIs you enter yourself:** subscribers, total views, videos published, revenue for the last 28 days. There's no live YouTube connection and no made-up stats.
- **Channel bible:** mission, audience, tone, avatar & voice, content pillars, video formula, cadence (2 long videos a week on Tue & Fri, 6–12 min, plus 3–5 Shorts) and the tool stack (ChatGPT, ElevenLabs, HeyGen, CapCut, Canva, Zapier, YouTube Studio).
- **Channel agents:** Trend Researcher, Scriptwriter, Voiceover Producer, Video Editor, Thumbnail & Title Designer, Upload/SEO Manager, Analytics. Each has a role card and can receive tasks on the Agent Assignment Board. They are role cards for organizing work, not connected automations.
- Comes seeded with Episode 001, *Your First $1,000* (approved, ready to upload), and Episode 002, *5 Money Mistakes Keeping You Broke* (script stage).

## 🤖 Jarvis assistant

Jarvis is a floating AI assistant built into the dashboard (`jarvis.js` + `jarvis.css`, plain HTML/CSS/JS, no build step).
Open `index.html` (or serve the folder, e.g. `python3 -m http.server 8000`) and click the 🤖 button in the bottom-right corner, or press **Ctrl+J** (**⌘J** on Mac).

**Holographic HUD.** Jarvis is an Iron Man-style HUD: a glowing arc-reactor core with slowly rotating dashed rings, scanlines and corner brackets. The core breathes when idle, pulses while **listening** to your voice, beats while **speaking** and spins faster while **thinking** (AI call). Tap the core to talk.
- **Personalities:** 💠 **Classic**: electric blue core and blue rings, calm butler tone. 💵 **Street Wise**: blue core with money-green rings and edges, and the confident, urban Street Wise Money host tone (also used for AI replies). Switch with the header button or say `street wise mode` / `classic mode`.
- **Full screen:** ⛶ (or say `full screen`) expands the HUD to the whole window on a laptop; press Esc or – to exit. On phones it becomes a full-height single column.
- Respects the system "reduce motion" setting (animations off). No external libraries or web fonts.

**Works offline, no key needed.** Type or say:

| Say / type | What happens |
|---|---|
| `help` | List of commands |
| `briefing` / `status`, `kpis`, `deadlines` | Summary of contracts, revenue vs target, deadlines, tasks, approvals, paper account |
| `add cleaning opportunity Navarre clinic $2500 due in 10 days` | Adds a contract as a Lead (`courier` works too; `3.5k/month`, `due 2026-12-15` understood) |
| `show pipeline`, `move navarre to submitted`, `we won navarre`, `mark navarre lost` | Lists contracts / changes their stage |
| `assign Compliance to check SAM registration due in 3 days`, `add task …` | Adds a task on the Agent Assignment Board |
| `send SAM for approval` / `mark SAM done` / `approvals` / `open tasks` | Task status and the CEO Approval Queue |
| `start market` / `pause market` / `price` | Controls the simulated EUR/USD feed |
| `buy 0.2 lots stop 15 target 30`, `sell 0.1 lots` | Opens a paper trade at the simulated price (stop/target in pips) |
| `positions`, `close trade 1`, `close all`, `account` | Paper positions, live P&L, balance and win rate |
| `position size 1% 20 pips` | Position-size calculator |
| `go to contracts` / `trading` / `agents` / `approvals` / `overview` / `activity` | Scrolls to and highlights that section |
| `who is partner scout`, `agents`, `time`, `export`, `clear chat` | Info and utilities |

**Street Wise Money commands:** `youtube status`, `video pipeline`, `channel bible`, `youtube agents`, `add video idea Credit Score Myths about credit publish in 7 days`, `move credit score myths to script`, `approve video credit score myths`, `move episode 1 to published`, `set subscribers 1250` / `set views 12.5k` / `set revenue 38.40` / `set videos published 1`, `assign Scriptwriter to script Episode 003`.
With the AI brain on: `give me 5 video ideas about credit` → `save idea 2` / `save all ideas`, `write a script about building credit at 18` (or `write a short script about …`) → `save script` / `save script to <video>`. Without a key, Jarvis gives built-in starter ideas and the channel's script outline instead.

**Voice.** Tap 🎙 to talk (browser speech recognition: Chrome, Edge and Safari; the browser will ask for microphone access). Replies are read aloud; toggle with 🔊/🔇 or say `voice off`. Say `stop` to interrupt.

**Optional AI brain.** Tap ⚙ in the Jarvis panel, pick **OpenAI** or **xAI (Grok)** (or **Custom** for any OpenAI-compatible `/chat/completions` endpoint), paste your own API key, and press **Save** (use **Test connection** to check it). Jarvis then answers open-ended questions using the current dashboard data as context. Start a message with `ask …` to always send it to the AI.

- The key is stored **only in your browser's localStorage** and sent only to the base URL you chose. It is never committed to this repo or sent to the dashboard server. **Forget key** removes it.
- Anyone with access to that browser profile could read the key, so use a key with a spending limit and don't save it on shared computers.

**Jarvis runs only while the dashboard page is open in your browser.** There is no background server: it can't watch for new contracts, send reminders, or keep the market simulation running after you close the tab.

Jarvis follows the dashboard's approval-first rule: it only edits the same local records the dashboard forms do. It never submits bids, contacts companies, or places trades.
