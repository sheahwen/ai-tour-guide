# AI Tour Guide

A voice-activated AI tour guide built with Next.js, TypeScript, and OpenAI's Realtime API. This application uses WebRTC for low-latency audio streaming and Web Speech API for wake word detection.

## Features

- 🎤 **Wake Word Detection**: Say "guide" (configurable) to start conversations
- 🔊 **Real-time Voice Interaction**: Continuous voice conversations with AI
- 🌐 **WebRTC Audio Streaming**: Low-latency audio between browser and backend
- ⏱️ **Auto Timeout**: Conversations end after 10 seconds of silence
- 🎨 **Modern UI**: Clean, responsive interface with visual status indicators

## Architecture

```
Browser ↔ WebRTC ↔ Backend ↔ WebSocket ↔ OpenAI Realtime API
```

- **Frontend**: Next.js with TypeScript, Tailwind CSS
- **Audio Processing**: Web Speech API for wake word, WebRTC for streaming
- **Backend**: Next.js API routes handling WebRTC signaling and OpenAI proxy
- **AI**: OpenAI Realtime API for voice-to-voice conversations

## Setup

1. **Clone and Install**:

   ```bash
   git clone <repository-url>
   cd ai-tour-guide
   yarn install
   ```

2. **Environment Variables**:
   Copy `.env.example` to `.env.local` and configure:

   ```bash
   OPENAI_API_KEY=your_openai_api_key_here
   WAKE_WORD=guide
   NEXT_PUBLIC_WAKE_WORD=guide
   ```

3. **Run Development Server**:

   ```bash
   yarn dev
   ```

4. **Open Browser**:
   Navigate to `http://localhost:3000`

## Usage

1. **Start Listening**: Click the microphone button
2. **Wake Word**: Say "guide" (or your configured wake word)
3. **Conversation**: Ask questions after hearing the confirmation sound
4. **Auto End**: Conversation ends after 10 seconds of silence

## API Endpoints

- `GET /api/health` - Health check and environment info
- `POST /api/webrtc/signaling` - WebRTC peer connection setup
- `POST /api/realtime/session` - Send text queries to AI
- `GET /api/realtime/session` - Get session information
- `DELETE /api/realtime/session` - Close AI session

## Browser Requirements

- Modern browser with WebRTC support
- Microphone access permissions
- Web Speech API support (Chrome, Edge, Safari)

## Development

The project uses:

- **Next.js 14+** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **OpenAI SDK** for API integration
- **Simple-peer** for WebRTC connections
- **Web Speech API** for voice recognition

## Troubleshooting

1. **No microphone access**: Grant microphone permissions in browser
2. **Wake word not detected**: Ensure Web Speech API is supported
3. **Connection issues**: Check OpenAI API key and network connectivity
4. **Audio quality**: Verify microphone settings and browser audio permissions

## License

MIT License - see LICENSE file for details.
