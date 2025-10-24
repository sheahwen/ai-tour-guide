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
  try {
    initializeRealtimeProxy();

    if (req.method === "POST") {
      const { query, sessionId } = req.body;

      if (!query) {
        return res.status(400).json({ error: "Query is required" });
      }

      // If sessionId is provided, use existing session, otherwise this is a simple text query
      if (sessionId) {
        const session = realtimeProxy!.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: "Session not found" });
        }

        await realtimeProxy!.sendTextQuery(sessionId, query);
        res.status(200).json({ message: "Query sent successfully" });
      } else {
        // For simple text queries without WebRTC (fallback)
        // This could be used for testing or as a backup
        res.status(200).json({
          message: "Text query received",
          response: "I received your message: " + query,
        });
      }
    } else if (req.method === "GET") {
      // Get session information
      const { sessionId } = req.query;

      if (sessionId && typeof sessionId === "string") {
        const session = realtimeProxy!.getSession(sessionId);
        if (session) {
          res.status(200).json({
            sessionId: session.id,
            isConnected: session.isConnected,
            lastActivity: session.lastActivity,
          });
        } else {
          res.status(404).json({ error: "Session not found" });
        }
      } else {
        // Get all sessions
        const sessions = realtimeProxy!.getAllSessions();
        res.status(200).json({
          sessions: sessions.map((s) => ({
            sessionId: s.id,
            isConnected: s.isConnected,
            lastActivity: s.lastActivity,
          })),
        });
      }
    } else if (req.method === "DELETE") {
      // Close session
      const { sessionId } = req.query;

      if (!sessionId || typeof sessionId !== "string") {
        return res.status(400).json({ error: "Session ID is required" });
      }

      realtimeProxy!.closeSession(sessionId);
      res.status(200).json({ message: "Session closed successfully" });
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Realtime session error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: (error as Error).message,
    });
  }
}

// Cleanup inactive sessions periodically
setInterval(() => {
  if (realtimeProxy) {
    realtimeProxy.cleanupInactiveSessions(30); // 30 minutes
  }
}, 5 * 60 * 1000); // Check every 5 minutes
