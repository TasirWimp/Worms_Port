"""Probe the loopback ComfyUI MCP bridge and optionally run a bounded smoke image."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default="http://127.0.0.1:9000/mcp")
    parser.add_argument("--probe", action="store_true")
    parser.add_argument("--prompt", default="WP-015A pipeline smoke: one flat cyan circle centered on a plain white background")
    parser.add_argument("--timeout", type=int, default=300)
    args = parser.parse_args()

    tools_response = rpc(args.endpoint, "tools/list", {}, 1, min(args.timeout, 30))
    tools = tools_response.get("result", {}).get("tools", [])
    names = [tool.get("name") for tool in tools]
    if "generate_image" not in names:
        raise RuntimeError("MCP bridge is reachable but generate_image is unavailable.")

    if args.probe:
        print(json.dumps({"status": "ready", "tool_count": len(tools), "generate_image": True}, sort_keys=True))
        return 0

    arguments = {
        "prompt": args.prompt,
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
    response = rpc(
        args.endpoint,
        "tools/call",
        {"name": "generate_image", "arguments": arguments},
        2,
        args.timeout,
    )
    result = nested_result(response)
    print(json.dumps({
        "status": "pass",
        "profile": "256x256-4-step-seed-1",
        "result": result,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
