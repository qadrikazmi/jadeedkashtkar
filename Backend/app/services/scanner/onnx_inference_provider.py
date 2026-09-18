import io
import json
import os
import numpy as np
import onnxruntime as ort
from PIL import Image

from app.services.scanner.inference_provider import InferenceProvider, InferenceResult, ScanBreakdownItem


class OnnxInferenceProvider(InferenceProvider):
    def __init__(self, model_dir: str = "app/services/scanner/model"):
        self.model_path = os.path.join(model_dir, "disease_model.onnx")
        self.meta_path = os.path.join(model_dir, "class_metadata.json")

        with open(self.meta_path, "r", encoding="utf-8") as f:
            self.meta = json.load(f)

        self.pp = self.meta["preprocess"]
        self.classes = self.meta["classes"]
        self.threshold = self.meta["unknown_threshold"]
        self.top_n = self.meta["breakdown_top_n"]

        self.session = ort.InferenceSession(
            self.model_path, providers=["CPUExecutionProvider"])

    def _preprocess(self, img: Image.Image) -> np.ndarray:
        s = self.pp["input_size"]
        img = img.convert("RGB").resize((s, s), Image.BICUBIC)
        a = np.asarray(img, np.float32) / 255.0
        a = (a - np.array(self.pp["mean"], np.float32)
             ) / np.array(self.pp["std"], np.float32)
        return a.transpose(2, 0, 1)[None].astype(np.float32)

    def _softmax(self, z: np.ndarray) -> np.ndarray:
        e = np.exp(z - z.max())
        return e / e.sum()

    def classify(self, image_bytes: bytes) -> InferenceResult:
        img = Image.open(io.BytesIO(image_bytes))
        tensor = self._preprocess(img)
        logits = self.session.run(None, {"input": tensor})[0][0]
        probs = self._softmax(logits)

        top = int(probs.argmax())
        conf = float(probs[top])

        order = probs.argsort()[::-1][:self.top_n]
        breakdown = [
            ScanBreakdownItem(
                label=self.classes[i]["label"],
                pct=round(float(probs[i]) * 100, 1)
            )
            for i in order
        ]

        other = round(
            max(0.0, 1 - sum(p.pct for p in breakdown) / 100) * 100, 1)
        breakdown.append(ScanBreakdownItem(label="Other / unknown", pct=other))

        if conf < self.threshold:
            return InferenceResult(
                disease="Uncertain — retake photo / consult expert",
                latin_name=None,
                confidence_pct=round(conf * 100, 1),
                breakdown=breakdown,
                mitigations=[
                    "Low confidence. Retake a sharp, well-lit close-up of a single affected leaf.",
                    "If it recurs, consult your local agronomist with the photo."
                ],
                demo_mode=False
            )

        c = self.classes[top]
        return InferenceResult(
            disease=c["disease"],
            latin_name=c["latin_name"],
            confidence_pct=round(conf * 100, 1),
            breakdown=breakdown,
            mitigations=c["mitigations"],
            demo_mode=False
        )


_instance = None


def get_onnx_provider() -> OnnxInferenceProvider:
    global _instance
    if _instance is None:
        _instance = OnnxInferenceProvider()
    return _instance
