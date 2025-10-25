"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RealtimeAgent, RealtimeSession } from "@openai/agents-realtime";

interface UseRealtimeAgentOptions {
  onAudioStart?: () => void;
  onAudioStopped?: () => void;
  onUserSpeechStart?: () => void;
  onUserSpeechStop?: () => void;
}

interface UseRealtimeAgentReturn {
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  error: string | null;
  agentName: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  clearError: () => void;
}

export function useRealtimeAgent(
  options: UseRealtimeAgentOptions = {}
): UseRealtimeAgentReturn {
  const { onAudioStart, onAudioStopped, onUserSpeechStart, onUserSpeechStop } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<RealtimeSession | null>(null);
  const agentRef = useRef<RealtimeAgent | null>(null);
  const isConnectingRef = useRef(false); // Synchronous lock to prevent race conditions

  const agentName = "Tour Guide";

  // Initialize the agent
  useEffect(() => {
    // Only create agent if it doesn't exist (prevents recreation on strict mode remount)
    if (!agentRef.current) {
      console.log("Creating RealtimeAgent instance");
      agentRef.current = new RealtimeAgent({
        name: agentName,
        instructions: `You are a helpful AI tour guide. Provide brief, informative responses about places, attractions, and travel information. Keep responses concise and engaging. You can help with:

- Tourist attractions and landmarks
- Local restaurants and cuisine
- Transportation and directions
- Cultural information and history
- Weather and best times to visit
- Shopping and local markets
- Safety tips and travel advice

Always be friendly, helpful, and informative. Keep responses conversational and easy to understand.`,
      });
    }

    return () => {
      // Cleanup on unmount (runs during strict mode, hot reload, and actual unmount)
      console.log("useRealtimeAgent cleanup triggered");

      if (sessionRef.current) {
        console.log("Closing active session during cleanup");
        sessionRef.current.close();
        sessionRef.current = null;
      }

      // Clear all state
      isConnectingRef.current = false;

      // Note: We don't clear agentRef here to avoid recreation on strict mode remount
    };
  }, []);

  const connect = useCallback(async () => {
    // Use ref-based lock to prevent race conditions (state updates are async)
    if (!agentRef.current) {
      console.error("Cannot connect: RealtimeAgent not initialized");
      setError("Agent not initialized");
      return;
    }

    if (isConnectingRef.current || sessionRef.current) {
      console.log("Connection already in progress or active, ignoring duplicate call");
      return;
    }

    // Set synchronous lock immediately
    isConnectingRef.current = true;
    setIsConnecting(true);
    setError(null);

    try {
      // Get ephemeral token from backend
      const tokenResponse = await fetch("/api/realtime/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!tokenResponse.ok) {
        throw new Error("Failed to get authentication token");
      }

      const { token } = await tokenResponse.json();

      // Create new session with WebRTC transport (automatic in browser)
      sessionRef.current = new RealtimeSession(agentRef.current, {
        model: "gpt-realtime",
        config: {
          audio: {
            input: {
              turnDetection: {
                type: "server_vad",
                threshold: 0.8, // Much higher threshold (less sensitive)
                silenceDurationMs: 1000, // Wait 1 second of silence
                prefixPaddingMs: 500, // More audio padding
                createResponse: true, // Automatically trigger AI response
              },
            },
          },
        },
      });

      // Connect to the session
      await sessionRef.current.connect({ apiKey: token });

      // Listen for audio events to track when AI is speaking
      sessionRef.current.on("audio_start", () => {
        console.log("AI started speaking");
        setIsSpeaking(true);
        onAudioStart?.();
      });

      sessionRef.current.on("audio_stopped", () => {
        console.log("AI stopped speaking");
        setIsSpeaking(false);
        onAudioStopped?.();
      });

      // Listen for user speech events via transport layer
      sessionRef.current.on("transport_event", (event) => {
        if (event.type === "input_audio_buffer.speech_started") {
          console.log("User started speaking");
          onUserSpeechStart?.();
        } else if (event.type === "input_audio_buffer.speech_stopped") {
          console.log("User stopped speaking");
          onUserSpeechStop?.();
        }
      });

      setIsConnected(true);
      setIsConnecting(false);
      // Keep lock set - will be cleared on disconnect

      console.log("Connected to OpenAI Realtime API via WebRTC");
      console.log("Turn detection config:", {
        threshold: 0.8,
        silenceDurationMs: 1000,
      });
    } catch (err) {
      console.error("Failed to connect:", err);
      setError((err as Error).message);
      setIsConnecting(false);
      isConnectingRef.current = false; // Clear lock on error
    }
  }, []);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setIsConnected(false);
    setIsConnecting(false);
    setIsSpeaking(false);
    isConnectingRef.current = false; // Clear lock on disconnect
    console.log("Disconnected from OpenAI Realtime API");
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isConnected,
    isConnecting,
    isSpeaking,
    error,
    agentName,
    connect,
    disconnect,
    clearError,
  };
}
