"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { WebRTCClient } from "@/lib/webrtc";
import { AudioProcessor } from "@/lib/audio-processor";

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

export function useAudioManager() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationActive, setConversationActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);

  const webrtcClient = useRef<WebRTCClient | null>(null);
  const audioProcessor = useRef<AudioProcessor | null>(null);
  const recognition = useRef<SpeechRecognition | null>(null);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);
  const wakeWord = process.env.NEXT_PUBLIC_WAKE_WORD || "guide";

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRecognition) {
        recognition.current = new SpeechRecognition();
        recognition.current.continuous = true;
        recognition.current.interimResults = true;
        recognition.current.lang = "en-US";

        recognition.current.onresult = handleSpeechResult;
        recognition.current.onerror = handleSpeechError;
        recognition.current.onend = handleSpeechEnd;
      } else {
        setError("Speech recognition not supported in this browser");
      }
    }

    return () => {
      cleanup();
    };
  }, []);

  // Initialize WebRTC client
  const initializeWebRTC = useCallback(async () => {
    if (isInitialized || webrtcClient.current) {
      console.log("WebRTC already initialized");
      return;
    }

    try {
      setIsInitialized(true);

      webrtcClient.current = new WebRTCClient({
        onAudioData: handleIncomingAudio,
        onConnectionStateChange: handleConnectionStateChange,
        onError: handleWebRTCError,
      });

      audioProcessor.current = new AudioProcessor();

      await webrtcClient.current.initialize();
      console.log("WebRTC initialized successfully");
    } catch (err) {
      setIsInitialized(false);
      setError(`Failed to initialize audio: ${(err as Error).message}`);
    }
  }, [isInitialized]);

  const handleSpeechResult = useCallback(
    (event: SpeechRecognitionEvent) => {
      const results = Array.from(event.results);
      const transcript = results
        .map((result) => result[0].transcript)
        .join("")
        .toLowerCase()
        .trim();

      console.log("Speech transcript:", transcript);
      console.log(
        "Current state - conversationActive:",
        conversationActive,
        "wakeWordDetected:",
        wakeWordDetected,
        "isProcessing:",
        isProcessing,
        "isSpeaking:",
        isSpeaking
      );

      // Ignore speech input if we're currently processing or AI is speaking
      if (isProcessing || isSpeaking) {
        console.log(
          "🚫 Ignoring speech input - system is busy (processing or speaking)"
        );
        return;
      }

      // Check for wake word (only if not already in conversation)
      if (
        !conversationActive &&
        !wakeWordDetected &&
        transcript.includes(wakeWord.toLowerCase())
      ) {
        console.log("Wake word detected! Starting conversation...");
        setWakeWordDetected(true);
        setConversationActive(true);
        playWakeWordSound();
        resetSilenceTimer();

        // Initialize WebRTC when conversation starts
        if (!isInitialized) {
          initializeWebRTC();
        }
        return; // Exit early to prevent processing as query
      }

      // In conversation mode, process the query
      if (conversationActive && transcript.length > 0) {
        resetSilenceTimer();

        console.log("In conversation mode, transcript:", transcript);
        console.log(
          "Results:",
          results.map((r) => ({
            transcript: r[0].transcript,
            isFinal: r.isFinal,
          }))
        );

        // Check if this is a final result
        const lastResult = results[results.length - 1];
        console.log("Last result isFinal:", lastResult?.isFinal);

        if (lastResult && lastResult.isFinal) {
          // Extract the query part after the wake word
          const queryPart = transcript
            .replace(wakeWord.toLowerCase(), "")
            .trim();
          console.log("Extracted query part:", queryPart);

          if (queryPart.length > 0) {
            console.log("Processing query:", queryPart);
            processUserQuery(queryPart);
          } else {
            console.log("No query part found after wake word removal");
          }
        } else {
          console.log("Not a final result, waiting for more speech...");
        }
      }
    },
    [
      conversationActive,
      wakeWordDetected,
      wakeWord,
      isInitialized,
      isProcessing,
      isSpeaking,
    ]
  );

  const handleSpeechError = useCallback(
    (event: SpeechRecognitionErrorEvent) => {
      console.error("Speech recognition error:", event.error);
      if (event.error !== "no-speech") {
        setError(`Speech recognition error: ${event.error}`);
      }
    },
    []
  );

  const handleSpeechEnd = useCallback(() => {
    if (isListening) {
      // Restart recognition if we're still supposed to be listening
      setTimeout(() => {
        if (recognition.current && isListening) {
          recognition.current.start();
        }
      }, 100);
    }
  }, [isListening]);

  const handleIncomingAudio = useCallback(async (audioData: ArrayBuffer) => {
    // Play incoming audio from AI
    if (audioProcessor.current) {
      await audioProcessor.current.playAudioBuffer(audioData);
    }
  }, []);

  const handleConnectionStateChange = useCallback(
    (state: RTCPeerConnectionState) => {
      console.log("WebRTC connection state:", state);
      if (state === "failed" || state === "disconnected") {
        setError("Connection to server lost");
      }
    },
    []
  );

  const handleWebRTCError = useCallback((err: Error) => {
    setError(`WebRTC error: ${err.message}`);
  }, []);

  const processUserQuery = useCallback(
    async (query: string) => {
      console.log("🚀 processUserQuery called with:", query);

      // Prevent multiple simultaneous queries
      if (isProcessing) {
        console.log("🚫 Already processing a query, ignoring new request");
        return;
      }

      setIsProcessing(true);

      try {
        console.log("📤 Sending query to backend...");
        // Send query to backend via WebRTC or fetch
        const response = await fetch("/api/realtime/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
        });

        console.log("📥 Backend response status:", response.status);

        if (!response.ok) {
          throw new Error(`Failed to process query: ${response.statusText}`);
        }

        const responseData = await response.json();
        console.log("📄 Backend response data:", responseData);

        console.log("🔊 AI is now speaking...");
        setIsSpeaking(true);

        // Set a more reasonable timeout for AI response
        // In a real implementation, this should be based on actual audio duration
        setTimeout(() => {
          console.log("🔇 AI finished speaking");
          setIsSpeaking(false);
        }, 5000); // 5 seconds - adjust based on typical response length
      } catch (err) {
        console.error("❌ Query processing error:", err);
        setError(`Failed to process query: ${(err as Error).message}`);
      } finally {
        setIsProcessing(false);
      }
    },
    [isProcessing]
  );

  const playWakeWordSound = useCallback(() => {
    // Play a simple beep sound to indicate wake word detection
    if (typeof window !== "undefined") {
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  }, []);

  const resetSilenceTimer = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
    }

    silenceTimer.current = setTimeout(() => {
      console.log("Conversation timeout - ending session");
      setConversationActive(false);
      setWakeWordDetected(false); // Reset wake word detection
    }, 10000); // 10 seconds of silence
  }, []);

  const startListening = useCallback(async () => {
    setError(null);

    try {
      if (recognition.current) {
        recognition.current.start();
        setIsListening(true);
      }
    } catch (err) {
      setError(`Failed to start listening: ${(err as Error).message}`);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognition.current) {
      recognition.current.stop();
    }

    setIsListening(false);
    setConversationActive(false);
    setWakeWordDetected(false); // Reset wake word detection

    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
    }
  }, []);

  const cleanup = useCallback(() => {
    if (recognition.current) {
      recognition.current.stop();
    }

    if (webrtcClient.current) {
      webrtcClient.current.disconnect();
    }

    if (audioProcessor.current) {
      audioProcessor.current.dispose();
    }

    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
    }
  }, []);

  return {
    isListening,
    isProcessing,
    isSpeaking,
    conversationActive,
    error,
    startListening,
    stopListening,
  };
}
