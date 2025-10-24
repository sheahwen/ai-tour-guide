export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor() {
    // Initialize AudioContext when needed
  }

  async initialize(stream: MediaStream): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();

      // Create audio source from stream
      this.source = this.audioContext.createMediaStreamSource(stream);

      // Create processor for audio data
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

      // Connect nodes
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error("Failed to initialize audio processor:", error);
      throw error;
    }
  }

  onAudioProcess(callback: (audioData: Float32Array) => void): void {
    if (this.processor) {
      this.processor.onaudioprocess = (event) => {
        const inputBuffer = event.inputBuffer;
        const audioData = inputBuffer.getChannelData(0);
        callback(audioData);
      };
    }
  }

  // Convert Float32Array to PCM16 format for OpenAI
  convertToPCM16(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, sample * 0x7fff, true);
    }

    return buffer;
  }

  // Convert PCM16 to Float32Array for playback
  convertFromPCM16(arrayBuffer: ArrayBuffer): Float32Array {
    const view = new DataView(arrayBuffer);
    const float32Array = new Float32Array(arrayBuffer.byteLength / 2);

    for (let i = 0; i < float32Array.length; i++) {
      const sample = view.getInt16(i * 2, true);
      float32Array[i] = sample / 0x7fff;
    }

    return float32Array;
  }

  async playAudioBuffer(audioData: ArrayBuffer): Promise<void> {
    if (!this.audioContext) return;

    try {
      const float32Data = this.convertFromPCM16(audioData);
      const audioBuffer = this.audioContext.createBuffer(
        1,
        float32Data.length,
        24000
      );
      audioBuffer.getChannelData(0).set(float32Data);

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.start();
    } catch (error) {
      console.error("Failed to play audio buffer:", error);
    }
  }

  dispose(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
