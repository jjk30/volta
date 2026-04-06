# Volta Benchmark Results

**Model:** Qwen2.5-Coder-7B (Apache 2.0) via Ollama  
**Hardware:** Apple M2 Pro  
**Date:** April 2026

## Overall
- **Full pass rate:** 27/30 = **90%**
- **Generation success:** 30/30 (100%)
- **Yosys synthesis:** 29/30 (97%)
- **iverilog compilation:** 27/30 (90%)
- **Average time per test:** 45.2s
- **Average correction attempts:** 1.2

## By Category
| Category | Pass Rate |
|----------|-----------|
| Combinational | 10/10 (100%) |
| Sequential | 7/7 (100%) |
| Arithmetic | 2/2 (100%) |
| Control | 3/3 (100%) |
| Interface (UART, SPI, I2C) | 3/3 (100%) |
| Memory | 1/2 (50%) |
| FSM | 1/3 (33%) |

## Methodology
30 hardware design prompts covering 7 categories. Each test runs through the full Volta pipeline (spec interpretation → Verilog generation → Yosys correction → testbench → iverilog compilation). A test "passes" only if the final output compiles cleanly in iverilog.

Benchmark script: `tests/eval_suite.py`
