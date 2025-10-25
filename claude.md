# AI Tour Guide - Project Documentation

## Project Overview

A Next.js 16 application providing a voice-activated AI tour guide using **OpenAI's Voice Agent SDK** (`@openai/agents-realtime`). Users say a wake word ("guy") to start a conversation with an AI assistant that provides tourist information.

**Key Technology**: This project uses the official OpenAI Voice Agent SDK for real-time voice conversations, which provides seamless integration with OpenAI's Realtime API.

## Architecture

```
Browser Client (page.tsx)
    ↓
    ├─ useWakeWordDetection Hook
    │   └─ Web Speech API (Wake Word Detection)
    │       └─ onWakeWordDetected callback ─┐
    │       └─ onConversationTimeout ────────┼─ Coordinates hooks
    │                                        │
    └─ useRealtimeAgent Hook                 │
        └─ [800ms delay] ←───────────────────┘ (Clears wake word audio)
            └─ OpenAI Voice Agent SDK
                └─ RealtimeSession/RealtimeAgent (WebRTC Connection)
                    ↓
                /api/realtime/token (Ephemeral Token)
                    ↓
                OpenAI Realtime API (gpt-realtime model)
```

**Architecture Pattern**: **Hook Composition**
- Two focused, single-responsibility hooks
- Composed in `page.tsx` via callbacks
- Clean separation of concerns:
  - `useWakeWordDetection`: Manages speech recognition
  - `useRealtimeAgent`: Manages OpenAI connection

**Note**: This application uses the official **OpenAI Voice Agent SDK** (`@openai/agents-realtime`) which automatically uses **WebRTC in the browser** for low-latency audio streaming and real-time voice conversation management. The SDK would use WebSocket if running on a Node.js server, but since our hook runs client-side, it uses WebRTC.

## Directory Structure

```
ai-tour-guide/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── page.tsx              # Main UI component (composes hooks)
│   │   ├── layout.tsx            # Root layout
│   │   └── globals.css           # Global styles + Tailwind
│   ├── hooks/
│   │   ├── useWakeWordDetection.ts  # Wake word detection hook (Web Speech API)
│   │   └── useRealtimeAgent.ts      # OpenAI connection hook (Realtime API)
│   ├── pages/api/                # API routes
│   │   ├── health.ts             # Health check
│   │   └── realtime/token.ts     # Token generation
│   └── lib/                      # (Empty - future utilities)
├── public/                       # Static assets
├── Configuration files
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── eslint.config.mjs
└── .env.local                    # Environment variables
```

## Key Files

### `/src/app/page.tsx`
Main UI component that **composes both hooks**:
- Uses `useWakeWordDetection` for wake word listening
- Uses `useRealtimeAgent` for OpenAI connection
- Connects them via callbacks (`onWakeWordDetected`, `onConversationTimeout`)
- Microphone control button
- Status indicator (connecting, listening, active, error)
- Wake word instructions
- Error display with merged errors from both hooks

### `/src/hooks/useWakeWordDetection.ts` (NEW)
**Dedicated wake word detection hook** managing:
- **Web Speech API**: Browser speech recognition setup and lifecycle
- **Wake word detection**: Monitors speech for configurable wake word
- **Conversation state**: Tracks active conversation and silence timeout
- **Audio feedback**: Plays beep sound on wake word detection
- **Automatic pause**: Stops Web Speech API during OpenAI conversation to prevent interference
- **Callbacks**: Triggers `onWakeWordDetected` and `onConversationTimeout`

**Important Behavior**:
- **Before wake word**: Web Speech API actively listens for wake word
- **Wake word detected**:
  - Web Speech API immediately PAUSED
  - 800ms delay before connecting to OpenAI (allows wake word audio to clear)
  - This ensures wake word phrase is NOT sent to OpenAI
  - Silence timer starts (10 seconds)
- **During conversation**: OpenAI Realtime has full control of microphone
- **User speaks follow-up question** (`input_audio_buffer.speech_started`):
  - **Silence timer PAUSED** (prevents timeout while user is speaking)
- **User finishes speaking** (`input_audio_buffer.speech_stopped`):
  - **Timer stays PAUSED** (waits for AI to finish responding)
- **AI starts responding** (`audio_start` event):
  - **Timer remains PAUSED** (AI can speak as long as needed)
- **AI stops speaking** (`audio_stopped` event):
  - **Silence timer RESUMED** with **FRESH 10s countdown** (only now does silence counting begin)
- **After 10s of true silence** (after AI finishes): Conversation ends, Web Speech API RESUMED for next wake word

**Key insight**: The 10-second timer only counts silence AFTER the AI completely finishes responding, no matter how long the AI speaks.

This prevents both systems from fighting over the microphone, which was causing every word to trigger multiple AI responses. More importantly, it ensures the conversation only times out 10 seconds AFTER all activity (user and AI) has stopped, not during active conversation.

**Accepts Options**:
- `wakeWord`: The word to listen for
- `onWakeWordDetected`: Callback when wake word is spoken
- `onSpeechActivity`: (Optional) Callback on any speech during conversation
- `onConversationTimeout`: (Optional) Callback after silence timeout
- `silenceTimeoutMs`: (Optional) Timeout duration (default 10s)

**Returns**:
- `isListening`, `wakeWordDetected`, `conversationActive`
- `error`
- `startListening()`, `stopListening()`, `clearError()`

### `/src/hooks/useRealtimeAgent.ts` (REFACTORED)
**Focused OpenAI connection hook** managing:
- **OpenAI Voice Agent SDK**: Uses `RealtimeSession` and `RealtimeAgent` from `@openai/agents-realtime`
- **Connection lifecycle**: Token fetching, WebRTC connection, disconnection
- **Agent configuration**: Tour Guide instructions and settings
- **Turn detection settings**: Configured to prevent premature responses
- **Race condition prevention**: Uses ref-based lock to prevent duplicate connections
- **State management**: Connection status and errors

**Race Condition Protection**:
Uses a synchronous `isConnectingRef` to prevent multiple concurrent connection attempts. React state updates are asynchronous, so checking `isConnecting` state alone would allow duplicate calls to proceed before the state updates.

**Lifecycle Management**:
- **Agent instance**: Created once and persists across React Strict Mode remounts
- **Session instance**: Created on `connect()`, destroyed on `disconnect()` or cleanup
- **Strict Mode handling**: Cleanup closes session but preserves agent instance
- **Hot reload handling**: Session closed, agent recreated only if null
- **Logging**: Console logs track agent creation and cleanup for debugging

**Turn Detection Configuration**:
```typescript
turnDetection: {
  type: "server_vad",           // Server-side Voice Activity Detection
  threshold: 0.8,                // Higher = less sensitive (0.0-1.0)
  silenceDurationMs: 1000,       // Wait 1 second of silence before end-of-turn
  prefixPaddingMs: 500,          // Audio padding before speech
  createResponse: true           // Auto-trigger AI response
}
```

**Returns**:
- `isConnected`, `isConnecting`
- `error`, `agentName`
- `connect()`, `disconnect()`, `clearError()`

**Note**: This hook is now much simpler (130 lines vs 333 lines) as it no longer handles wake word detection.

### `/src/pages/api/realtime/token.ts`
POST endpoint that:
- Exchanges server OPENAI_API_KEY for ephemeral client token
- Returns token starting with "ek_" (expires in 1 hour)
- Configures session for realtime voice conversation

### `/src/pages/api/health.ts`
GET endpoint returning:
- Server status
- Environment check (Node env, OpenAI key presence, wake word)
- Timestamp

## Technology Stack

### Core Framework
- **Next.js 16.0.0**: App Router, API routes, Turbopack
- **React 19.2.0**: UI library
- **TypeScript 5.9.3**: Type safety with strict mode

### AI/Voice (Primary)
- **@openai/agents-realtime 0.1.11**: **Official OpenAI Voice Agent SDK** - Handles real-time voice conversations via **WebRTC** (in browser) or WebSocket (on server)
  - **Automatically selects transport**: WebRTC in browser, WebSocket in Node.js
  - Provides `RealtimeSession` for managing connections
  - Provides `RealtimeAgent` for agent configuration and interactions
  - Manages audio streaming, turn detection, and conversation flow
  - **This app uses WebRTC** since the hook runs client-side in the browser
- **openai 6.6.0**: OpenAI SDK for token generation
- **Web Speech API**: Browser native speech recognition for wake word detection

### Styling
- **tailwindcss 3.4.14**: Utility-first CSS
- **Custom animations**: pulse-slow, bounce-slow
- **Custom components**: btn-primary, status-indicator, listening-pulse

### Utilities
- **zod 3.25.76**: Schema validation
- **uuid 13.0.0**: UUID generation

## Turn Detection Configuration

The OpenAI Realtime API uses Voice Activity Detection (VAD) to determine when the user has finished speaking. This can be tuned to prevent premature responses.

### Current Settings

Our configuration prevents the AI from responding multiple times within a single sentence:

```typescript
turnDetection: {
  type: "server_vad",           // Server-side detection
  threshold: 0.8,                // Sensitivity (0.0-1.0, higher = less sensitive)
  silenceDurationMs: 1000,       // Silence duration before end-of-turn (ms)
  prefixPaddingMs: 500,          // Audio padding before speech starts (ms)
  createResponse: true           // Auto-trigger response
}
```

### Important: Microphone Management

**The main fix for duplicate responses was stopping the Web Speech API during OpenAI conversations:**
- Web Speech API listens for wake word only
- Once wake word detected → Web Speech API PAUSED immediately
- **800ms delay** before OpenAI connection (prevents wake word from being sent to AI)
- OpenAI Realtime takes full control of microphone
- After conversation timeout → Web Speech API RESUMED

This prevents both systems from processing the same audio simultaneously and ensures the wake word phrase itself is not sent to the AI.

### Tuning Guide

If you experience issues:

**AI responds too quickly (mid-sentence)**:
- ↑ Increase `silenceDurationMs` (try 1500-2000ms)
- ↑ Increase `threshold` (try 0.9)

**AI takes too long to respond**:
- ↓ Decrease `silenceDurationMs` (try 700-800ms)
- ↓ Decrease `threshold` (try 0.6-0.7)

**Alternative**: Use `type: "semantic_vad"` for smarter context-aware detection (may have higher latency).

## OpenAI Voice Agent SDK Integration

This project is built on the **OpenAI Voice Agent SDK** (`@openai/agents-realtime`), which provides:

### Core Components Used

1. **RealtimeSession**
   - **Automatically uses WebRTC in browser** for low-latency connections
   - Uses WebSocket when running on Node.js server
   - Handles authentication via ephemeral tokens
   - Maintains session state and connection lifecycle
   - Automatically configures microphone and speaker

2. **RealtimeAgent**
   - Configures agent behavior (name, instructions, voice)
   - Manages conversation turns and audio streaming
   - Handles server-side VAD (Voice Activity Detection)

### Key Features

- **WebRTC in Browser**: Automatic WebRTC selection for optimal latency and audio quality
- **Real-time Audio Streaming**: Bidirectional audio with low latency
- **Turn Detection**: Automatic detection of when user finishes speaking
- **Audio Format**: PCM16 format for input/output
- **Voice Selection**: Configurable voice (currently using "alloy")
- **Session Management**: Token-based authentication with 1-hour expiry
- **Auto Configuration**: Microphone and speaker automatically configured

### Transport Layer Selection

The SDK automatically chooses the optimal transport:
- **Browser environment** → **WebRTC** (this app) ✓
- **Node.js server** → WebSocket

### Authentication Flow

1. Client requests token from `/api/realtime/token`
2. Server exchanges API key for ephemeral token (starts with "ek_")
3. Client uses token to establish RealtimeSession
4. **WebRTC connection** established and authenticated
5. Microphone/speaker automatically configured for audio streaming

## Environment Variables

| Variable | Required | Purpose | Example |
|----------|----------|---------|---------|
| `OPENAI_API_KEY` | Yes | OpenAI API authentication | `sk-proj-...` |
| `WAKE_WORD` | No | Server-side wake word | `guy` |
| `NEXT_PUBLIC_WAKE_WORD` | Yes | Client-side wake word (exposed to browser) | `guy` |

## User Flow

1. User clicks microphone button → `startListening()` called
2. Web Speech API begins listening for wake word
3. User says "guy" → `wakeWordDetected` state changes
4. Web Speech API immediately PAUSED (prevents wake word from being sent to AI)
5. System plays beep sound confirmation
6. **Silence timer starts** (10 seconds)
7. **800ms delay** → Ensures wake word audio clears from buffers
8. `connect()` calls `/api/realtime/token` for authentication
9. Backend exchanges OPENAI_API_KEY for ephemeral token
10. **OpenAI Voice Agent SDK**: Frontend creates `RealtimeSession` with token
11. **OpenAI Voice Agent SDK**: Establishes **WebRTC connection** to OpenAI Realtime API
12. **OpenAI Voice Agent SDK**: Microphone and speaker automatically configured
13. **User speaks question** → `input_audio_buffer.speech_started` → **Silence timer PAUSED**
14. **User stops speaking** → `input_audio_buffer.speech_stopped` → **Timer stays PAUSED** (waits for AI)
15. **Only user audio** sent to OpenAI (wake word was filtered out)
16. **OpenAI Voice Agent SDK**: Audio streams via WebRTC between browser and OpenAI API
17. **AI starts responding** → `audio_start` event → **Timer remains PAUSED**
18. AI speaks response for any duration (low latency via WebRTC, no timeout!)
19. **AI finishes** → `audio_stopped` event → **Silence timer RESUMED with FRESH 10s** (countdown starts NOW)
20. **(Optional) User asks follow-up** → `input_audio_buffer.speech_started` → **Timer PAUSED** → (repeat from step 14)
21. After 10 seconds of silence (after AI finishes) → conversation auto-ends
22. **OpenAI Voice Agent SDK**: WebRTC connection closed
23. Web Speech API RESUMED → Ready for next wake word

## Agent Configuration

**Name**: "Tour Guide"

**Instructions**: Helpful AI assistant for:
- Tourist attractions and landmarks
- Local restaurants and cuisine
- Transportation and directions
- Cultural information and history
- Weather and best times to visit
- Shopping and local markets
- Safety tips and travel advice

## Development

### Scripts
```bash
# Development server
yarn dev  # or npm run dev

# Production build
yarn build  # or npm run build

# Production server
yarn start  # or npm start

# Linting
yarn lint  # or npm run lint
```

### Configuration Notes

**next.config.js**:
- Turbopack enabled
- Webpack fallbacks for client (fs, net, tls set to false)

**tsconfig.json**:
- Target: ES2017
- Strict mode enabled
- Path alias: `@/*` → `./src/*`

**tailwind.config.js**:
- Custom colors: primary (50, 500, 600, 700), success, warning, error
- Custom animations: pulse-slow (2s), bounce-slow (2s)

## Browser Requirements

- Modern browser with **WebRTC support** (Chrome, Edge, Safari recommended)
- Web Speech API support for wake word detection
- Microphone access permissions (required for both speech recognition and WebRTC)
- JavaScript enabled
- Secure context (HTTPS or localhost) - required for WebRTC and getUserMedia()

## Code Organization Best Practices

### Hook Extraction (Latest Refactoring)

The codebase was recently refactored to follow React best practices for hook composition:

**Problem**: The original `useRealtimeAgent` hook was 333 lines and handled two distinct responsibilities:
1. Wake word detection (Web Speech API)
2. OpenAI connection management (Realtime API)

**Solution**: Extracted into two focused hooks:
- `useWakeWordDetection.ts` (250 lines) - Wake word detection
- `useRealtimeAgent.ts` (116 lines) - OpenAI connection

**Benefits**:
- ✅ **Single Responsibility Principle**: Each hook has one clear purpose
- ✅ **Reusability**: Can use wake word detection independently
- ✅ **Testability**: Easier to unit test each hook
- ✅ **Readability**: Smaller, focused files
- ✅ **Maintainability**: Changes to one concern don't affect the other
- ✅ **Composition**: Follows React best practices
- ✅ **Race Condition Safety**: Ref-based locks prevent duplicate async operations

**Pattern**: The hooks are composed in `page.tsx` using callbacks to coordinate their behavior.

**Technical Improvements**:
- **Ref-based lock**: Prevents race conditions in async `connect()` calls
- **Microphone handoff**: Web Speech API pauses during OpenAI conversation
- **Wake word filtering**: 800ms delay prevents wake word from being sent to AI
- **Strict Mode resilience**: Agent persists across React Strict Mode double-mounting

**Development vs Production**:
- **Development (Strict Mode ON)**: useEffect runs twice, cleanup logs appear, agent survives remount
- **Production (Strict Mode OFF)**: useEffect runs once, single agent instance for component lifetime
- **Hot Reload**: Session closed and reopened, agent recreated only if needed

## Migration History

### SDK Migration (Earlier Refactoring)

The project was previously refactored from a **custom WebRTC implementation** to the **official OpenAI Voice Agent SDK** (`@openai/agents-realtime`):

**Removed** (Custom Implementation):
- Custom WebRTC server/client classes (`simple-peer`, `@roamhq/wrtc`)
- Custom audio processor
- Custom realtime proxy
- Old API routes for WebRTC signaling
- Unused dependencies: `@roamhq/wrtc`, `simple-peer`, `ws`

**Added** (Official SDK):
- **OpenAI Voice Agent SDK** (`@openai/agents-realtime`)
- Unified `useRealtimeAgent` hook using `RealtimeSession` and `RealtimeAgent`
- Simplified token-based authentication
- `/api/realtime/token` endpoint for ephemeral token generation

**Important**: The SDK **automatically uses WebRTC in the browser** (and WebSocket on Node.js servers). Since our hook runs client-side, we get the performance benefits of WebRTC without the complexity of the old custom implementation.

**Benefits**:
- Greatly simplified architecture (no custom WebRTC code needed)
- **WebRTC still used** but managed by the SDK automatically
- Improved reliability and maintenance
- Official support from OpenAI
- Built-in features: VAD, turn detection, audio streaming, auto mic/speaker config
- Better error handling and connection management
- Cleaner dependency tree (SDK includes its own WebRTC implementation)

## Git Configuration

**Main Branch**: `main`

**Commit Convention**:
- No attribution footer or co-authored-by lines
- Clear, descriptive commit messages
- Bullet points for multiple changes

## API Endpoints

### GET /api/health
Returns server health status and environment info.

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "environment": {
    "nodeEnv": "development",
    "hasOpenAIKey": true,
    "wakeWord": "guy"
  }
}
```

### POST /api/realtime/token
Generates ephemeral token for OpenAI Realtime API.

**Response**:
```json
{
  "token": "ek_...",
  "expiresIn": "1 hour"
}
```

## State Management

All state is managed in the `useRealtimeAgent` hook using React useState and useRef:
- Connection state (isConnected, isConnecting)
- Listening state (isListening, conversationActive)
- Wake word detection (wakeWordDetected)
- Error handling (error state with clearError function)
- Timers (silence timeout at 10s)

## Future Considerations

- The `/src/lib/` directory is currently empty and available for future utilities
- Potential for adding location-based services
- Multi-language support
- Conversation history/logging
- Custom voice selection
