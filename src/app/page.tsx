"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [preferencesSummary, setPreferencesSummary] = useState<string>("");
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);

  const promptTemplate = `I'm planning to use an AI tour guide assistant. Please analyze my travel preferences and provide a concise summary (2-3 sentences) that describes:

1. My travel style (e.g., budget-conscious, luxury-seeking, adventure-oriented, relaxation-focused, family-friendly, solo traveler)
2. My main interests (e.g., food & dining, history & culture, nature & outdoors, shopping, nightlife, art & museums, sports, photography)
3. Any specific preferences or requirements I have for travel recommendations

Here's information about my travel preferences:
[Describe your travel style, interests, budget preferences, dietary restrictions, accessibility needs, or any other relevant details]

Please provide your analysis in a clear, concise format that an AI assistant can use to personalize recommendations.`;

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptTemplate);
      setShowCopiedMessage(true);
      setTimeout(() => setShowCopiedMessage(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
      alert("Failed to copy to clipboard");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!preferencesSummary.trim()) {
      alert("Please paste your travel preferences summary");
      return;
    }

    // Store preferences in localStorage
    const preferences = {
      summary: preferencesSummary.trim(),
      timestamp: new Date().toISOString(),
    };

    localStorage.setItem("travelPreferences", JSON.stringify(preferences));

    // Navigate to voice agent page
    router.push("/openai-voice-agent");
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-3xl mx-auto py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            AI Tour Guide
          </h1>
          <p className="text-lg text-gray-600">
            Personalize your experience with AI-powered preference analysis
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            How it works
          </h2>
          <ol className="space-y-3">
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                1
              </span>
              <span className="text-gray-700">
                Copy the prompt template below
              </span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                2
              </span>
              <span className="text-gray-700">
                Paste it into ChatGPT, Claude, or Gemini and fill in your travel preferences
              </span>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold mr-3">
                3
              </span>
              <span className="text-gray-700">
                Copy the AI's response and paste it below
              </span>
            </li>
          </ol>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Copy Prompt */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">
                Step 1: Copy this prompt
              </h2>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                {showCopiedMessage ? "Copied!" : "Copy Prompt"}
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono">
                {promptTemplate}
              </pre>
            </div>
          </div>

          {/* Step 2: Paste Summary */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Step 2: Paste the AI's response here
            </h2>
            <textarea
              value={preferencesSummary}
              onChange={(e) => setPreferencesSummary(e.target.value)}
              placeholder="Paste the travel preferences summary from ChatGPT/Gemini here..."
              rows={8}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-800"
            />
            <p className="mt-2 text-sm text-gray-500">
              The AI will use this summary to personalize all recommendations
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!preferencesSummary.trim()}
            className={`
              w-full py-4 px-6 rounded-lg shadow-lg transition-colors duration-200 text-lg font-semibold
              ${
                preferencesSummary.trim()
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }
            `}
          >
            Start Voice Tour Guide
          </button>
        </form>

        {/* Help Text */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">
            Example Prompts to ChatGPT/Gemini:
          </h3>
          <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
            <li>"I'm a budget traveler interested in food and history"</li>
            <li>"Luxury solo traveler who loves photography and nature"</li>
            <li>"Family of 4 looking for kid-friendly activities and museums"</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
