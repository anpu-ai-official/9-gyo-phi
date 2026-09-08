import { engineRequest, readEvents } from "./engine.js";
import { wavBytes } from "./core.js";
export class Player {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = "idle";
    this.generation = 0;
    this.index = 0;
    this.buffers = [];
    this.recordedSeconds = 0;
    this.workerId = 0;
  }
  update(state, detail = "") {
    this.state = state;
    this.onChange({ state, detail, index: this.index });
  }
  async context() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx;
  }
  stop() {
    this.generation++;
    const pendingWorker = this.workerPending;
    this.cancelWait?.();
    this.cancelWait = null;
    this.controller?.abort();
    this.controller = null;
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        /* Already ended. */
      }
      this.source.disconnect();
      this.source = null;
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    if (pendingWorker) {
      this.worker?.terminate();
      this.worker = null;
      this.workerPending = false;
    }
    this.update("idle");
  }
  async togglePause() {
    if (this.state === "playing") {
      this.update("paused");
      if (this.source) await this.ctx.suspend();
      else speechSynthesis.pause();
    } else if (this.state === "paused") {
      if (this.source) await this.ctx.resume();
      else speechSynthesis.resume();
      this.update("playing");
    }
  }
  async play(segments, start, options) {
    this.stop();
    const generation = this.generation;
    if (!segments.length) return;
    this.buffers = [];
    this.recordedSeconds = 0;
    this.controller = new AbortController();
    let prepared = null;
    const settle = (promise) =>
      promise.then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
    for (
      let index = start;
      index < segments.length && this.generation === generation;
      index++
    ) {
      this.index = index;
      if (!prepared) {
        this.update("loading", "Preparing voice…");
        const segment =
          index === start && options.firstText
            ? { ...segments[index], original_text: options.firstText }
            : segments[index];
        prepared = settle(this.prepare(segment, options, generation, false));
      }
      try {
        const result = await prepared;
        if (result.error) throw result.error;
        const { text, buffer } = result.value;
        if (this.generation !== generation) return;
        const nextIndex = index + 1;
        prepared =
          nextIndex < segments.length && options.engine !== "system"
            ? settle(
                this.prepare(segments[nextIndex], options, generation, true),
              )
            : null;
        if (buffer) {
          this.recordedSeconds += buffer.duration;
          if (this.recordedSeconds <= 1800) this.buffers.push(buffer);
          else {
            this.stop();
            this.update(
              "error",
              "The 30-minute recording limit is reached. Export this recording, then continue listening.",
            );
            return;
          }
          await this.playBuffer(buffer, generation);
        } else await this.speak(text, options, generation);
      } catch (error) {
        if (generation !== this.generation) return;
        this.stop();
        this.update(
          "error",
          error.message ||
            "Voice unavailable. Choose a system voice and retry.",
        );
        return;
      }
    }
    if (generation === this.generation) this.update("finished");
  }
  async prepare(segment, options, generation, prefetch) {
    const text = options.transform
      ? await options.transform(segment, { signal: this.controller.signal })
      : segment.original_text;
    if (this.generation !== generation) return { text, buffer: null };
    const buffer = await this.synthesize(
      text,
      { ...options, prefetch },
      generation,
    );
    return { text, buffer };
  }
  async synthesize(text, options, generation) {
    if (options.engine === "mlx") {
      const context = await this.context();
      if (generation !== this.generation) return null;
      const response = await engineRequest("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: options.voice || "af_heart",
          speed: options.speed,
          use_llm: false,
        }),
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(120000),
        ]),
      });
      const buffers = [];
      await readEvents(response, async (event) => {
        if (event.error) throw new Error(event.error);
        if (event.audio_b64 && generation === this.generation)
          buffers.push(
            await context.decodeAudioData(
              Uint8Array.from(atob(event.audio_b64), (c) => c.charCodeAt(0))
                .buffer,
            ),
          );
      });
      if (generation !== this.generation) return null;
      if (!buffers.length)
        throw new Error(
          "The engine returned no audio. Check its model installation and retry.",
        );
      const merged = context.createBuffer(
        1,
        buffers.reduce((sum, b) => sum + b.length, 0),
        context.sampleRate,
      );
      let offset = 0;
      for (const buffer of buffers) {
        merged.copyToChannel(buffer.getChannelData(0), 0, offset);
        offset += buffer.length;
      }
      return merged;
    }
    if (options.engine === "neural") {
      const ctx = await this.context();
      if (generation !== this.generation) return null;
      if (!this.worker)
        this.worker = new Worker(
          new URL("./neural-worker.js", import.meta.url),
          { type: "module" },
        );
      const worker = this.worker,
        id = ++this.workerId;
      return new Promise((resolve, reject) => {
        this.workerPending = true;
        const timeout = setTimeout(() => {
          worker.terminate();
          this.worker = null;
          finish(
            new Error(
              "Voice download timed out. Check your connection or choose a system voice.",
            ),
          );
        }, 180000);
        const finish = (error, buffer) => {
          clearTimeout(timeout);
          this.workerPending = false;
          this.cancelWait = null;
          error ? reject(error) : resolve(buffer);
        };
        this.cancelWait = () => finish(null, null);
        worker.onmessage = ({ data }) => {
          if (data.id !== id || generation !== this.generation) return;
          if (data.error)
            finish(
              new Error(
                "Neural voice unavailable. Check your connection or switch to System in Voice settings.",
              ),
            );
          else if (data.audio) {
            const buffer = ctx.createBuffer(
              1,
              data.audio.length,
              data.rate || 24000,
            );
            buffer.copyToChannel(data.audio, 0);
            finish(null, buffer);
          } else if (!options.prefetch)
            this.update(
              "loading",
              data.progress
                ? `Downloading voice · ${Math.round(data.progress)}%`
                : "Preparing neural voice…",
            );
        };
        worker.onerror = () => {
          worker.terminate();
          this.worker = null;
          finish(
            new Error(
              "Neural voice could not start. Switch to System in Voice settings.",
            ),
          );
        };
        worker.postMessage({
          id,
          text,
          voice: options.voice || "af_heart",
          speed: options.speed,
        });
      });
    }
    if (window.__TAURI__?.core) {
      const ctx = await this.context();
      const result = await window.__TAURI__.core.invoke(
        "synthesize_native_speech",
        {
          text,
          voice: options.voice || "default",
          rate: Math.round(180 * options.speed),
        },
      );
      if (generation !== this.generation) return null;
      return ctx.decodeAudioData(
        Uint8Array.from(atob(result.audio_b64), (c) => c.charCodeAt(0)).buffer,
      );
    }
    return null;
  }
  async playBuffer(buffer, generation) {
    const ctx = await this.context();
    if (generation !== this.generation) return;
    await new Promise((resolve) => {
      this.cancelWait = resolve;
      this.source = ctx.createBufferSource();
      this.source.buffer = buffer;
      this.source.connect(ctx.destination);
      this.source.onended = () => {
        this.source?.disconnect();
        this.source = null;
        this.cancelWait = null;
        resolve();
      };
      this.update("playing");
      this.source.start();
    });
  }
  speak(text, options, generation) {
    if (!window.speechSynthesis)
      throw new Error(
        "This browser has no speech support. Open the desktop app or use a supported browser.",
      );
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      this.utterance = utterance;
      utterance.rate = options.speed;
      const localVoices = speechSynthesis
        .getVoices()
        .filter((voice) => voice.localService);
      if (!localVoices.length) {
        reject(
          new Error(
            "No installed system voice is available yet. Open Voice preferences or use a neural voice. Cloud browser voices are excluded to keep your text private.",
          ),
        );
        return;
      }
      utterance.voice =
        localVoices.find((voice) => voice.name === options.voice) ||
        localVoices[0];
      let timeout = setTimeout(
        () =>
          reject(
            new Error(
              "The system voice did not respond. Choose another voice and retry.",
            ),
          ),
        15000,
      );
      const finish = (error) => {
        clearTimeout(timeout);
        if (this.cancelWait === cancel) this.cancelWait = null;
        error ? reject(error) : resolve();
      };
      const cancel = () => finish();
      this.cancelWait = cancel;
      utterance.onstart = () => {
        clearTimeout(timeout);
        timeout = null;
        if (generation === this.generation) this.update("playing");
      };
      utterance.onend = () => finish();
      utterance.onerror = (event) =>
        finish(
          ["canceled", "interrupted"].includes(event.error)
            ? null
            : new Error(
                `The system voice could not play (${event.error}). Try another voice.`,
              ),
        );
      speechSynthesis.speak(utterance);
    });
  }
  export() {
    return new Blob([wavBytes(this.buffers)], { type: "audio/wav" });
  }
}
