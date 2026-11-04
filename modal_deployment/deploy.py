import os
import subprocess

import modal

app=modal.App("personal-llm-inference")
    
MODEL_NAME="Qwen/Qwen2.5-7B-Instruct"
SERVED_MODEL_NAME="qwen2.5-7b"

GPU = ["L4", "A10"]
PORT=8000
MINUTES=60

hf_cache=modal.Volume.from_name("qwen-huggingface-cache",create_if_missing=True)

vllm_cache=modal.Volume.from_name("qwen_vllm_cache",create_if_missing=True)

vllm_image=(
    modal.Image.from_registry(
        "nvidia/cuda:12.9.0-devel-ubuntu22.04",
        add_python="3.12"
    )
    .entrypoint([])
    .uv_pip_install("vllm==0.21.0")
)

@app.server(
    image=vllm_image,
    gpu=GPU,
    scaledown_window=5*MINUTES,
    startup_timeout=20*MINUTES,
    volumes={
        "/root/.cache/huggingface":hf_cache,
        "/root/.cache/vllm":vllm_cache,
    },
    secrets=[modal.Secret.from_name("qwen-api-secret")],
    port=PORT,
    unauthenticated=True,
)

class QwenServer:
    @modal.enter()
    def start(self):
        print("Starting Qwen Inference Server...")

        api_key=os.environ["VLLM_API_KEY"]

        command = [
            "vllm",
            "serve",
            MODEL_NAME,
            "--served-model-name",
            SERVED_MODEL_NAME,
            "--host",
            "0.0.0.0",
            "--port",
            str(PORT),
            "--dtype",
            "bfloat16",
            "--max-model-len",
            "8192",
            "--gpu-memory-utilization",
            "0.85",
            "--api-key",
            api_key,
        ]

        self.process=subprocess.Popen(command)

        print("vLLM process launched")

        @modal.exit()
        def shutdown(self):
            if hasattr(self,"process"):
                self.process.terminate()
                print("vLLM server stopped.")
