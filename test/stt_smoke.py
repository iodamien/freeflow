"""Exercise the frozen Linux STT server with a tiny CPU model and silent WAV.
This is a build check, not a microphone or transcription-quality evaluation.
"""
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import Request, urlopen
import wave


def main():
    binary = str(Path(sys.argv[1]).resolve())
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix="freeflow-stt-smoke-") as work:
        env = dict(os.environ, FREEFLOW_PORT=str(port), FREEFLOW_DEVICE="cpu",
                   FREEFLOW_CPU_MODEL="tiny", HF_HOME=os.path.join(work, "models"))
        base = f"http://127.0.0.1:{port}"
        with open(os.path.join(work, "engine.log"), "w+") as log:
            child = subprocess.Popen([binary], env=env, stdout=log, stderr=log)
            try:
                deadline = time.monotonic() + 240
                while time.monotonic() < deadline:
                    if child.poll() is not None:
                        raise RuntimeError(f"STT exited with {child.returncode}")
                    try:
                        with urlopen(base + "/health", timeout=2) as response:
                            health = json.load(response)
                        if health.get("ready"):
                            break
                        if not health.get("loading", True):
                            raise RuntimeError(health.get("error", "STT failed"))
                    except OSError:
                        pass
                    time.sleep(0.5)
                else:
                    raise TimeoutError("STT did not become ready")
                assert health["device"] == "cpu", health
                audio = io.BytesIO()
                with wave.open(audio, "wb") as wav:
                    wav.setnchannels(1)
                    wav.setsampwidth(2)
                    wav.setframerate(16000)
                    wav.writeframes(b"\0\0" * 32000)
                request = Request(base + "/transcribe?lang=fr", data=audio.getvalue(),
                                  headers={"Content-Type": "audio/wav"}, method="POST")
                with urlopen(request, timeout=45) as response:
                    result = json.load(response)
                assert isinstance(result.get("text"), str), result
                assert result["audio_ms"] == 2000, result
                with urlopen(Request(base + "/shutdown", data=b"", method="POST"), timeout=5) as response:
                    assert json.load(response)["ok"]
                child.wait(timeout=10)
                assert child.returncode == 0, child.returncode
                print("Frozen Linux STT: health, CPU model, WAV transcription and shutdown passed")
            finally:
                if child.poll() is None:
                    child.terminate()
                    try:
                        child.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        child.kill()
                        child.wait(timeout=5)
                log.seek(0)
                print(log.read()[-12000:])


if __name__ == "__main__":
    main()
