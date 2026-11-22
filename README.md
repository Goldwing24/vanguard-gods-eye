# Vanguard God's-Eye
AI command center for Vanguard business operations: contracts management, trading simulation and agent coordination — with **Jarvis**, a built-in voice/chat assistant.

Plain HTML/CSS/JS, no build step: `index.html`, `styles.css`, `app.js` (dashboard), `jarvis.js` + `jarvis.css` (assistant).

## Run it
- **Locally:** open `index.html`, or serve the folder: `python3 -m http.server 8000` → http://localhost:8000
- **GitHub Pages:** repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save**. The site appears at https://goldwing24.github.io/vanguard-gods-eye/ after a minute or two. All asset paths are relative and `.nojekyll` is included.

Data is stored in your browser (localStorage), per device. Use **Export / Import JSON** to back up or move it. If the optional dashboard server (not in this repo) serves the page, records sync through its `api/state` endpoint; on GitHub Pages the dashboard runs in browser-only mode.

## Dashboard
- **Overview:** KPI cards (active and stage-weighted pipeline, won monthly revenue vs the $15,000 cleaning target, win rate, open tasks, paper equity), upcoming deadlines (21 days) and a pipeline-by-stage funnel, division summaries.
- **Contracts management:** add opportunities with division, agency/client, est. monthly value, stage (Lead → Qualifying → Bid prep → Submitted → Won/Lost) and due date; search, filter, sort, change stage inline; overdue/soon-due highlighting.
- **Trading Lab (simulation):** random-walk EUR/USD price feed (start/pause, 1×/3×/8× speed — *not live data*), open paper trades at market or a set entry, automatic stop-loss/take-profit, live P&L in $ and pips, paper balance from $10,000, win rate, equity curve, position-size calculator. No broker, no real orders.
- **Agents & tasks:** agent cards with open-task counts and quick “Assign”, task board with owners, due dates and statuses, CEO approval queue.
- **Activity:** server connection / agent events (when served by the dashboard server) and a local activity log.

## 🤖 Jarvis assistant

Jarvis is a floating AI assistant built into the dashboard (`jarvis.js` + `jarvis.css`, plain HTML/CSS/JS, no build step).
Open `index.html` (or serve the folder, e.g. `python3 -m http.server 8000`) and click the 🤖 button in the bottom-right corner, or press **Ctrl+J** (**⌘J** on Mac).

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

**Voice.** Tap 🎙 to talk (browser speech recognition: Chrome, Edge and Safari; the browser will ask for microphone access). Replies are read aloud; toggle with 🔊/🔇 or say `voice off`. Say `stop` to interrupt.

**Optional AI brain.** Tap ⚙ in the Jarvis panel, pick **OpenAI** or **xAI (Grok)** (or **Custom** for any OpenAI-compatible `/chat/completions` endpoint), paste your own API key, and press **Save** (use **Test connection** to check it). Jarvis then answers open-ended questions using the current dashboard data as context. Start a message with `ask …` to always send it to the AI.

- The key is stored **only in your browser's localStorage** and sent only to the base URL you chose. It is never committed to this repo or sent to the dashboard server. **Forget key** removes it.
- Anyone with access to that browser profile could read the key, so use a key with a spending limit and don't save it on shared computers.

**Jarvis runs only while the dashboard page is open in your browser.** There is no background server: it can't watch for new contracts, send reminders, or keep the market simulation running after you close the tab.

Jarvis follows the dashboard's approval-first rule: it only edits the same local records the dashboard forms do. It never submits bids, contacts companies, or places trades.
