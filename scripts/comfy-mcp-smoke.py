"""Probe the loopback ComfyUI MCP bridge and optionally run a bounded smoke image."""

from __future__ import annotations

import argparse
import json
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


def rpc(endpoint: str, method: str, params: dict, request_id: int, timeout: int) -> dict:
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params,
    }).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8")
            content_type = response.headers.get("Content-Type", "")
    except urllib.error.URLError as error:
        raise RuntimeError(f"MCP request failed: {error}") from error

    if "text/event-stream" in content_type:
        for line in body.replace("\r\n", "\n").split("\n"):
            if line.startswith("data: "):
                return json.loads(line[6:])
        raise RuntimeError("MCP response contained no JSON event data.")
    return json.loads(body)


def nested_result(response: dict) -> object:
    if "error" in response:
        raise RuntimeError(f"MCP error: {json.dumps(response['error'], sort_keys=True)}")
    result = response.get("result", {})
    if result.get("isError"):
        raise RuntimeError(f"MCP tool returned an error: {json.dumps(result, sort_keys=True)}")
    content = result.get("content", [])
    if content and isinstance(content[0], dict):
        text = content[0].get("text")
        if isinstance(text, str):
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return text
    return result


def read_json(endpoint: str, timeout: int = 3) -> dict:
    request = urllib.request.Request(endpoint, method="GET")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def comfy_base_url(system_stats_endpoint: str) -> str:
    suffix = "/system_stats"
    endpoint = system_stats_endpoint.rstrip("/")
    if not endpoint.endswith(suffix):
        raise RuntimeError("--comfy-endpoint must identify ComfyUI's /system_stats endpoint.")
    return endpoint[:-len(suffix)]


def wait_for_comfy_prompt(comfy_base: str, prompt_id: str, deadline: float) -> dict:
    history_endpoint = f"{comfy_base}/history/{urllib.parse.quote(prompt_id, safe='')}"
    last_history_error: str | None = None
    while True:
        try:
            history = read_json(history_endpoint)
            last_history_error = None
        except (OSError, TimeoutError, urllib.error.URLError) as error:
            history = {}
            last_history_error = str(error)
        entry = history.get(prompt_id)
        if isinstance(entry, dict):
            status = entry.get("status", {})
            if status.get("completed") is True:
                status_name = status.get("status_str")
                if status_name != "success":
                    raise RuntimeError(
                        f"ComfyUI prompt {prompt_id} completed with status {status_name!r}: "
                        + json.dumps(status.get("messages", []), sort_keys=True)
                    )

                output_files = []
                for node_id, node_output in entry.get("outputs", {}).items():
                    if not isinstance(node_output, dict):
                        continue
                    for output_kind, items in node_output.items():
                        if not isinstance(items, list):
                            continue
                        for item in items:
                            if isinstance(item, dict) and isinstance(item.get("filename"), str):
                                output_files.append({
                                    "node_id": node_id,
                                    "kind": output_kind,
                                    "filename": item["filename"],
                                    "subfolder": item.get("subfolder", ""),
                                    "type": item.get("type"),
                                })
                return {
                    "status": status_name,
                    "prompt_id": prompt_id,
                    "output_files": output_files,
                    "messages": status.get("messages", []),
                }

        remaining = deadline - time.perf_counter()
        if remaining <= 0:
            error_detail = f" Last history error: {last_history_error}." if last_history_error else ""
            raise RuntimeError(
                f"ComfyUI prompt {prompt_id} did not reach terminal history before the smoke timeout. "
                "The helper did not retry or cancel it; inspect the queue before any new run."
                + error_detail
            )
        time.sleep(min(1.0, remaining))


def summarize_telemetry(samples: list[dict], elapsed_seconds: float, errors: list[str]) -> dict:
    def values(path: tuple[str, ...]) -> list[int]:
        result: list[int] = []
        for sample in samples:
            current: object = sample
            for key in path:
                if not isinstance(current, dict):
                    current = None
                    break
                current = current.get(key)
            if isinstance(current, int):
                result.append(current)
        return result

    ram_free = values(("system", "ram_free"))
    devices = [sample.get("devices", [{}])[0] for sample in samples if sample.get("devices")]
    vram_free = [device.get("vram_free") for device in devices if isinstance(device.get("vram_free"), int)]
    torch_vram_free = [device.get("torch_vram_free") for device in devices if isinstance(device.get("torch_vram_free"), int)]
    first_device = devices[0] if devices else {}
    return {
        "elapsed_seconds": round(elapsed_seconds, 3),
        "sample_count": len(samples),
        "sampling_errors": errors,
        "device": first_device.get("name"),
        "vram_total": first_device.get("vram_total"),
        "vram_free_start": vram_free[0] if vram_free else None,
        "vram_free_min": min(vram_free) if vram_free else None,
        "vram_free_end": vram_free[-1] if vram_free else None,
        "torch_vram_free_min": min(torch_vram_free) if torch_vram_free else None,
        "ram_free_start": ram_free[0] if ram_free else None,
        "ram_free_min": min(ram_free) if ram_free else None,
        "ram_free_end": ram_free[-1] if ram_free else None,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="http://127.0.0.1:9000/mcp")
    parser.add_argument("--comfy-endpoint", default="http://127.0.0.1:8188/system_stats")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--profile", choices=("sd15", "flux2-klein"), default="sd15")
    parser.add_argument("--require-tool", action="append", default=[])
    parser.add_argument("--prompt")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    tools_response = rpc(args.endpoint, "tools/list", {}, 1, min(args.timeout, 30))
    tools = tools_response.get("result", {}).get("tools", [])
    names = [tool.get("name") for tool in tools]
    profile_tools = {
        "sd15": ["generate_image", "generate_image_conditioned"],
        "flux2-klein": ["generate_flux2_klein_text", "generate_flux2_klein_reference_edit"],
    }
    required_tools = args.require_tool or profile_tools[args.profile]
    missing_tools = [name for name in required_tools if name not in names]
    if missing_tools:
        raise RuntimeError(
            "MCP bridge is reachable but required tools are unavailable: "
            + ", ".join(missing_tools)
        )

    if args.probe:
        print(json.dumps({
            "status": "ready",
            "profile": args.profile,
            "tool_count": len(tools),
            "required_tools": required_tools,
        }, sort_keys=True))
        return 0

    prompt = args.prompt or (
        "WP-015A pipeline smoke: one flat cyan circle centered on a plain white background"
        if args.profile == "sd15"
        else "WP-015B2A Gate 4 technical smoke: one flat cyan circle centered on a plain white background"
    )
    if args.profile == "sd15":
        tool_name = "generate_image"
        arguments = {
            "prompt": prompt,
            "negative_prompt": "text, watermark, logo, signature, detailed scene",
            "width": 256,
            "height": 256,
            "steps": 4,
            "cfg": 5.0,
            "sampler_name": "euler",
            "scheduler": "normal",
            "denoise": 1.0,
            "seed": 1,
            "return_inline_preview": False,
        }
    else:
        tool_name = "generate_flux2_klein_text"
        arguments = {
            "prompt": prompt,
            "seed": 15025000,
            "return_inline_preview": False,
        }
    telemetry_samples: list[dict] = []
    telemetry_errors: list[str] = []
    stop_telemetry = threading.Event()

    def collect_telemetry() -> None:
        while not stop_telemetry.is_set():
            try:
                telemetry_samples.append(read_json(args.comfy_endpoint))
            except Exception as error:
                telemetry_errors.append(str(error))
            stop_telemetry.wait(0.5)

    telemetry_thread = threading.Thread(target=collect_telemetry, daemon=True)
    started = time.perf_counter()
    telemetry_thread.start()
    generation_error: Exception | None = None
    result: object = {}
    try:
        response = rpc(
            args.endpoint,
            "tools/call",
            {"name": tool_name, "arguments": arguments},
            2,
            args.timeout,
        )
        result = nested_result(response)
        if isinstance(result, dict) and result.get("status") == "running":
            prompt_id = result.get("prompt_id")
            if not isinstance(prompt_id, str) or not prompt_id:
                raise RuntimeError("MCP bridge reported a running prompt without a prompt_id.")
            terminal = wait_for_comfy_prompt(
                comfy_base_url(args.comfy_endpoint),
                prompt_id,
                started + args.timeout,
            )
            result = {
                "bridge_interim": result,
                "comfy_terminal": terminal,
            }
        elif isinstance(result, dict) and result.get("status") in {"error", "failed", "failure"}:
            raise RuntimeError(f"MCP generation failed: {json.dumps(result, sort_keys=True)}")
    except Exception as error:
        generation_error = error
    finally:
        stop_telemetry.set()
        telemetry_thread.join(timeout=5)
        try:
            telemetry_samples.append(read_json(args.comfy_endpoint))
        except Exception as error:
            telemetry_errors.append(str(error))
    elapsed_seconds = time.perf_counter() - started
    telemetry = summarize_telemetry(telemetry_samples, elapsed_seconds, telemetry_errors)
    if generation_error is not None:
        raise RuntimeError(f"{generation_error}; telemetry={json.dumps(telemetry, sort_keys=True)}")
    settings = {
        "prompt": prompt,
        "seed": arguments["seed"],
        "return_inline_preview": False,
    }
    if args.profile == "sd15":
        settings.update({
            "width": arguments["width"],
            "height": arguments["height"],
            "steps": arguments["steps"],
            "cfg": arguments["cfg"],
            "sampler_name": arguments["sampler_name"],
            "scheduler": arguments["scheduler"],
            "denoise": arguments["denoise"],
        })
    else:
        settings.update({
            "width": 1024,
            "height": 1024,
            "steps": 4,
            "cfg": 1,
            "sampler_name": "euler",
            "batch_size": 1,
        })
    print(json.dumps({
        "status": "pass",
        "profile": args.profile,
        "tool": tool_name,
        "settings": settings,
        "telemetry": telemetry,
        "result": result,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
