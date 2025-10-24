import SimplePeer from "simple-peer";

export interface WebRTCClientOptions {
  onAudioData?: (data: ArrayBuffer) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onError?: (error: Error) => void;
}

export interface WebRTCSession {
  sessionId: string;
  isConnected: boolean;
}

export class WebRTCClient {
  private peer: SimplePeer.Instance | null = null;
  private localStream: MediaStream | null = null;
  private options: WebRTCClientOptions;
  private session: WebRTCSession | null = null;
  private isInitializing: boolean = false;
  private clientId: string;

  constructor(options: WebRTCClientOptions = {}) {
    this.options = options;
    this.clientId = Math.random().toString(36).substring(2, 15);
  }

  async initialize(): Promise<void> {
    // Prevent multiple initialization attempts
    if (this.isInitializing || this.peer) {
      console.log("WebRTC already initializing or initialized");
      return;
    }

    this.isInitializing = true;

    try {
      // Get user media (microphone access)
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000, // OpenAI Realtime API prefers 24kHz
        },
        video: false,
      });

      // Create peer connection
      this.peer = new SimplePeer({
        initiator: true,
        stream: this.localStream,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });

      this.setupPeerEventListeners();
    } catch (error) {
      this.isInitializing = false;
      this.options.onError?.(error as Error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  private setupPeerEventListeners(): void {
    if (!this.peer) return;

    this.peer.on("signal", (data) => {
      // Send signaling data to backend
      this.sendSignalingData(data);
    });

    this.peer.on("connect", () => {
      console.log("WebRTC connection established");
      this.options.onConnectionStateChange?.("connected");

      // Create OpenAI session after WebRTC connection is established
      if (this.session?.sessionId) {
        this.createOpenAISession(this.session.sessionId);
      }
    });

    this.peer.on("data", (data) => {
      // Received audio data from backend (AI response)
      if (data instanceof ArrayBuffer) {
        this.options.onAudioData?.(data);
      }
    });

    this.peer.on("stream", (stream) => {
      // Handle incoming audio stream from backend
      const audioElement = new Audio();
      audioElement.srcObject = stream;
      audioElement.play().catch(console.error);
    });

    this.peer.on("error", (error) => {
      console.error("WebRTC error:", error);
      this.options.onError?.(error);
    });

    this.peer.on("close", () => {
      console.log("WebRTC connection closed");
      this.options.onConnectionStateChange?.("closed");
    });
  }

  private async sendSignalingData(data: SimplePeer.SignalData): Promise<void> {
    try {
      const response = await fetch("/api/webrtc/signaling", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signal: data, clientId: this.clientId }),
      });

      if (!response.ok) {
        throw new Error(`Signaling failed: ${response.statusText}`);
      }

      const responseData = await response.json();
      const { signal: remoteSignal, sessionId, reused } = responseData;

      if (reused) {
        console.log("Connection reused, skipping signaling");
        return;
      }

      if (remoteSignal && this.peer) {
        this.peer.signal(remoteSignal);

        // Store session info
        this.session = {
          sessionId: sessionId,
          isConnected: false,
        };
      }
    } catch (error) {
      console.error("Signaling error:", error);
      this.options.onError?.(error as Error);
    }
  }

  private async createOpenAISession(sessionId: string): Promise<void> {
    try {
      const response = await fetch("/api/webrtc/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create OpenAI session: ${response.statusText}`
        );
      }

      console.log("OpenAI session created successfully");
      if (this.session) {
        this.session.isConnected = true;
      }
    } catch (error) {
      console.error("Failed to create OpenAI session:", error);
      this.options.onError?.(error as Error);
    }
  }

  sendAudioData(audioData: ArrayBuffer): void {
    if (this.peer && this.peer.connected) {
      this.peer.send(audioData);
    }
  }

  async startAudioCapture(): Promise<void> {
    if (!this.localStream) {
      await this.initialize();
    }
  }

  stopAudioCapture(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
  }

  disconnect(): void {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.stopAudioCapture();
  }

  get isConnected(): boolean {
    return this.peer?.connected ?? false;
  }

  get connectionState(): RTCPeerConnectionState {
    return (this.peer as any)?._pc?.connectionState ?? "closed";
  }
}
