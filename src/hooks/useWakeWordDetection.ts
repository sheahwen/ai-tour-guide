"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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

interface UseWakeWordDetectionOptions {
  wakeWord: string;
  onWakeWordDetected: () => void;
  onSpeechActivity?: () => void;
  onConversationTimeout?: () => void;
  silenceTimeoutMs?: number;
}

interface UseWakeWordDetectionReturn {
  isListening: boolean;
  wakeWordDetected: boolean;
  conversationActive: boolean;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  clearError: () => void;
  pauseSilenceTimer: () => void;
  resumeSilenceTimer: () => void;
}

export function useWakeWordDetection({
  wakeWord,
  onWakeWordDetected,
  onSpeechActivity,
  onConversationTimeout,
  silenceTimeoutMs = 10000,
}: UseWakeWordDetectionOptions): UseWakeWordDetectionReturn {
  const [isListening, setIsListening] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [conversationActive, setConversationActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize speech recognition
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
        setError("Speech recognition not supported in this browser");
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  // Speech recognition handlers
  const handleSpeechResult = useCallback(
    (event: SpeechRecognitionEvent) => {
      const results = Array.from(event.results);
      const transcript = results
        .map((result) => result[0].transcript)
        .join("")
        .toLowerCase()
        .trim();

      console.log("Speech transcript:", transcript);

      // Check for wake word (only if not already in conversation)
      if (
        !conversationActive &&
        !wakeWordDetected &&
        transcript.includes(wakeWord.toLowerCase())
      ) {
        console.log("Wake word detected! Starting conversation...");
        setWakeWordDetected(true);
        setConversationActive(true);

        // STOP Web Speech API to prevent interference with OpenAI Realtime
        if (recognitionRef.current) {
          console.log("Pausing Web Speech API during OpenAI conversation");
          recognitionRef.current.stop();
        }

        playWakeWordSound();
        resetSilenceTimer();
        onWakeWordDetected();
        return;
      }

      // Note: During conversation, Web Speech API is paused
      // OpenAI Realtime handles all audio processing
    },
    [conversationActive, wakeWordDetected, wakeWord, onWakeWordDetected, onSpeechActivity]
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
    // Only restart if listening AND NOT in active conversation
    // (during conversation, OpenAI Realtime handles audio)
    if (isListening && !conversationActive) {
      setTimeout(() => {
        if (recognitionRef.current && isListening && !conversationActive) {
          try {
            recognitionRef.current.start();
          } catch (err) {
            console.error("Failed to restart recognition:", err);
          }
        }
      }, 100);
    }
  }, [isListening, conversationActive]);

  // Silence timeout management
  const resetSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }

    silenceTimerRef.current = setTimeout(() => {
      console.log("Conversation timeout - ending session");
      setConversationActive(false);
      setWakeWordDetected(false);

      // RESUME Web Speech API to listen for next wake word
      if (recognitionRef.current && isListening) {
        console.log("Resuming Web Speech API for wake word detection");
        try {
          recognitionRef.current.start();
        } catch (err) {
          console.error("Failed to resume Web Speech API:", err);
        }
      }

      onConversationTimeout?.();
    }, silenceTimeoutMs);
  }, [silenceTimeoutMs, onConversationTimeout, isListening]);

  // Play wake word sound
  const playWakeWordSound = useCallback(() => {
    if (typeof window !== "undefined") {
      const audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(
        600,
        audioContext.currentTime + 0.1
      );

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.2
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    }
  }, []);

  const startListening = useCallback(() => {
    setError(null);

    try {
      if (recognitionRef.current) {
        recognitionRef.current.start();
        setIsListening(true);
      }
    } catch (err) {
      setError(`Failed to start listening: ${(err as Error).message}`);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    setIsListening(false);
    setConversationActive(false);
    setWakeWordDetected(false);

    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const pauseSilenceTimer = useCallback(() => {
    console.log("Pausing silence timer (AI is speaking)");
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resumeSilenceTimer = useCallback(() => {
    console.log("Resuming silence timer (AI finished speaking)");
    resetSilenceTimer();
  }, [resetSilenceTimer]);

  return {
    isListening,
    wakeWordDetected,
    conversationActive,
    error,
    startListening,
    stopListening,
    clearError,
    pauseSilenceTimer,
    resumeSilenceTimer,
  };
}
