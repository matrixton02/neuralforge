
import modal

app = modal.App("cloud-llm-gpu-test")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("nvidia-ml-py")
)

@app.function(
    image=image,
    gpu="L4",
    timeout=300,
)
def check_gpu():
    import pynvml

    pynvml.nvmlInit()

    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)

        name = pynvml.nvmlDeviceGetName(handle)
        memory = pynvml.nvmlDeviceGetMemoryInfo(handle)

        if isinstance(name, bytes):
            name = name.decode()

        print("GPU:", name)
        print("Total VRAM:", round(
            memory.total / (1024 ** 3), 2
        ), "GB")

        print("Used VRAM:", round(
            memory.used / (1024 ** 3), 2
        ), "GB")

        return "GPU test successful!"

    finally:
        pynvml.nvmlShutdown()


@app.local_entrypoint()
def main():
    result = check_gpu.remote()
    print(result)
