# Volta Benchmarks

## Eval Suite (30 prompts)
- **Pass rate: 80-90%** (24-27/30 depending on run)
- Consistently passing: Combinational (100%), Sequential (86-100%), Arithmetic (100%), Control (100%)
- Flaky: FSM (0-33%), Memory (50%), Interface (67-100%)
- Generation pass: 30/30 (100%)
- Average time per test: ~42s

## Validation Suite (33 circuit combinations)
- **Pass rate: 100%** (33/33)
- All categories: 100%
- Average time per test: ~50s

## Python (Amaranth + Cocotb) Mode
- Pass rate is **currently being characterized**; expect lower than Verilog for complex designs.
- Qwen2.5-Coder-7B has very little Amaranth HDL in its training data, so first-try
  elaboration on non-trivial sequential designs frequently fails. The generator
  retries up to 3 times, feeding each elaboration error back to the model.
- On retry exhaustion the orchestrator falls back to direct Verilog generation and
  surfaces a warning, so the user always gets a working design even if the
  Amaranth path didn't land.
- Simple designs (counters, gates, MUXes) currently succeed within 1–2 retries.
- Cocotb simulate works end-to-end against the elaborated Verilog via
  `cocotb_tools.runner` with iverilog. The Waveform tab is currently empty in
  Python mode because cocotb-runner emits FST, not VCD — `fst2vcd` would be
  needed to populate the waveform viewer (future work).

## Known Limitations
- FSM designs with duplicate parameter declarations (LLM generates state names twice)
- Register file array reset uses SystemVerilog syntax (mem <= 0 instead of for-loop)
- These are LLM quality issues addressable by model upgrade (Qwen 14B/32B)
- Editing design.py manually does not re-trigger Amaranth re-elaboration in real
  time — only on GENERATE (future work: filesystem watcher or explicit
  "re-elaborate" button).
