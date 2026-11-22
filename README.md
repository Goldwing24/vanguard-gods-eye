# vanguard-gods-eye
AI command center for Vanguard business operations contracts management and trading simulation 

## 🤖 Jarvis assistant

Jarvis is a floating AI assistant built into the dashboard (`jarvis.js` + `jarvis.css`, plain HTML/CSS/JS, no build step).
Open `index.html` (or serve the folder, e.g. `python3 -m http.server 8000`) and click the 🤖 button in the bottom-right corner, or press **Ctrl+J** (**⌘J** on Mac).

**Works offline, no key needed.** Type or say:

| Say / type | What happens |
|---|---|
| `help` | List of commands |
| `briefing` / `status` | Summary of pipeline, tasks, approvals, paper trades and connection |
| `show pipeline` | Lists opportunities |
| `add cleaning opportunity Navarre clinic $2500` | Adds to the Opportunity Pipeline (`courier` works too, `3.5k/month` is understood) |
| `assign Compliance to check SAM registration` | Adds a task on the Agent Assignment Board |
| `add task call Okaloosa school district` | Adds a task for Executive |
| `send SAM for approval` / `mark SAM done` | Changes a task's status (CEO Approval Queue) |
| `approvals`, `open tasks`, `paper trades` | Lists those, with risk / reward in pips for paper trades |
| `go to trading` / `metrics` / `activity` | Scrolls to and highlights that section |
| `who is partner scout`, `agents`, `time`, `export`, `clear chat` | Info and utilities |

**Voice.** Tap 🎙 to talk (browser speech recognition: Chrome, Edge and Safari; the browser will ask for microphone access). Replies are read aloud; toggle with 🔊/🔇 or say `voice off`. Say `stop` to interrupt.

**Optional AI brain.** Tap ⚙ in the Jarvis panel, pick **OpenAI** or **xAI (Grok)** (or **Custom** for any OpenAI-compatible `/chat/completions` endpoint), paste your own API key, and press **Save** (use **Test connection** to check it). Jarvis then answers open-ended questions using the current dashboard data as context. Start a message with `ask …` to always send it to the AI.

- The key is stored **only in your browser's localStorage** and sent only to the base URL you chose. It is never committed to this repo or sent to the dashboard server. **Forget key** removes it.
- Anyone with access to that browser profile could read the key, so use a key with a spending limit and don't save it on shared computers.

Jarvis follows the dashboard's approval-first rule: it only edits the same local records the dashboard forms do. It never submits bids, contacts companies, or places trades.
