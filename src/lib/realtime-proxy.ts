import WebSocket from "ws";
import { EventEmitter } from "events";

export interface RealtimeProxyOptions {
  apiKey: string;
  onAudioResponse?: (audioData: ArrayBuffer, sessionId: string) => void;
  onError?: (error: Error, sessionId: string) => void;
  onSessionStateChange?: (state: string, sessionId: string) => void;
}

export interface RealtimeSession {
  id: string;
  websocket: WebSocket | null;
  isConnected: boolean;
  lastActivity: Date;
}

export class RealtimeProxy extends EventEmitter {
  private sessions: Map<string, RealtimeSession> = new Map();
  private options: RealtimeProxyOptions;
  private readonly OPENAI_REALTIME_URL =
    "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";

  constructor(options: RealtimeProxyOptions) {
    super();
    this.options = options;
  }

  async createSession(sessionId: string): Promise<RealtimeSession> {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session ${sessionId} already exists`);
    }

    const session: RealtimeSession = {
      id: sessionId,
      websocket: null,
      isConnected: false,
      lastActivity: new Date(),
    };

    try {
      // Create WebSocket connection to OpenAI Realtime API
      const ws = new WebSocket(this.OPENAI_REALTIME_URL, {
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      session.websocket = ws;
      this.sessions.set(sessionId, session);

      await this.setupWebSocketEventListeners(ws, sessionId);

      // Initialize the session with OpenAI
      await this.initializeOpenAISession(sessionId);

      return session;
    } catch (error) {
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  private async setupWebSocketEventListeners(
    ws: WebSocket,
    sessionId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ws.on("open", () => {
        console.log(
          `OpenAI Realtime WebSocket connected for session: ${sessionId}`
        );
        const session = this.sessions.get(sessionId);
        if (session) {
          session.isConnected = true;
          session.lastActivity = new Date();
        }
        this.options.onSessionStateChange?.("connected", sessionId);
        resolve();
      });

      ws.on("message", (data) => {
        this.handleOpenAIMessage(data, sessionId);
      });

      ws.on("error", (error) => {
        console.error(
          `OpenAI WebSocket error for session ${sessionId}:`,
          error
        );
        this.options.onError?.(error, sessionId);
        reject(error);
      });

      ws.on("close", (code, reason) => {
        console.log(
          `OpenAI WebSocket closed for session ${sessionId}:`,
          code,
          reason.toString()
        );
        const session = this.sessions.get(sessionId);
        if (session) {
          session.isConnected = false;
        }
        this.options.onSessionStateChange?.("disconnected", sessionId);
      });
    });
  }

  private async initializeOpenAISession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.websocket) return;

    // Configure the session for voice conversation
    const sessionConfig = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions:
          "You are a helpful AI tour guide. Provide brief, informative responses about places, attractions, and travel information. Keep responses concise and engaging.",
        voice: "alloy",
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 200,
        },
      },
    };

    session.websocket.send(JSON.stringify(sessionConfig));
  }

  private handleOpenAIMessage(data: WebSocket.Data, sessionId: string): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "session.created":
          console.log(`OpenAI session created: ${sessionId}`);
          break;

        case "response.audio.delta":
          // Received audio data from OpenAI
          if (message.delta) {
            const audioBuffer = Buffer.from(message.delta, "base64");
            this.options.onAudioResponse?.(audioBuffer.buffer, sessionId);
          }
          break;

        case "response.audio.done":
          console.log(`Audio response completed for session: ${sessionId}`);
          break;

        case "error":
          console.error(
            `OpenAI API error for session ${sessionId}:`,
            message.error
          );
          this.options.onError?.(new Error(message.error.message), sessionId);
          break;

        default:
          console.log(`Unhandled OpenAI message type: ${message.type}`);
      }

      // Update last activity
      const session = this.sessions.get(sessionId);
      if (session) {
        session.lastActivity = new Date();
      }
    } catch (error) {
      console.error(
        `Failed to parse OpenAI message for session ${sessionId}:`,
        error
      );
    }
  }

  async sendAudioData(
    sessionId: string,
    audioData: ArrayBuffer
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.websocket || !session.isConnected) {
      throw new Error(`Session ${sessionId} is not connected`);
    }

    // Convert audio data to base64 and send to OpenAI
    const base64Audio = Buffer.from(audioData).toString("base64");
    const message = {
      type: "input_audio_buffer.append",
      audio: base64Audio,
    };

    session.websocket.send(JSON.stringify(message));
    session.lastActivity = new Date();
  }

  async sendTextQuery(sessionId: string, text: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session?.websocket || !session.isConnected) {
      throw new Error(`Session ${sessionId} is not connected`);
    }

    // Send text input to OpenAI
    const message = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: text,
          },
        ],
      },
    };

    session.websocket.send(JSON.stringify(message));

    // Trigger response generation
    const responseMessage = {
      type: "response.create",
      response: {
        modalities: ["audio"],
      },
    };

    session.websocket.send(JSON.stringify(responseMessage));
    session.lastActivity = new Date();
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session?.websocket) {
      session.websocket.close();
    }
    this.sessions.delete(sessionId);
  }

  getSession(sessionId: string): RealtimeSession | undefined {
    return this.sessions.get(sessionId);
  }

  getAllSessions(): RealtimeSession[] {
    return Array.from(this.sessions.values());
  }

  // Clean up inactive sessions
  cleanupInactiveSessions(maxInactiveMinutes: number = 30): void {
    const now = new Date();
    const cutoff = new Date(now.getTime() - maxInactiveMinutes * 60 * 1000);

    for (const [sessionId, session] of this.sessions) {
      if (session.lastActivity < cutoff) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.closeSession(sessionId);
      }
    }
  }

  dispose(): void {
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
    this.removeAllListeners();
  }
}
