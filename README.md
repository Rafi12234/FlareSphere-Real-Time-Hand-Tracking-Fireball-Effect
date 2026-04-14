# FlareSphere: Real-Time Hand Tracking Fireball Effect

FlareSphere is a browser-based interactive demo that uses webcam hand tracking to drive a cinematic fireball effect in real time.

It combines:
- MediaPipe hand landmarks for detection and handedness
- Gesture classification (open palm vs closed palm)
- A dynamic canvas-rendered fireball with glow, particles, orbiters, and transfer effects
- A sci-fi HUD for live status and sensitivity tuning

## Demo Highlights

- Tracks up to 2 hands in real time
- Detects palm open/closed state with smoothing and confidence thresholds
- Anchors the fireball to the active hand's palm center
- Transfers the fireball between hands with a motion trail when ownership changes
- Supports live tuning for gesture sensitivity in the on-screen HUD
- Optional debug overlay for landmarks, palm center, and gesture labels

## Tech Stack

- React 18
- Vite 5
- Tailwind CSS + PostCSS
- `@mediapipe/tasks-vision` (Hand Landmarker)
- HTML5 Canvas rendering

## Requirements

- Node.js 18+ (recommended)
- A webcam
- A modern browser with `getUserMedia` support (Chrome/Edge recommended)

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open the local URL shown in your terminal (usually `http://localhost:5173`).

4. Allow camera access when prompted.

## Available Scripts

- `npm run dev` - Start the Vite development server
- `npm run build` - Build production assets into `dist/`
- `npm run preview` - Preview the production build locally

## How It Works

1. Webcam stream is initialized and attached to a hidden/mirrored video element.
2. MediaPipe Hand Landmarker runs per video frame to estimate landmarks and handedness.
3. Gesture logic computes palm center, scale estimate, and finger extension count.
4. A smoothed gesture state (`Open Palm` / `Closed Palm`) is produced with hysteresis.
5. The fireball effect is updated each frame:
	 - Visible and anchored while the owner hand is open
	 - Fades when no valid owner exists
	 - Transfers between hands when conditions are met
6. Canvas and optional debug visuals are rendered each animation frame.

## Controls

- `D` key: Toggle debug overlay
- `Toggle Debug` button: Toggle debug overlay
- HUD sliders:
	- Open Fingers
	- Closed Fingers
	- Confidence Frames
	- Thumb Bias

## Project Structure

```text
.
|- index.html
|- package.json
|- src/
|  |- App.jsx              # Main app orchestration and UI
|  |- camera.js            # Webcam setup and stream helpers
|  |- handTracker.js       # MediaPipe hand tracker wrapper
|  |- gestureDetector.js   # Gesture detection + smoothing logic
|  |- fireballEffect.js    # Fireball rendering and particle system
|  |- utils.js             # Math and interpolation helpers
|  |- index.css            # Global styles
|  |- main.jsx             # React entry point
```

## Troubleshooting

- Camera permission denied:
	- Re-enable camera permissions in browser site settings and reload.
- No webcam found:
	- Verify camera hardware is connected and not used by another app.
- Tracking unstable:
	- Improve lighting and keep your hand fully visible in frame.
	- Adjust HUD sensitivity sliders.
- Performance issues:
	- Close other heavy apps/tabs.
	- Reduce browser zoom and keep only one tab running the demo.

## Notes

- This project currently runs fully client-side.
- Model and WASM assets are loaded from public CDNs at runtime.

## License

No license file is currently included in this repository.