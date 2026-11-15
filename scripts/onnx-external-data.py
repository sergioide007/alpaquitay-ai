#!/usr/bin/env python3
"""
Moves the weights of a single-file ONNX model into <name>_data (same tensors, same graph) and declares that file
in config.json ("transformers.js_config.use_external_data_format") so transformers.js fetches it.

Why: onnxruntime-web parses a single-file model as ONE protobuf inside the Wasm heap. In a real VS Code Webview a
1.26 GB single-file Qwen2.5-Coder failed its first run with GPU/heap allocation errors; the same weights as
external data loaded and generated reliably.

    python scripts/onnx-external-data.py <model_dir> model_q4f16.onnx

Requires: pip install onnx
"""
import json
import os
import sys

import onnx


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    model_dir, name = sys.argv[1], sys.argv[2]
    path = os.path.join(model_dir, "onnx", name)
    data = name + "_data"
    if os.path.exists(os.path.join(model_dir, "onnx", data)):
        print(f"{path}: already uses external data ({data})")
        return 0
    model = onnx.load(path)
    count = len(model.graph.initializer)
    tmp = path + ".tmp.onnx"
    try:
        onnx.save_model(model, tmp, save_as_external_data=True, all_tensors_to_one_file=True,
                        location=data, size_threshold=1024)
        if len(onnx.load(tmp, load_external_data=False).graph.initializer) != count:
            raise AssertionError("initializer count changed")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

    cfg_path = os.path.join(model_dir, "config.json")
    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)
    cfg.setdefault("transformers.js_config", {}).setdefault("use_external_data_format", {})[name] = True
    with open(cfg_path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")
    print(f"{path}: {os.path.getsize(path)} graph bytes + {os.path.getsize(os.path.join(model_dir, 'onnx', data))} "
          f"in {data}; config.json updated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
