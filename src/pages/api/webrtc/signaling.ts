import { NextApiRequest, NextApiResponse } from "next";
import { WebRTCServer } from "@/lib/webrtc-server";
import { RealtimeProxy } from "@/lib/realtime-proxy";
import { v4 as uuidv4 } from "uuid";

// Global instances to maintain state across requests
let webrtcServer: WebRTCServer | null = null;
let realtimeProxy: RealtimeProxy | null = null;

// Track active sessions to prevent duplicates
const activeSessions = new Set<string>();

// Initialize servers if not already done
function initializeServers() {
  if (!webrtcServer) {
    webrtcServer = new WebRTCServer({
      onAudioData: async (data, sessionId) => {
        // Forward audio data to OpenAI Realtime API
        if (realtimeProxy) {
          try {
            await realtimeProxy.sendAudioData(sessionId, data);
          } catch (error) {
            console.error("Failed to send audio to OpenAI:", error);
          }
        }
      },
      onConnectionStateChange: (state, sessionId) => {
        console.log(
          `WebRTC connection state changed: ${sessionId} -> ${state}`
        );
        if (state === "closed" && realtimeProxy) {
          realtimeProxy.closeSession(sessionId);
          activeSessions.delete(sessionId);
        }
      },
      onError: (error, sessionId) => {
        console.error(`WebRTC error for session ${sessionId}:`, error);
        activeSessions.delete(sessionId);
      },
    });
  }

  if (!realtimeProxy) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    realtimeProxy = new RealtimeProxy({
      apiKey,
      onAudioResponse: (audioData, sessionId) => {
        // Forward audio response back to client via WebRTC
        if (webrtcServer) {
          webrtcServer.sendAudioData(sessionId, audioData);
        }
      },
      onError: (error, sessionId) => {
        console.error(`OpenAI error for session ${sessionId}:`, error);
      },
      onSessionStateChange: (state, sessionId) => {
        console.log(`OpenAI session state changed: ${sessionId} -> ${state}`);
      },
    });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    initializeServers();

    const { signal, clientId } = req.body;
    if (!signal) {
      return res.status(400).json({ error: "Signal data is required" });
    }

    // Use clientId if provided, otherwise generate new sessionId
    const sessionId = clientId || uuidv4();

    console.log(`Received signaling request for session: ${sessionId}`);
    console.log(`Active sessions: ${Array.from(activeSessions).join(", ")}`);

    // Check if this session is already active
    if (activeSessions.has(sessionId)) {
      console.log(`Session ${sessionId} already exists, reusing connection`);
      return res.status(200).json({
        sessionId,
        message: "Session already active",
        reused: true,
      });
    }

    // Mark session as active
    activeSessions.add(sessionId);

    console.log(`Creating new WebRTC connection for session: ${sessionId}`);

    // Create WebRTC peer connection
    const peer = webrtcServer!.createPeerConnection(sessionId, signal);

    // Wait for peer to generate answer signal first
    const answerSignal = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        activeSessions.delete(sessionId);
        reject(new Error("Signaling timeout"));
      }, 10000); // 10 second timeout

      const signalHandler = (data: any) => {
        if (data.sessionId === sessionId) {
          clearTimeout(timeout);
          webrtcServer!.removeListener("signal", signalHandler);
          resolve(data.signal);
        }
      };

      webrtcServer!.on("signal", signalHandler);
    });

    // Create OpenAI Realtime session after WebRTC is established
    try {
      await realtimeProxy!.createSession(sessionId);
    } catch (error) {
      console.warn(
        "Failed to create OpenAI session immediately, will retry later:",
        error
      );
      // Don't fail the WebRTC connection if OpenAI session fails initially
    }

    res.status(200).json({
      sessionId,
      signal: answerSignal,
      reused: false,
    });
  } catch (error) {
    console.error("Signaling error:", error);
    res.status(500).json({
      error: "Failed to establish WebRTC connection",
      message: (error as Error).message,
    });
  }
}

// Cleanup function for graceful shutdown
process.on("SIGTERM", () => {
  if (webrtcServer) {
    webrtcServer.dispose();
  }
  if (realtimeProxy) {
    realtimeProxy.dispose();
  }
  activeSessions.clear();
});
