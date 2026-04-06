# 🧠 Multi-Agent AI System — Autonomous Intelligence Engine

> A production-grade AI system that simulates **collaborative intelligence** using multiple specialized agents — powered entirely by **local LLMs (zero API cost)**.

---

## 🚀 Live Concept

> “What if instead of one AI, you had a team of AIs thinking together?”

This project answers that and now wires in real research tooling plus manual checkpoints.

The Insight Engine acts as a guided multi-agent research assistant: a user drops in a goal, the planner breaks it into tasks, the research router routes each task to either web grounding or LLM reasoning, and the UI lets you inspect/add/edit researchers before synthesizer/writer/critic produce a polished output with citations. It’s built for product teams, consultants, or knowledge workers who want a transparent, step-by-step report rather than a single opaque response.

It transforms a single prompt into a **multi-stage reasoning pipeline** where agents:

* Plan
* Research
* Generate
* Critique
  — all in real time.

---

## ⚡ Core Highlights

### 🧩 Multi-Agent Architecture

* Planner → breaks down goals
* Research Router → classifies tasks into web vs. reasoning research (with rerun gating)
* Researcher → gathers insights (DuckDuckGo + Puppeteer grounding, inline citations)
* Writer → produces structured output enriched by citations
* Critic → refines & improves recursively

---

### ⚡ Real-Time Streaming & Control

* Server-Sent Events (SSE) with cancellation-safe backend
* Pause/Continue + auto-run toggle gating each stage (includes modal-based researcher edits)
* Live visibility into research reruns, synthesizer prep, and critic retries

---

### 🧠 Context-Aware Memory + Research Plan

* Recent runs influence the planner
* Research plan stored with structured prompts, routing mode, and dirty-state flags
* UI lets you add/edit/delete researchers while paused; rerun stale outputs before synthesizer

---

### 📊 Visual Execution Graph & Controls

* React Flow graph now shows planner → router → researchers → rest of pipeline
* Researchers pane lists prompts, routing mode, progress, and “Needs rerun” badges
* Modal-driven add/edit/remove controls and rerun button while paused

---

### 🔒 100% Local AI (Zero Cost)

* Runs on local LLMs via Ollama
* No OpenAI / paid APIs
* Fully offline capable

---

## 🏗️ System Architecture

```
User Input
   ↓
Streaming API (SSE)
   ↓
Orchestrator (Core Brain)
   ├── Planner Agent
   ├── Research Agent
   ├── Writer Agent
   └── Critic Agent
   ↓
Memory Layer
   ↓
Local LLM (Ollama)
```

---

## 🔄 Execution Flow

```
Goal → Planner → Research Router → Researchers ↺ (reruns) → Synthesizer → Writer → Critic
                          ↑                     ↓            ↻
                        manual review        dirty outputs  critic feedback
```

Inline citations, sourced research blocks, and rerun gating keep each stage grounded before synthesis.

---

## 🧠 Why This Project Matters

Most AI apps:

> Call LLM → Return response ❌

This system:

> Orchestrates multiple agents → Iteratively improves output ✅

---

## 🧪 Example

### Input

```
Create a restaurant marketing strategy
```

### Output Pipeline

* Step 1: Strategic breakdown
* Step 2: Market insights
* Step 3: Structured plan
* Step 4: Refined final strategy

---

## 🧰 Tech Stack

| Layer         | Tech                                            |
| ------------- | ----------------------------------------------- |
| Frontend      | Next.js (App Router), Material UI, React Flow   |
| Backend       | API Routes + SSE, session control over run graph |
| AI Engine     | Local LLM via Ollama (planner/research/synth/critic/router) |
| Orchestration | Custom orchestrator + session control that tracks research plan |
| Streaming     | SSE with cancelable graph + citation catalog   |
| Visualization | DAG layout + modal controls for research nodes |

---

## 📁 Project Structure

```
src/
  app/
    api/agent/        # Streaming API
  lib/
    agents/           # Planner, Researcher, Writer, Critic
    llm/              # LLM wrapper (Ollama)
    orchestrator/     # Execution engine
    memory/           # Context system
  components/
    AgentGraph.tsx    # Visualization layer
```

---

## ⚙️ Getting Started

### 1. Clone

```bash
git clone https://github.com/1n4NO/multi-agent-ai-system.git
cd multi-agent-ai
```

---

### 2. Install

```bash
npm install
```

---

### 3. Run Local AI

```bash
ollama run llama3
```

---

### 4. Start App

```bash
npm run dev
```

---

## 🧠 Key Engineering Concepts

* Multi-Agent Systems with dynamic routing (planner → research router → researchers → critic)
* Orchestrating rerun-safe pipelines via SSE + session-based pause/continue control
* Structured research plans with editable routing and inline citations for downstream agents
* UI/UX for real-time graph visualization, modal-based researcher editing, and rerun indicators
* Streaming architectures that honor abort signals and keep the frontend in sync
* System design combining offline LLMs, Puppeteer-backed grounding, and PDF citation export

---

## 🚀 Future Enhancements

* Persistent, queryable memory and research logs beyond the in-memory store
* Multi-user/session-aware controls with saved research plans and citations
* Configurable rerun policies and richer automations for custom agent routing
* Deeper grounding with external data sources (APIs, knowledge graphs) and citation auditing
* Remote deployment options that orchestrate multiple local or cloud-backed LLMs

---

## 🎯 What This Demonstrates

This project showcases:

✔ System design thinking for multi-agent orchestration
✔ Streaming SSE + session control with manual checkpoints and rerun logic
✔ Grounded research via DuckDuckGo/Puppeteer and inline citations
✔ Interactive UI flow with React Flow, modal-based editing, and citation-aware exports
✔ Fast local inference on Ollama with cancel-safe tooling

---

## 🧑‍💻 Author

Built by **[Pratik Singh]**

---

## ⭐ Final Thought

> This isn’t a chatbot.
> This is a **team of AIs thinking together**.
