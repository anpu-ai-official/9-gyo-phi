let model;
self.onmessage = async ({ data }) => {
  try {
    if (!model) {
      self.postMessage({ id: data.id, stage: "Loading Kokoro runtime…" });
      const { KokoroTTS } = await import("./kokoro.web.js");
      self.postMessage({ id: data.id, stage: "Loading Kokoro voice model…" });
      model = await KokoroTTS.from_pretrained(
        "onnx-community/Kokoro-82M-v1.0-ONNX",
        {
          dtype: "q8",
          device: "wasm",
          progress_callback: (info) =>
            self.postMessage({ id: data.id, progress: info.progress || 0 }),
        },
      );
    }
    self.postMessage({ id: data.id, stage: "Synthesizing local narration…" });
    const result = await model.generate(data.text, {
      voice: data.voice,
      speed: data.speed,
    });
    self.postMessage(
      { id: data.id, audio: result.audio, rate: result.sampling_rate },
      [result.audio.buffer],
    );
  } catch (error) {
    self.postMessage({ id: data.id, error: error.message });
  }
};
