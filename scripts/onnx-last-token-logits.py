#!/usr/bin/env python3
"""
Makes a decoder ONNX graph compute logits for the LAST position only (what `logits_to_keep=1` does in
transformers). Generation never reads the other positions, but the onnx-community exports compute all of them:
with Gemma 3's 262 144-token vocabulary the prefill output is n x 262144 x 4 bytes (1 MiB per prompt token), and
a few hundred tokens exhaust GPU memory on an integrated GPU ("CreateCommittedResource ... OutOfMemory" in a
VS Code Webview). After this patch the logits are [batch, 1, vocab] whatever the prompt length.

Only the small graph file changes: initializers keep pointing at the same external data file, untouched.

    python scripts/onnx-last-token-logits.py <model_dir>/onnx/model_q4.onnx --verify   # in place, checked
    python scripts/onnx-last-token-logits.py in.onnx --out out.onnx

Requires: pip install onnx   (and onnxruntime numpy for --verify)
"""
import argparse
import os
import sys

import onnx
from onnx import TensorProto, helper

MARKER = "/alpaquitay/last_token_slice"


def patch(model: onnx.ModelProto, logits_name: str = "logits") -> bool:
    """Returns False when the graph is already patched; raises when its shape is not the expected one."""
    g = model.graph
    if any(n.name == MARKER for n in g.node):
        return False
    producers = [n for n in g.node if logits_name in n.output]
    if len(producers) != 1:
        raise ValueError(f"expected exactly one node producing '{logits_name}', found {len(producers)}")
    head = producers[0]
    if head.op_type not in ("MatMulNBits", "MatMul", "Gemm"):
        raise ValueError(f"'{logits_name}' comes from {head.op_type}, expected the lm_head MatMul")

    hidden = head.input[0]
    sliced = hidden + "/last_token"
    c = lambda name, v: helper.make_tensor(MARKER + "/" + name, TensorProto.INT64, [1], [v])
    consts = [c("starts", -1), c("ends", 2**62), c("axes", 1)]
    g.initializer.extend(consts)
    slice_node = helper.make_node("Slice", [hidden] + [t.name for t in consts], [sliced], name=MARKER)
    head.input[0] = sliced
    # Insert right before the lm_head so the node list stays topologically sorted.
    idx = list(g.node).index(head)
    g.node.insert(idx, slice_node)

    out = next((o for o in g.output if o.name == logits_name), None)
    if out is not None and out.type.tensor_type.HasField("shape") and len(out.type.tensor_type.shape.dim) == 3:
        d = out.type.tensor_type.shape.dim[1]
        d.Clear()
        d.dim_value = 1
    return True


def _feed(np, inp, tokens: int):
    """A deterministic prompt of `tokens` ids and an empty KV cache (first, prefill step)."""
    if inp.name == "input_ids":
        return (np.arange(tokens, dtype=np.int64) * 7919 % 20000 + 100)[None, :]
    if inp.name == "attention_mask":
        return np.ones((1, tokens), dtype=np.int64)
    if inp.name == "position_ids":
        return np.arange(tokens, dtype=np.int64)[None, :]
    if inp.name.startswith("past_key_values."):
        dims = [1 if d == "batch_size" else 0 if isinstance(d, str) else d for d in inp.shape]
        return np.zeros(dims, dtype=np.float16 if "float16" in inp.type else np.float32)
    raise ValueError(f"unexpected model input '{inp.name}'")


def verify(original: str, patched: str, tokens: int = 24) -> None:
    """Runs both graphs on ONNX Runtime (CPU) and requires identical last-token logits and KV-cache outputs."""
    import numpy as np
    import onnxruntime as ort

    def run(path):
        s = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
        feeds = {i.name: _feed(np, i, tokens) for i in s.get_inputs()}
        return dict(zip([o.name for o in s.get_outputs()], s.run(None, feeds)))

    before, after = run(original), run(patched)
    if after["logits"].shape[1] != 1:
        raise AssertionError(f"patched logits shape {after['logits'].shape}, expected [batch, 1, vocab]")
    if not np.allclose(before["logits"][:, -1:, :], after["logits"], rtol=1e-3, atol=1e-3):
        diff = float(np.max(np.abs(before["logits"][:, -1:, :] - after["logits"])))
        raise AssertionError(f"last-token logits differ (max abs diff {diff})")
    for k in before:
        if k != "logits" and not np.array_equal(before[k], after[k]):
            raise AssertionError(f"output '{k}' differs")
    print(f"verified on ONNX Runtime {ort.__version__} (CPU): last-token logits and {len(before) - 1} cache outputs match")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("model")
    ap.add_argument("--out", help="output path (default: overwrite the input)")
    ap.add_argument("--verify", action="store_true",
                    help="run original and patched graphs on onnxruntime (CPU) and require identical results "
                         "before writing (pip install onnxruntime numpy)")
    a = ap.parse_args()
    # Never load the weights: the graph file is rewritten, the external data file is not touched.
    model = onnx.load(a.model, load_external_data=False)
    if not patch(model):
        print(f"{a.model}: already patched (last-token logits)")
        return 0
    source = os.path.abspath(a.model)
    target = os.path.abspath(a.out or a.model)
    # Written next to the SOURCE so the external data file resolves; swapped in only after the optional check,
    # so a failed check never leaves a patched model behind. (onnx.checker is no use here: it rejects the
    # original graph too, whose ONNX Runtime contrib ops it does not know.)
    tmp = source + ".tmp.onnx"
    try:
        onnx.save(model, tmp)
        if a.verify:
            verify(source, tmp)
        os.replace(tmp, target)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    print(f"{target}: lm_head now computes logits for the last position only")
    return 0


if __name__ == "__main__":
    sys.exit(main())
