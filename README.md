# Volta

AI-powered Verilog IDE. Describe a hardware design in natural language, get synthesizable Verilog, simulate it, and visualize waveforms, all in the browser.

Volta uses a local LLM (Qwen2.5-Coder-7B via Ollama, Apache 2.0 licensed) to interpret design prompts into structured specs, generate Verilog RTL, auto-fix synthesis errors with Yosys, build testbenches, and compile with Icarus Verilog. The frontend is a terminal-themed split-pane editor with a block diagram viewer, waveform display, symbols library, and an integrated chat assistant.

---

## Architecture

```
frontend/         React + Vite UI (port 5173)
backend/          FastAPI server (port 8000)
core/             Python pipeline
  schema.py         Pydantic data models (DesignSpec, ModuleSpec, etc.)
  spec_interpreter.py   NL prompt -> structured JSON spec via Ollama
  rtl_generator.py      Spec -> Verilog generation via Ollama
  correction_engine.py  Yosys verification + auto-fix loop
  testbench_generator.py  Cocotb testbench generation
  orchestrator.py       Full pipeline: prompt -> spec -> Verilog -> fix -> testbench -> compile
tests/            Evaluation suite (30-prompt benchmark)
output/           Generated Verilog files
```

---

## Prerequisites

You need the following installed before setup:

| Tool | Purpose | Install |
|------|---------|---------|
| **Node.js** (v18+) | Frontend build | [nodejs.org](https://nodejs.org) or `brew install node` |
| **Python 3.9+** | Backend + core pipeline | [python.org](https://python.org) or `brew install python` |
| **Ollama** | Local LLM runtime | [ollama.com](https://ollama.com) or `brew install ollama` |
| **Icarus Verilog** | Verilog compiler + simulator | `brew install icarus-verilog` |
| **Yosys** | Synthesis + verification | `brew install yosys` |
| **Verilator** *(optional)* | Cocotb simulation | `brew install verilator` |
| **Cocotb** *(optional)* | Python testbench runner | `pip install cocotb` |

### macOS (Homebrew)

```bash
brew install node python ollama icarus-verilog yosys
# Optional:
brew install verilator
pip install cocotb
```

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install nodejs npm python3 python3-pip iverilog yosys
# Install Ollama:
curl -fsSL https://ollama.com/install.sh | sh
# Optional:
sudo apt install verilator
pip install cocotb
```

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/jjk30/volta.git
cd volta
```

### 2. Set up the LLM model

Start Ollama and pull the Qwen2.5-Coder model:

```bash
# Start Ollama (runs in background)
ollama serve &

# Pull the Qwen2.5-Coder model (Apache 2.0 licensed)
ollama pull qwen2.5-coder:7b

# Verify it's loaded
ollama list
```

This downloads Qwen2.5-Coder-7B (~4.7GB) — a code-specialized LLM with strong Verilog generation capabilities, licensed under Apache 2.0.

## Setup (one-time)

```bash
cd ~/volta
python -m venv venv
source venv/bin/activate
pip install -e ".[dev]"
```

This installs Volta as an editable package — `from core.llm_client import call_ollama` works from any working directory, so the backend, the test suites, and any ad-hoc scripts share one Python environment with no `sys.path` hackery.

## Running

You need **three terminals** (or use background processes):

### Terminal 1 — Ollama

```bash
ollama serve
```

If already running, skip this.

### Terminal 2 — Backend

```bash
cd ~/volta
source venv/bin/activate
python backend/main.py
```

The API runs at `http://localhost:8000`. Endpoints:
- `POST /generate` — NL prompt to Verilog + testbench
- `POST /simulate` — Compile + simulate, return VCD waveforms
- `POST /chat` — Hardware design assistant
- `GET /health` — Health check

### Terminal 3 — Frontend

```bash
cd ~/volta/frontend
npm install
npm run dev
```

The UI runs at `http://localhost:5173`. Open it in your browser.

---

## Quick Start

1. Open `http://localhost:5173` in your browser
2. Type a prompt: `Design a 4-bit counter with reset and enable`
3. Click **GENERATE** (or press Enter)
4. Wait for the pipeline to complete (progress steps shown below the toolbar)
5. Design and testbench code appear in the split editor panes
6. Click **SIMULATE** to run the simulation
7. Switch to the **WAVEFORM** tab to see signal traces
8. Switch to the **DIAGRAM** tab to see a block diagram
9. The **VOLTA ASSISTANT** chat panel explains the design automatically

---

## Features

### Generation Pipeline
- Natural language to structured `DesignSpec` JSON (few-shot LLM interpretation)
- Spec-driven Verilog generation with precise prompts
- 7 post-processing auto-fixes (reg declarations, undeclared signals, input assignments, SystemVerilog stripping, etc.)
- Yosys synthesis verification with iterative correction (up to 5 attempts)
- Automatic Verilog testbench generation with `$dumpfile`/`$dumpvars`
- iverilog compilation check
- Fallback: direct generation if spec interpretation fails
- Fallback: smoke-test testbench if spec-based testbench fails

### Frontend
- Terminal-themed black/green UI (JetBrains Mono)
- Split-pane CodeMirror editors with Verilog syntax highlighting
- Tabbed bottom panel: Console, Waveform, Diagram, Examples
- Hand-drawn block diagrams (rough.js) parsed from design code
- SVG symbols library (37 schematic symbols across 7 categories) with click-to-insert
- Canvas waveform viewer with oscilloscope grid
- Integrated chat assistant with markdown rendering
- Resizable panels with drag handles everywhere
- Generation progress indicator with step-by-step display
- Cancel/abort for in-flight requests

### Chat Assistant
- Hardware design expert powered by Qwen2.5-Coder
- Context-aware: sees current design, testbench, and simulation results
- Off-topic filtering (3-layer: keyword, prompt, post-response)
- Short-mode with list-aware truncation
- Copy buttons on messages and code blocks

---

## Project Structure (Detailed)

### Core Pipeline (`core/`)

| File | Description |
|------|-------------|
| `schema.py` | Pydantic models: `DesignSpec`, `ModuleSpec`, `Port`, `Operation`, `TestVector`, `SynthesisResult`, `SimulationResult` |
| `spec_interpreter.py` | NL prompt to `DesignSpec` JSON via Ollama. 3-tier retry with progressively simpler prompts. Robust JSON extraction with truncation repair. |
| `rtl_generator.py` | `ModuleSpec` to Verilog via Ollama. Prompt builder, Verilog extraction, Yosys syntax check. |
| `correction_engine.py` | Yosys `read_verilog` + error classification (undeclared signal, width mismatch, syntax, multiple drivers, missing module) + LLM auto-fix loop. |
| `testbench_generator.py` | Cocotb testbench generation from `TestVector` objects. Verilator runner, JUnit XML parser. |
| `orchestrator.py` | Full pipeline orchestrator. Post-processing fixes. Smoke-test testbench fallback. Direct generation fallback. |

### Backend (`backend/`)

| File | Description |
|------|-------------|
| `main.py` | FastAPI server. `/generate`, `/simulate`, `/chat` endpoints. VCD parser. Off-topic filtering. |
| `requirements.txt` | Python dependencies: fastapi, uvicorn |

### Frontend (`frontend/src/`)

| File | Description |
|------|-------------|
| `App.jsx` | Main layout: toolbar, editors, tabbed panel, right panel (symbols + chat) |
| `symbolsData.js` | 37 schematic symbols with SVG renderers and Verilog snippets |
| `defaults.js` | Default editor placeholder text |
| `components/Toolbar.jsx` | Prompt bar, dropdowns (Language, Simulator, Verification), Generate/Simulate buttons |
| `components/EditorPane.jsx` | CodeMirror editor with Verilog highlighting, `insertAtCursor` via ref |
| `components/WaveformViewer.jsx` | Canvas waveform renderer with oscilloscope grid |
| `components/DiagramView.jsx` | rough.js block diagram parsed from Verilog source |
| `components/SymbolsLibrary.jsx` | Visual SVG symbol grid with category tabs |
| `components/ChatBot.jsx` | Chat interface with markdown, copy buttons, auto-explain |
| `components/ProgressIndicator.jsx` | Step-by-step generation progress display |
| `components/ChipIcon.jsx` | Animated IC chip SVG icon |
| `components/oneDarkTheme.js` | CodeMirror theme (green keywords, amber literals, gray comments) |

---

## Evaluation Suite

Run the 30-prompt benchmark to measure accuracy:

```bash
python tests/eval_suite.py
```

This tests prompts across 7 categories (combinational, sequential, FSM, memory, interface, arithmetic, control) and reports:
- Pass rates per category and overall
- Average generation time and correction attempts
- Diff against previous runs

Results are saved to `tests/eval_results.json` (git-ignored).

---

## Environment Variables

No environment variables are required. All configuration is hardcoded:
- Ollama: `http://localhost:11434`
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

To change the LLM model, edit the `model` parameter in `core/spec_interpreter.py`, `core/rtl_generator.py`, `core/correction_engine.py`, and `backend/main.py`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Ollama not reachable` | Run `ollama serve` in a separate terminal |
| `qwen2.5-coder model not found` | Run `ollama pull qwen2.5-coder:7b` |
| `Yosys not found` | `brew install yosys` (macOS) or `apt install yosys` (Ubuntu) |
| `iverilog not found` | `brew install icarus-verilog` or `apt install iverilog` |
| `Port 5173 in use` | Kill the old process: `lsof -ti :5173 \| xargs kill` |
| `Port 8000 in use` | Kill the old process: `lsof -ti :8000 \| xargs kill` |
| `ModuleNotFoundError: pydantic` | `pip install pydantic requests` |
| Frontend shows old code after changes | Hard refresh: `Cmd+Shift+R` or clear Vite cache |
| Generation takes too long | Qwen2.5-Coder needs ~5GB RAM. Check `ollama ps` for memory usage. |
| Yosys passes but iverilog fails | The post-processor handles most cases. File a bug with the Verilog output. |

---

## Tech Stack

- **LLM**: Qwen2.5-Coder-7B (Apache 2.0, via Ollama)
- **Backend**: Python, FastAPI, Pydantic
- **Frontend**: React 19, Vite 8, CodeMirror 6, rough.js, react-markdown
- **EDA Tools**: Yosys (synthesis), Icarus Verilog (simulation), Verilator (optional)
- **Theme**: Terminal-inspired black (#000) + neon green (#00ff41), JetBrains Mono

---

## License

MIT

Still incomplete, will be done soon
