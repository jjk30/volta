"""
Volta — LLM Client
Single shared entry point for calling Ollama. All core modules use this.
Changing the model name, endpoint, or timeout only requires editing this file.
"""

import requests

OLLAMA_URL = "http://localhost:11434/api/generate"
DEFAULT_MODEL = "qwen2.5-coder:7b"


def call_ollama(
    prompt: str,
    model: str = DEFAULT_MODEL,
    temperature: float = 0.2,
    num_predict: int = 2048,
    timeout: int = 180,
) -> str:
    """Send a prompt to the local Ollama server and return the response text.

    Raises RuntimeError if Ollama is not reachable.
    """

    try:
        resp = requests.post(
            OLLAMA_URL,
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": temperature,
                    "num_predict": num_predict,
                },
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        return resp.json()["response"]
    except requests.ConnectionError:
        raise RuntimeError(
            "Ollama not reachable at localhost:11434. "
            "Start it with: ollama serve"
        )
