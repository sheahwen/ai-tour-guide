import SimplePeer from "simple-peer";
import { EventEmitter } from "events";
import wrtc from "@roamhq/wrtc";

export interface WebRTCServerOptions {
  onAudioData?: (data: ArrayBuffer, sessionId: string) => void;
  onConnectionStateChange?: (
    state: RTCPeerConnectionState,
    sessionId: string
  ) => void;
  onError?: (error: Error, sessionId: string) => void;
}

export class WebRTCServer extends EventEmitter {
  private peers: Map<string, SimplePeer.Instance> = new Map();
  private options: WebRTCServerOptions;

  constructor(options: WebRTCServerOptions = {}) {
    super();
    this.options = options;
  }

  createPeerConnection(
    sessionId: string,
    initiatorSignal?: SimplePeer.SignalData
  ): SimplePeer.Instance {
    const peer = new SimplePeer({
      initiator: false,
      wrtc: wrtc,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    });

    this.peers.set(sessionId, peer);
    this.setupPeerEventListeners(peer, sessionId);

    if (initiatorSignal) {
      peer.signal(initiatorSignal);
    }

    return peer;
  }

  private setupPeerEventListeners(
    peer: SimplePeer.Instance,
    sessionId: string
  ): void {
    peer.on("signal", (data) => {
      this.emit("signal", { sessionId, signal: data });
    });

    peer.on("connect", () => {
      console.log(`WebRTC peer connected: ${sessionId}`);
      this.options.onConnectionStateChange?.("connected", sessionId);
    });

    peer.on("data", (data) => {
      // Received audio data from client
      if (data instanceof ArrayBuffer) {
        this.options.onAudioData?.(data, sessionId);
      }
    });

    peer.on("stream", (stream) => {
      console.log(`Received stream from client: ${sessionId}`);
      // Handle incoming audio stream from client
      this.processAudioStream(stream, sessionId);
    });

    peer.on("error", (error) => {
      console.error(`WebRTC peer error for ${sessionId}:`, error);
      this.options.onError?.(error, sessionId);
    });

    peer.on("close", () => {
      console.log(`WebRTC peer closed: ${sessionId}`);
      this.peers.delete(sessionId);
      this.options.onConnectionStateChange?.("closed", sessionId);
    });
  }

  private processAudioStream(stream: MediaStream, sessionId: string): void {
    // Process the incoming audio stream
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
      // Here we would typically set up audio processing
      // For now, we'll emit an event that the stream is ready
      this.emit("audioStreamReady", { sessionId, stream });
    }
  }

  sendAudioData(sessionId: string, audioData: ArrayBuffer): boolean {
    const peer = this.peers.get(sessionId);
    if (peer && peer.connected) {
      peer.send(audioData);
      return true;
    }
    return false;
  }

  handleSignal(sessionId: string, signal: SimplePeer.SignalData): void {
    const peer = this.peers.get(sessionId);
    if (peer) {
      peer.signal(signal);
    }
  }

  disconnectPeer(sessionId: string): void {
    const peer = this.peers.get(sessionId);
    if (peer) {
      peer.destroy();
      this.peers.delete(sessionId);
    }
  }

  getAllConnectedPeers(): string[] {
    return Array.from(this.peers.keys()).filter((sessionId) => {
      const peer = this.peers.get(sessionId);
      return peer?.connected;
    });
  }

  dispose(): void {
    for (const [sessionId, peer] of this.peers) {
      peer.destroy();
    }
    this.peers.clear();
    this.removeAllListeners();
  }
}
