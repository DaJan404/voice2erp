"use client";

export type VoiceSessionState =
  | "idle"
  | "connecting"
  | "listening"
  | "understanding"
  | "querying"
  | "speaking"
  | "error";

export type TranscriptSpeaker = "user" | "agent";

export type VoiceAgentCallbacks = {
  onStateChange: (state: VoiceSessionState) => void;
  onTranscript: (
    speaker: TranscriptSpeaker,
    text: string,
    isFinal: boolean,
  ) => void;
  onToolCall: (name: string, args: unknown) => void;
  onError: (message: string) => void;
};

type VoiceTokenResponse = {
  token: string;
  agent_id: string;
  expires_in_seconds: number;
};

const WIRE_RATE = 24_000;

const CAPTURE_WORKLET = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ratio = sampleRate / ${WIRE_RATE};
    this._pos = 0;
    this._prev = 0;
    this._src = null;
    this._out = null;
  }

  _toPcm(samples, len) {
    const pcm = new Int16Array(len);
    for (let i = 0; i < len; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    if (this._ratio === 1) {
      const pcm = this._toPcm(channel, channel.length);
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
      return true;
    }

    const length = channel.length;
    if (!this._src || this._src.length < length + 1) {
      this._src = new Float32Array(length + 1);
      this._out = new Float32Array(
        Math.ceil((length + 1) / this._ratio) + 2,
      );
    }

    const source = this._src;
    const output = this._out;
    source[0] = this._prev;
    source.set(channel, 1);

    let outputLength = 0;
    let position = this._pos;

    while (position < length) {
      const index = Math.floor(position);
      const fraction = position - index;
      output[outputLength++] =
        source[index] +
        (source[index + 1] - source[index]) * fraction;
      position += this._ratio;
    }

    this._pos = position - length;
    this._prev = channel[length - 1];

    if (outputLength) {
      const pcm = this._toPcm(output, outputLength);
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }

    return true;
  }
}

registerProcessor("voice2erp-capture", CaptureProcessor);
`;

const PLAYBACK_WORKLET = `
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._ring = new Float32Array(sampleRate * 30);
    this._writePos = 0;
    this._readPos = 0;
    this._available = 0;
    this._step = ${WIRE_RATE} / sampleRate;
    this._resamplePosition = 0;
    this._resamplePrevious = 0;
    this._drained = false;

    this.port.onmessage = (event) => {
      if (event.data === "stop") {
        this._writePos = 0;
        this._readPos = 0;
        this._available = 0;
        this._resamplePosition = 0;
        this._resamplePrevious = 0;
        return;
      }

      const int16 = new Int16Array(event.data);
      if (!int16.length) return;

      if (this._drained) {
        this._resamplePrevious = 0;
        this._resamplePosition = 0;
        this._drained = false;
      }

      if (this._step === 1) {
        for (let i = 0; i < int16.length; i++) {
          this._push(int16[i] / 32768);
        }
        return;
      }

      const length = int16.length;
      let position = this._resamplePosition;

      while (position < length) {
        const index = Math.floor(position);
        const fraction = position - index;
        const a =
          index === 0
            ? this._resamplePrevious
            : int16[index - 1] / 32768;
        const b = int16[index] / 32768;
        this._push(a + (b - a) * fraction);
        position += this._step;
      }

      this._resamplePosition = position - length;
      this._resamplePrevious = int16[length - 1] / 32768;
    };
  }

  _push(value) {
    if (this._available >= this._ring.length) return;

    this._ring[this._writePos] = value;
    this._writePos = (this._writePos + 1) % this._ring.length;
    this._available++;
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const firstChannel = output[0];
    const capacity = this._ring.length;

    for (let i = 0; i < firstChannel.length; i++) {
      if (this._available > 0) {
        firstChannel[i] = this._ring[this._readPos];
        this._readPos = (this._readPos + 1) % capacity;
        this._available--;
      } else {
        firstChannel[i] = 0;
        this._drained = true;
      }
    }

    for (let channel = 1; channel < output.length; channel++) {
      output[channel].set(firstChannel);
    }

    return true;
  }
}

registerProcessor("voice2erp-playback", PlaybackProcessor);
`;

function blobUrl(code: string) {
  return URL.createObjectURL(
    new Blob([code], { type: "application/javascript" }),
  );
}

async function addWorklet(
  context: AudioContext,
  code: string,
  name: string,
) {
  const url = blobUrl(code);

  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }

  return new AudioWorkletNode(context, name);
}

function encodeBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + 0x8000),
    );
  }

  return window.btoa(binary);
}

function decodeBase64(value: string) {
  const raw = window.atob(value);
  const bytes = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index++) {
    bytes[index] = raw.charCodeAt(index);
  }

  return bytes.buffer;
}

function appendTranscriptDelta(text: string, delta: string) {
  if (!delta) return text;
  if (!text) return delta;
  if (/^\s/.test(delta) || /\s$/.test(text)) return text + delta;
  if (/^[.,!?;:%°)\]}…'"’”]/.test(delta)) return text + delta;
  if (/[([{$\-\/'"‘“]$/.test(text)) return text + delta;
  return text + " " + delta;
}

function stringValue(
  message: Record<string, unknown>,
  key: string,
) {
  const value = message[key];
  return typeof value === "string" ? value : "";
}

function isVoiceTokenResponse(
  value: unknown,
): value is VoiceTokenResponse {
  if (!value || typeof value !== "object") return false;

  return (
    "token" in value &&
    typeof value.token === "string" &&
    value.token.length > 0 &&
    "agent_id" in value &&
    typeof value.agent_id === "string" &&
    value.agent_id.length > 0
  );
}

export class VoiceAgentSession {
  private socket: WebSocket | null = null;
  private captureContext: AudioContext | null = null;
  private playbackContext: AudioContext | null = null;
  private playback: AudioWorkletNode | null = null;
  private microphone: MediaStream | null = null;
  private manuallyStopped = false;
  private ready = false;
  private agentPartial = "";
  private liveReplyId = "";
  private printedReplyId = "";

  constructor(private readonly callbacks: VoiceAgentCallbacks) {}

  async start() {
    if (this.socket || this.captureContext || this.microphone) {
      return;
    }

    this.manuallyStopped = false;
    this.ready = false;
    this.agentPartial = "";
    this.liveReplyId = "";
    this.printedReplyId = "";
    this.callbacks.onStateChange("connecting");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone access is not available in this browser.",
        );
      }

      const tokenResponse = await fetch("/api/voice-token", {
        cache: "no-store",
      });
      const tokenData: unknown = await tokenResponse.json();

      if (this.manuallyStopped) {
        return;
      }

      if (!tokenResponse.ok || !isVoiceTokenResponse(tokenData)) {
        throw new Error("Could not create a voice session.");
      }

      this.captureContext = new AudioContext({
        sampleRate: WIRE_RATE,
      });
      this.playbackContext = new AudioContext({
        sampleRate: WIRE_RATE,
      });

      await Promise.all([
        this.captureContext.resume(),
        this.playbackContext.resume(),
      ]);

      this.playback = await addWorklet(
        this.playbackContext,
        PLAYBACK_WORKLET,
        "voice2erp-playback",
      );
      this.playback.connect(this.playbackContext.destination);

      this.microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      if (this.manuallyStopped) {
        this.cleanupMedia();
        return;
      }

      const capture = await addWorklet(
        this.captureContext,
        CAPTURE_WORKLET,
        "voice2erp-capture",
      );

      this.captureContext
        .createMediaStreamSource(this.microphone)
        .connect(capture);

      const websocketUrl = new URL(
        "wss://agents.assemblyai.com/v1/ws",
      );
      websocketUrl.searchParams.set("token", tokenData.token);

      const socket = new WebSocket(websocketUrl);
      this.socket = socket;

      capture.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
        if (
          !this.ready ||
          socket.readyState !== WebSocket.OPEN
        ) {
          return;
        }

        socket.send(
          JSON.stringify({
            type: "input.audio",
            audio: encodeBase64(data),
          }),
        );
      };

      socket.onopen = () => {
        socket.send(
          JSON.stringify({
            type: "session.update",
            session: { agent_id: tokenData.agent_id },
          }),
        );
      };

      socket.onmessage = ({ data }) => {
        this.handleMessage(String(data));
      };

      socket.onclose = () => {
        this.socket = null;
        this.ready = false;
        this.cleanupMedia();

        if (!this.manuallyStopped) {
          this.callbacks.onStateChange("idle");
        }
      };

      socket.onerror = () => {
        this.fail("Voice connection failed.");
      };
    } catch (error) {
      this.fail(
        error instanceof Error
          ? error.message
          : "Could not start the voice session.",
      );
    }
  }

  requestReply(instructions: string) {
    const normalizedInstructions = instructions.trim();
    const socket = this.socket;

    if (
      !normalizedInstructions ||
      !this.ready ||
      !socket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return false;
    }

    socket.send(
      JSON.stringify({
        type: "reply.create",
        instructions: normalizedInstructions,
      }),
    );
    this.callbacks.onStateChange("understanding");

    return true;
  }

  stop(notify = true) {
    this.manuallyStopped = true;
    this.ready = false;
    this.playback?.port.postMessage("stop");
    this.cleanupMedia();

    const socket = this.socket;
    this.socket = null;

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "session.end" }));
      window.setTimeout(() => {
        if (socket.readyState <= WebSocket.OPEN) {
          socket.close();
        }
      }, 1200);
    } else {
      socket?.close();
    }

    if (notify) {
      this.callbacks.onStateChange("idle");
    }
  }

  private handleMessage(payload: string) {
    let message: Record<string, unknown>;

    try {
      const parsed: unknown = JSON.parse(payload);
      if (!parsed || typeof parsed !== "object") return;
      message = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    switch (stringValue(message, "type")) {
      case "session.ready":
        this.ready = true;
        this.callbacks.onStateChange("listening");
        break;

      case "input.speech.started":
        this.playback?.port.postMessage("stop");
        this.callbacks.onStateChange("listening");
        break;

      case "transcript.user.delta": {
        const text = stringValue(message, "text");
        if (text) {
          this.callbacks.onTranscript("user", text, false);
        }
        break;
      }

      case "transcript.user": {
        const text = stringValue(message, "text");
        if (text) {
          this.callbacks.onTranscript("user", text, true);
          this.callbacks.onStateChange("understanding");
        }
        break;
      }

      case "tool.call": {
        const name = stringValue(message, "name");
        if (name) {
          this.callbacks.onStateChange("querying");
          this.callbacks.onToolCall(name, message.arguments);
        }
        break;
      }

      case "reply.started":
        this.callbacks.onStateChange("speaking");
        break;

      case "reply.audio": {
        const data = stringValue(message, "data");
        if (data) {
          const audio = decodeBase64(data);
          this.playback?.port.postMessage(audio, [audio]);
        }
        break;
      }

      case "transcript.agent.delta": {
        const delta = stringValue(message, "delta");
        const replyId = stringValue(message, "reply_id");

        if (replyId && replyId === this.printedReplyId) {
          break;
        }

        if (replyId && replyId !== this.liveReplyId) {
          this.liveReplyId = replyId;
          this.agentPartial = "";
        }

        this.agentPartial = appendTranscriptDelta(
          this.agentPartial,
          delta,
        );

        if (this.agentPartial) {
          this.callbacks.onTranscript(
            "agent",
            this.agentPartial,
            false,
          );
        }
        break;
      }

      case "transcript.agent": {
        const text = stringValue(message, "text");
        const replyId = stringValue(message, "reply_id");

        if (replyId) {
          this.printedReplyId = replyId;
        }

        this.agentPartial = text;

        if (text) {
          this.callbacks.onTranscript("agent", text, true);
        }
        break;
      }

      case "reply.done":
        if (stringValue(message, "status") === "interrupted") {
          this.playback?.port.postMessage("stop");
        }
        this.callbacks.onStateChange("listening");
        break;

      case "session.error":
        this.fail(
          stringValue(message, "message") ||
            "The voice session reported an error.",
        );
        break;

      case "session.ended":
        this.ready = false;
        this.cleanupMedia();
        this.socket?.close();
        this.socket = null;
        this.callbacks.onStateChange("idle");
        break;

      default:
        break;
    }
  }

  private fail(message: string) {
    this.manuallyStopped = true;
    this.ready = false;
    this.playback?.port.postMessage("stop");
    this.cleanupMedia();

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    this.callbacks.onError(message);
    this.callbacks.onStateChange("error");
  }

  private cleanupMedia() {
    this.microphone?.getTracks().forEach((track) => track.stop());
    this.microphone = null;

    if (this.captureContext) {
      void this.captureContext.close();
      this.captureContext = null;
    }

    if (this.playbackContext) {
      void this.playbackContext.close();
      this.playbackContext = null;
    }

    this.playback = null;
  }
}
