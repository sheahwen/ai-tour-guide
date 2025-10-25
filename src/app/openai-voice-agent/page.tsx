"use client";

import { useRealtimeAgent } from "@/hooks/useRealtimeAgent";
import { useWakeWordDetection } from "@/hooks/useWakeWordDetection";
import { useEffect, useState } from "react";
import Link from "next/link";

interface TravelPreferences {
  summary: string;
  timestamp: string;
}

export default function Home() {
  const wakeWord = process.env.NEXT_PUBLIC_WAKE_WORD || "guide";
  const [preferences, setPreferences] = useState<TravelPreferences | null>(null);

  // Load preferences from localStorage
  useEffect(() => {
    const storedPrefs = localStorage.getItem("travelPreferences");
    if (storedPrefs) {
      try {
        setPreferences(JSON.parse(storedPrefs));
      } catch (error) {
        console.error("Error parsing preferences:", error);
      }
    }
  }, []);

  // Wake word detection hook
  const {
    isListening,
    wakeWordDetected,
    conversationActive,
    error: speechError,
    startListening,
    stopListening,
    clearError: clearSpeechError,
    pauseSilenceTimer,
    resumeSilenceTimer,
  } = useWakeWordDetection({
    wakeWord,
    onWakeWordDetected: () => {
      // Wait 800ms before connecting to ensure wake word audio clears
      // This prevents the wake word phrase from being sent to OpenAI
      setTimeout(() => {
        connect();
      }, 800);
    },
    onConversationTimeout: () => {
      // Disconnect from OpenAI when conversation times out
      disconnect();
    },
  });

  // OpenAI Realtime Agent hook
  const {
    isConnected,
    isConnecting,
    isSpeaking,
    error: agentError,
    connect,
    disconnect,
    clearError: clearAgentError,
  } = useRealtimeAgent({
    onAudioStart: () => {
      // Pause silence timer when AI starts speaking
      pauseSilenceTimer();
    },
    onAudioStopped: () => {
      // Resume silence timer when AI finishes speaking
      resumeSilenceTimer();
    },
    onUserSpeechStart: () => {
      // User started speaking (follow-up question)
      // Pause timer while user is speaking
      pauseSilenceTimer();
    },
    onUserSpeechStop: () => {
      // User finished speaking
      // DON'T resume timer yet - wait for AI to finish responding
      // Timer will resume when AI finishes speaking
    },
  });

  // Merge errors from both hooks
  const error = agentError || speechError;
  const clearError = () => {
    clearAgentError();
    clearSpeechError();
  };

  const getStatusText = () => {
    if (error) return `Error: ${error}`;
    if (isConnecting) return "Connecting to AI...";
    if (isSpeaking) return "AI is speaking...";
    if (conversationActive && isConnected) return "Listening - speak your question";
    if (wakeWordDetected) return "Wake word detected - connecting...";
    if (isListening) return `Say "${wakeWord}" to start`;
    return "Click to start listening";
  };

  const getStatusColor = () => {
    if (error) return "bg-red-500";
    if (isConnecting) return "bg-yellow-500";
    if (isSpeaking) return "bg-purple-500 speaking-bounce";
    if (conversationActive && isConnected) return "bg-green-500 listening-pulse";
    if (wakeWordDetected) return "bg-blue-500";
    if (isListening) return "bg-gray-500";
    return "bg-gray-400";
  };

  const handleToggleListening = () => {
    if (isListening) {
      stopListening();
      disconnect();
    } else {
      startListening();
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            AI Tour Guide
          </h1>
          <p className="text-gray-600">
            Voice-activated AI assistant ready to help
          </p>
        </div>

        {/* Preferences Display */}
        {preferences && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-sm font-semibold text-blue-900">
                Your Preferences
              </h3>
              <Link
                href="/"
                className="text-xs text-blue-600 hover:text-blue-800 underline"
              >
                Change
              </Link>
            </div>
            <p className="text-sm text-blue-900 leading-relaxed">
              {preferences.summary}
            </p>
          </div>
        )}

        {!preferences && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              No preferences set.{" "}
              <Link href="/" className="font-medium underline">
                Set your preferences
              </Link>{" "}
              for a personalized experience.
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-lg p-8 space-y-6">
          {/* Status Indicator */}
          <div className="flex items-center justify-center space-x-3">
            <div className={`status-indicator ${getStatusColor()}`} />
            <span className="text-sm font-medium text-gray-700">
              {getStatusText()}
            </span>
          </div>

          {/* Main Control Button */}
          <div className="flex justify-center">
            <button
              onClick={handleToggleListening}
              disabled={isConnecting}
              className={`
                w-24 h-24 rounded-full flex items-center justify-center
                transition-all duration-200 transform hover:scale-105
                ${
                  isListening
                    ? "bg-red-500 hover:bg-red-600 text-white"
                    : "bg-blue-500 hover:bg-blue-600 text-white"
                }
                ${
                  isConnecting
                    ? "opacity-50 cursor-not-allowed"
                    : ""
                }
              `}
            >
              {isListening ? (
                <svg
                  className="w-8 h-8"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="w-8 h-8"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          </div>

          {/* Instructions */}
          <div className="text-center text-sm text-gray-500 space-y-1">
            <p>Click the microphone to start listening</p>
            <p>
              Say{" "}
              <span className="font-semibold">
                "{wakeWord}"
              </span>{" "}
              to begin conversation
            </p>
            <p>Conversation ends after 10 seconds of silence</p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="shrink-0">
                <svg
                  className="h-5 w-5 text-red-400"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Something went wrong
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                  <button
                    onClick={clearError}
                    className="mt-2 text-xs bg-red-100 hover:bg-red-200 px-2 py-1 rounded"
                  >
                    Clear Error
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
