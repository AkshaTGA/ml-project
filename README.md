# AgriAssist

An agentic AI platform for Indian farmers and herders. Users sign in, describe their farm once, then talk to an agent by text, voice or photo in their own language. The agent shows its work live (memories recalled, reasoning, tool calls, model results) and remembers the farm across chats.

The main ML model is the **pasture biomass estimator**: one shared ResNet-50 backbone and five XGBoost models (clover, dead, green, total, GDM), served by `ml-service` with one API each. Crop and livestock models are placeholders until trained.

```
React + Vite + Tailwind ──/api (Clerk JWT)──▶ FastAPI + LangGraph agent ──▶ Grok (xAI)
  landing, onboarding, dashboard,               │   ├─ Postgres (Neon): chats, profiles, pgvector memory
  chat + live agent timeline,                   │   ├─ Sarvam AI: speech-to-text / text-to-speech
  voice mode, models, settings                  │   ├─ ml-service :8100 — one route per biomass model
                                                │   ├─ Model APIs: crop, livestock (mock until trained)
                                                │   └─ Open-Meteo, data.gov.in mandi, web search
```

## Features

- **Landing page, Clerk sign-in, 5-step onboarding**: language, role, location (search or GPS), farm (land, crops, animals, irrigation, soil), goals.
- **Dashboard**: local weather and 7-day forecast, farming alerts (rain, heat, frost), mandi prices for your crops, quick actions, recent chats, what the agent knows about you.
- **Chat with a live agent timeline**: "Recalling memories", streamed reasoning, the agent's plan, each tool with arguments, timer and result card, then the answer. It collapses to "Worked for 6.2s · 2 tools · 3 memories". Follow-up suggestions appear under the last answer, and a "Remembered: …" toast offers Undo.
- **Multilingual and voice**: the agent replies in the language of your message. Every text field has a mic for voice typing (Sarvam, 22 languages). Hands-free **voice mode** listens, thinks and speaks, starting to talk at the first finished sentence. UI labels come in English, Hindi, Marathi, Punjabi, Tamil and Telugu.
- **Tools (12)**: pasture biomass, leaf doctor (vision), crop recommender, livestock health, grazing calculator, mandi prices, weather, web search, remember fact, recall memories, search past conversations, update farm profile.
- **Settings**: edit the farm profile; a **memory manager** to see, edit or delete everything stored; **assistant style** (your own instructions layered over the system prompt); language and voice.

## Memory

| Tier | What | Where |
|---|---|---|
| Session | Full message history of a chat; long chats are trimmed for the LLM and covered by the summary | LangGraph `AsyncPostgresSaver` |
| Short-term | Title and summary of each chat; the last 3 are given to the agent in every new chat | `threads` table + store `("threads", user)` |
| Long-term | Farm profile, plus facts learned from chats, recalled by semantic similarity to the current message | `profiles` table + store `("memories", user)` with pgvector |

After each answer, a background step (fast model) extracts new facts (skipping near-duplicates), updates the chat title and summary, and suggests follow-ups. It never delays the answer. Embeddings run locally (`fastembed`, multilingual MiniLM, ~10 ms), so Hindi and English memories match each other.

## Setup

Requirements: Python 3.10+, Node 18+, a Postgres database with pgvector (Neon works), a Clerk app, an xAI key. A Sarvam key is needed for voice.

```bash
cd AgriAssist
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env        # fill in the keys
cp frontend/.env.example frontend/.env      # VITE_CLERK_PUBLISHABLE_KEY
cd frontend && npm install && cd ..
```

Tables are created automatically on first start. The first start also downloads the embedding model (about 1 minute).

## Run (three terminals)

```bash
cd ml-service && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100
```

```bash
cd backend && uvicorn app.main:app --port 8000 --reload
```

```bash
cd frontend && npm run dev
```

The first terminal is the biomass model service. Install it once with `bash ml-service/install.sh`. See `ml-service/README.md` for the five APIs, the 2052-d input vector, and where to put `backbone_full.pt`.

Open http://localhost:5173. Clerk only accepts the origins listed in `CLERK_AUTHORIZED_PARTIES`.

## Configuration

See `backend/.env.example`. Highlights:
- `LLM_MODEL=grok-4.7` (answers; streams its reasoning) and `LLM_FAST_MODEL=grok-4.20-non-reasoning` (background memory work and the leaf-diagnosis card).
- `BIOMASS_API_URL`: base URL of `ml-service` (default in `.env.example` is `http://127.0.0.1:8100`). The app posts the photo to `/targets/{slug}/predict` for the measurement the user picked. Leave it empty for a mock biomass response. `CROP_API_URL` and `LIVESTOCK_API_URL` work the same way. The biomass image is sent as multipart field `BIOMASS_IMAGE_FIELD`.
- `DATA_GOV_IN_API_KEY` enables live Agmarknet mandi prices. Without it, prices come from web search.

### Model API contract

- **Biomass:** the user chooses one of `Dry_Clover_g`, `Dry_Dead_g`, `Dry_Green_g`, `Dry_Total_g`, `GDM_g`. AgriAssist posts the image to `{BIOMASS_API_URL}/targets/{slug}/predict`. **Crop / livestock:** `POST` JSON with the fields in `backend/app/registry.py`.
- Result cards expect: biomass `prediction` plus `predictions: {<target>: grams}`, optional `gradcam_file_id` and `green_features`; a mock with all five keys still renders as bars. Crop `recommendations: [{crop, confidence}]`; livestock `risk_level`, `possible_conditions: [{condition, match}]`. Other shapes still work in chat but show as raw JSON.

## Code map

| Path | What |
|---|---|
| `backend/app/agent.py` | LangGraph graph (`load_context → agent ⇄ tools`), layered system prompt, per-tool result streaming |
| `backend/app/memory.py` | The three memory tiers, context loading, background reflection |
| `backend/app/tools.py` | Agent tools |
| `ml-service/` | ResNet-50 + five XGBoost biomass APIs and Grad-CAM |
| `backend/app/routers/` | `chat` (SSE events), `threads`, `files`, `models`, `profile` (incl. memory manager), `voice` (Sarvam proxy), `dashboard` |
| `backend/app/auth.py` | Clerk JWT verification (JWKS from the publishable key) |
| `frontend/src/pages/` | Landing, AuthPage, Onboarding, Dashboard, ChatPage, ModelsPage, Settings |
| `frontend/src/components/chat/` | AgentTimeline, Message, Composer, VoiceMode |
| `frontend/src/lib/` | API client, i18n, voice recording / TTS queue, toasts |

### Chat event stream (`POST /api/chat`)

`status`, `memory_recalled`, `thinking`, `token`, `tool_start`, `tool_end`, `answer_done` (with timing), then from background reflection `memory_saved`, `title`, `suggestions`, and finally `done`.

## Ideas for next features

- WhatsApp bot on the same agent (many farmers use WhatsApp more than web apps)
- Proactive daily alerts by push or SMS (weather and prices for each farm)
- Reminders and crop calendar created by the agent ("second urea dose on day 45")
- Government scheme finder (PM-KISAN, PMFBY, KCC) from the profile
- Soil health card OCR feeding the crop model
- Offline-friendly PWA for weak connectivity
- Expense / yield tracker and herd register with vaccination schedule
- KVK expert escalation when the agent isn't confident
- Satellite NDVI (Sentinel-2) of the user's field alongside the biomass model
