import { NextApiRequest, NextApiResponse } from "next";
import { RealtimeProxy } from "@/lib/realtime-proxy";

// Global instance to maintain state across requests
let realtimeProxy: RealtimeProxy | null = null;

function initializeRealtimeProxy() {
  if (!realtimeProxy) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    realtimeProxy = new RealtimeProxy({
      apiKey,
      onAudioResponse: (audioData, sessionId) => {
        console.log(`Received audio response for session: ${sessionId}`);
        // Audio will be handled by WebRTC connection
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
    initializeRealtimeProxy();

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "Session ID is required" });
    }

    // Create OpenAI Realtime session
    await realtimeProxy!.createSession(sessionId);

    res.status(200).json({
      success: true,
      message: "OpenAI session created successfully",
    });
  } catch (error) {
    console.error("OpenAI session creation error:", error);
    res.status(500).json({
      error: "Failed to create OpenAI session",
      message: (error as Error).message,
    });
  }
}
