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

## Known Limitations
- FSM designs with duplicate parameter declarations (LLM generates state names twice)
- Register file array reset uses SystemVerilog syntax (mem <= 0 instead of for-loop)
- These are LLM quality issues addressable by model upgrade (Qwen 14B/32B)
