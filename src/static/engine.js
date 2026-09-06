export const ENGINE_URL = "http://127.0.0.1:8765";
export async function engineRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${ENGINE_URL}${path}`, {
      ...options,
      signal: options.signal || AbortSignal.timeout(1500),
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "The local MLX engine is not connected. Start the optional engine or choose a system voice.",
    );
  }
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    throw new Error(
      data.error ||
        `The local engine returned ${response.status}. Please retry.`,
    );
  }
  return response;
}
export async function readEvents(response, onEvent) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines)
        if (line.trim()) await onEvent(JSON.parse(line));
      if (done) {
        if (pending.trim()) await onEvent(JSON.parse(pending));
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
