"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { RealtimeAgent, RealtimeSession } from "@openai/agents-realtime";

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any)
    | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any)
    | null;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

interface RealtimeHookState {
  isConnected: boolean;
  isConnecting: boolean;
  isListening: boolean;
  conversationActive: boolean;
  wakeWordDetected: boolean;
  error: string | null;
  agentName: string;
}

export function useRealtimeAgent() {
  const [state, setState] = useState<RealtimeHookState>({
    isConnected: false,
    isConnecting: false,
    isListening: false,
    conversationActive: false,
    wakeWordDetected: false,
    error: null,
    agentName: "Tour Guide",
  });

  const sessionRef = useRef<RealtimeSession | null>(null);
  const agentRef = useRef<RealtimeAgent | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wakeWord = process.env.NEXT_PUBLIC_WAKE_WORD || "guide";

  // Initialize speech recognition for wake word detection
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = "en-US";

        recognitionRef.current.onresult = handleSpeechResult;
        recognitionRef.current.onerror = handleSpeechError;
        recognitionRef.current.onend = handleSpeechEnd;
      } else {
        setState(prev => ({ ...prev, error: "Speech recognition not supported in this browser" }));
      }
    }

    return () => {
      // Cleanup on unmount
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (sessionRef.current) {
        sessionRef.current.close();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  // Initialize the agent
  useEffect(() => {
    agentRef.current = new RealtimeAgent({
      name: "Tour Guide",
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
  }, []);

  // Speech recognition handlers
  const handleSpeechResult = useCallback((event: SpeechRecognitionEvent) => {
    const results = Array.from(event.results);
    const transcript = results
      .map((result) => result[0].transcript)
      .join("")
      .toLowerCase()
      .trim();

    console.log("Speech transcript:", transcript);

    // Check for wake word (only if not already in conversation)
    if (
      !state.conversationActive &&
      !state.wakeWordDetected &&
      transcript.includes(wakeWord.toLowerCase())
    ) {
      console.log("Wake word detected! Starting conversation...");
      setState(prev => ({
        ...prev,
        wakeWordDetected: true,
        conversationActive: true,
      }));
      
      playWakeWordSound();
      resetSilenceTimer();
      
      // Connect to Realtime API when conversation starts
      if (!state.isConnected) {
        connect();
      }
      return;
    }

    // In conversation mode, reset silence timer on any speech
    if (state.conversationActive && transcript.length > 0) {
      resetSilenceTimer();
    }
  }, [state.conversationActive, state.wakeWordDetected, state.isConnected, wakeWord]);

  const handleSpeechError = useCallback((event: SpeechRecognitionErrorEvent) => {
    console.error("Speech recognition error:", event.error);
    if (event.error !== "no-speech") {
      setState(prev => ({ ...prev, error: `Speech recognition error: ${event.error}` }));
    }
  }, []);

  const handleSpeechEnd = useCallback(() => {
    if (state.isListening) {
      // Restart recognition if we're still supposed to be listening
      setTimeout(() => {
        if (recognitionRef.current && state.isListening) {
          recognitionRef.current.start();
        }
      }, 100);
    }
  }, [state.isListening]);

  // Silence timeout management
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    silenceTimerRef.current = setTimeout(() => {
      console.log("Conversation timeout - ending session");
      setState(prev => ({
        ...prev,
        conversationActive: false,
        wakeWordDetected: false,
      }));
      
      // Disconnect from Realtime API
      if (sessionRef.current) {
        sessionRef.current.close();
        sessionRef.current = null;
      }
    }, 10000); // 10 seconds of silence
  }, []);

  // Play wake word sound
  const playWakeWordSound = useCallback(() => {
    if (typeof window !== "undefined") {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!agentRef.current || state.isConnecting || state.isConnected) {
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

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

      // Create new session
      sessionRef.current = new RealtimeSession(agentRef.current, {
        model: "gpt-realtime",
      });

      // Connect to the session
      await sessionRef.current.connect({ apiKey: token });
      
      // Set connected state after successful connection
      setState(prev => ({ 
        ...prev, 
        isConnected: true, 
        isConnecting: false,
        isListening: true 
      }));
      
    } catch (error) {
      console.error("Failed to connect:", error);
      setState(prev => ({ 
        ...prev, 
        error: (error as Error).message,
        isConnecting: false 
      }));
    }
  }, [state.isConnecting, state.isConnected]);

  const disconnect = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    setState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isListening: false,
      conversationActive: false,
      wakeWordDetected: false,
    }));
  }, []);

  const startListening = useCallback(async () => {
    setState(prev => ({ ...prev, error: null }));

    try {
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setState(prev => ({ ...prev, isListening: true }));
      }
    } catch (err) {
      setState(prev => ({ ...prev, error: `Failed to start listening: ${(err as Error).message}` }));
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    setState(prev => ({ 
      ...prev, 
      isListening: false,
      conversationActive: false,
      wakeWordDetected: false,
    }));

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    // Disconnect from Realtime API
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    startListening,
    stopListening,
    clearError,
  };
}