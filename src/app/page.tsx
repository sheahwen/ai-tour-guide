"use client";

import { useState, useEffect } from "react";
import { useRealtimeAgent } from "@/hooks/useRealtimeAgent";

export default function Home() {
  const {
    isConnected,
    isConnecting,
    isListening,
    conversationActive,
    wakeWordDetected,
    startListening,
    stopListening,
    error,
    clearError,
  } = useRealtimeAgent();

  const getStatusText = () => {
    if (error) return `Error: ${error}`;
    if (isConnecting) return "Connecting to AI...";
    if (conversationActive && isConnected) return "In conversation - speak naturally";
    if (wakeWordDetected) return "Wake word detected - connecting...";
    if (isListening) return `Say "${process.env.NEXT_PUBLIC_WAKE_WORD}" to start`;
    return "Click to start listening";
  };

  const getStatusColor = () => {
    if (error) return "bg-red-500";
    if (isConnecting) return "bg-yellow-500";
    if (conversationActive && isConnected) return "bg-green-500 listening-pulse";
    if (wakeWordDetected) return "bg-blue-500";
    if (isListening) return "bg-gray-500";
    return "bg-gray-400";
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
              onClick={isListening ? stopListening : startListening}
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
                "{process.env.NEXT_PUBLIC_WAKE_WORD}"
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
