import { useEffect, useRef, useState } from "react";
import { getVideoDimensions, initializeWebcam, startWebcamStream } from "./camera.js";
import { HandTracker } from "./handTracker.js";
import { GestureDetector } from "./gestureDetector.js";
import { FireballEffect } from "./fireballEffect.js";
import { clamp, lerp } from "./utils.js";

const INITIAL_SETTINGS = {
  openThreshold: 4,
  closedThreshold: 1,
  confidenceFrames: 2,
  thumbBias: 1.1,
};

const HUD_UPDATE_MS = 80;
const TRANSFER_DURATION = 0.55;

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const rafRef = useRef(null);
  const streamRef = useRef(null);
  const lastTimestampRef = useRef(performance.now());
  const lastHudUpdateRef = useRef(0);
  const debugEnabledRef = useRef(true);
  const detectorMapRef = useRef(new Map());
  const fireballRef = useRef(new FireballEffect());
  const fireballOwnerRef = useRef(null);
  const activeTransferRef = useRef(null);
  const previousHandsRef = useRef(new Map());
  const transferEffectsRef = useRef([]);

  const handTrackerRef = useRef(new HandTracker());

  const [debugEnabled, setDebugEnabled] = useState(true);
  const [handSummaries, setHandSummaries] = useState([]);
  const [trackerStatus, setTrackerStatus] = useState("Initializing");
  const [loading, setLoading] = useState(true);
  const [loadingText, setLoadingText] = useState("Initializing webcam and hand model...");
  const [error, setError] = useState("");
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  const settingsRef = useRef(INITIAL_SETTINGS);

  useEffect(() => {
    debugEnabledRef.current = debugEnabled;
  }, [debugEnabled]);

  useEffect(() => {
    settingsRef.current = settings;

    detectorMapRef.current.forEach((detector) => {
      detector.updateConfig({
        openThreshold: settings.openThreshold,
        closedThreshold: settings.closedThreshold,
        openConfidenceFrames: settings.confidenceFrames,
        closedConfidenceFrames: settings.confidenceFrames,
        thumbExtensionBias: settings.thumbBias,
      });
    });
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key.toLowerCase() === "d") {
        setDebugEnabled((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (videoRef.current?.videoWidth && videoRef.current?.videoHeight) {
        resizeCanvas(videoRef.current.videoWidth, videoRef.current.videoHeight);
      }
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const getOrCreateDetector = (handKey) => {
      if (!detectorMapRef.current.has(handKey)) {
        const detector = new GestureDetector();
        const currentSettings = settingsRef.current;
        detector.updateConfig({
          openThreshold: currentSettings.openThreshold,
          closedThreshold: currentSettings.closedThreshold,
          openConfidenceFrames: currentSettings.confidenceFrames,
          closedConfidenceFrames: currentSettings.confidenceFrames,
          thumbExtensionBias: currentSettings.thumbBias,
        });
        detectorMapRef.current.set(handKey, detector);
      }

      return detectorMapRef.current.get(handKey);
    };

    const normalizeHandKey = (handedness, index) => {
      const label = (handedness || `Hand-${index}`).toLowerCase();
      if (label.includes("left")) return "Left";
      if (label.includes("right")) return "Right";
      return `Hand-${index}`;
    };

    const drawTransferEffects = (ctx, timestamp) => {
      transferEffectsRef.current = transferEffectsRef.current.filter((effect) => {
        const progress = clamp((timestamp - effect.startedAt) / effect.duration, 0, 1);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const x = lerp(effect.from.x, effect.to.x, eased);
        const y = lerp(effect.from.y, effect.to.y, eased);
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const px = x * width;
        const py = y * height;

        const alpha = Math.sin(progress * Math.PI) * 0.95;
        const glowRadius = 28 + progress * 18;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        const gradient = ctx.createRadialGradient(px, py, 0, px, py, glowRadius);
        gradient.addColorStop(0, `rgba(255, 245, 210, ${0.85 * alpha})`);
        gradient.addColorStop(0.35, `rgba(255, 182, 82, ${0.55 * alpha})`);
        gradient.addColorStop(1, "rgba(255, 80, 25, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 214, 140, ${0.5 * alpha})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(effect.from.x * width, effect.from.y * height);
        ctx.lineTo(px, py);
        ctx.stroke();

        ctx.restore();

        return progress < 1;
      });
    };

    const spawnTransferEffect = (source, target) => {
      if (!source || !target) return;

      transferEffectsRef.current.push({
        from: { ...source.palmCenter },
        to: { ...target.palmCenter },
        startedAt: performance.now(),
        duration: TRANSFER_DURATION,
      });
    };

    const updateFrameEffects = (handsByKey, deltaTime, timestamp) => {
      const previousSummaries = previousHandsRef.current;
      const nextSummaries = new Map();
      const visibleSummaries = [];

      handsByKey.forEach((hand, handKey) => {
        const detector = getOrCreateDetector(handKey);
        const gestureInfo = detector.detect(hand.landmarks, hand.handedness, deltaTime);

        const summary = {
          key: handKey,
          label: hand.handedness,
          gestureState: gestureInfo.gestureState,
          isOpen: gestureInfo.isPalmOpen,
          fingers: gestureInfo.extendedFingerCount,
          palmCenter: gestureInfo.palmCenter,
          scale: gestureInfo.scaleFactor,
          landmarks: hand.landmarks,
          gestureInfo,
        };

        nextSummaries.set(handKey, summary);
        visibleSummaries.push(summary);
      });

      visibleSummaries.forEach((summary) => {
        const previous = previousSummaries.get(summary.key);

        if (
          previous?.isOpen &&
          !summary.isOpen &&
          fireballOwnerRef.current === summary.key &&
          !activeTransferRef.current
        ) {
          const target = visibleSummaries
            .filter((other) => other.key !== summary.key && other.isOpen)
            .sort(
              (a, b) =>
                distanceBetween(summary.palmCenter, a.palmCenter) -
                distanceBetween(summary.palmCenter, b.palmCenter)
            )[0];

          if (target) {
            spawnTransferEffect(previous, target);
            activeTransferRef.current = {
              from: { ...previous.palmCenter },
              to: { ...target.palmCenter },
              fromScale: previous.scale,
              toScale: target.scale,
              toKey: target.key,
              startedAt: timestamp,
              duration: TRANSFER_DURATION,
            };
            fireballOwnerRef.current = null;
          }
        }
      });

      previousSummaries.forEach((previousSummary, handKey) => {
        if (nextSummaries.has(handKey)) return;

        const detector = getOrCreateDetector(handKey);
        const gestureInfo = detector.detect(null, deltaTime);

        const summary = {
          ...previousSummary,
          gestureState: gestureInfo.gestureState,
          isOpen: false,
          fingers: 0,
          gestureInfo,
        };

        nextSummaries.set(handKey, summary);
      });

      const rightHand = visibleSummaries.find((hand) => String(hand.label).toLowerCase().includes("right"));
      const ownerSummary = fireballOwnerRef.current
        ? nextSummaries.get(fireballOwnerRef.current)
        : null;

      if (!activeTransferRef.current) {
        if (visibleSummaries.length >= 2) {
          if (rightHand?.isOpen && (!ownerSummary || !ownerSummary.isOpen)) {
            fireballOwnerRef.current = rightHand.key;
          }
        } else if (visibleSummaries.length === 1) {
          fireballOwnerRef.current = visibleSummaries[0].isOpen
            ? visibleSummaries[0].key
            : null;
        } else if (!ownerSummary) {
          fireballOwnerRef.current = null;
        }
      }

      if (activeTransferRef.current) {
        const transfer = activeTransferRef.current;
        const progress = clamp((timestamp - transfer.startedAt) / transfer.duration, 0, 1);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        const transferPosition = {
          x: lerp(transfer.from.x, transfer.to.x, eased),
          y: lerp(transfer.from.y, transfer.to.y, eased),
        };
        const transferScale = lerp(transfer.fromScale, transfer.toScale, eased);

        fireballRef.current.update(transferPosition, transferScale, true, deltaTime);

        if (progress >= 1) {
          const target = nextSummaries.get(transfer.toKey);
          fireballOwnerRef.current = target?.isOpen ? target.key : null;
          activeTransferRef.current = null;
        }
      } else {
        const owner = fireballOwnerRef.current
          ? nextSummaries.get(fireballOwnerRef.current)
          : null;

        if (owner?.isOpen) {
          fireballRef.current.update(owner.palmCenter, owner.scale, true, deltaTime);
        } else {
          const fallback = owner ?? visibleSummaries[0] ?? null;
          fireballRef.current.update(
            fallback?.palmCenter,
            fallback?.scale ?? 1,
            false,
            deltaTime
          );

          if (!owner) {
            fireballOwnerRef.current = null;
          }
        }
      }

      previousHandsRef.current = nextSummaries;
      return visibleSummaries;
    };

    const animationLoop = (timestamp) => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !video || !ctx) return;

      const deltaTime = Math.min((timestamp - lastTimestampRef.current) / 1000, 0.05);
      lastTimestampRef.current = timestamp;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const handLookup = new Map();
      let frameTracker = "Tracking";
      let currentSummaries = [];

      try {
        const detection = handTrackerRef.current.detectForVideo(video, timestamp);
        const hands = detection?.hands ?? [];

        if (hands.length) {
          hands.forEach((hand, index) => {
            const handKey = normalizeHandKey(hand.handedness, index);
            handLookup.set(handKey, {
              ...hand,
              handedness: hand.handedness,
              key: handKey,
            });
          });

          currentSummaries = updateFrameEffects(handLookup, deltaTime, timestamp);

          if (debugEnabledRef.current) {
            handLookup.forEach((hand, handKey) => {
              const summary = previousHandsRef.current.get(handKey);
              if (!summary) return;

              drawDebug(
                ctx,
                canvas,
                hand.landmarks,
                summary.palmCenter,
                summary.fingers,
                summary.gestureState,
                hand.handedness
              );
            });
          }
        } else {
          frameTracker = "No hand in frame";
          currentSummaries = updateFrameEffects(handLookup, deltaTime, timestamp);
        }
      } catch (err) {
        frameTracker = "Tracker error";
        setError((prev) => prev || `Tracking failed: ${err.message}`);
      }

      fireballRef.current.draw(ctx);
      drawTransferEffects(ctx, timestamp);

      if (timestamp - lastHudUpdateRef.current > HUD_UPDATE_MS) {
        const ordered = [...currentSummaries].sort((a, b) => {
          const order = { Left: 0, Right: 1 };
          return (order[a.label] ?? 2) - (order[b.label] ?? 2);
        });

        setHandSummaries(ordered);
        setTrackerStatus(ordered.length ? `Tracking ${ordered.length} hand${ordered.length > 1 ? "s" : ""}` : frameTracker);
        lastHudUpdateRef.current = timestamp;
      }

      rafRef.current = requestAnimationFrame(animationLoop);
    };

    const boot = async () => {
      try {
        setLoading(true);
        setLoadingText("Requesting webcam permission...");
        setTrackerStatus("Starting camera");
        setError("");

        const stream = await initializeWebcam({ width: 1280, height: 720 });
        if (!isMounted) return;

        streamRef.current = stream;
        setLoadingText("Starting webcam stream...");
        await startWebcamStream(videoRef.current, stream);

        const { width, height } = await getVideoDimensions(videoRef.current);
        if (!isMounted) return;

        resizeCanvas(width, height);
        setTrackerStatus("Loading hand model");
        setLoadingText("Loading hand detection model...");
        await handTrackerRef.current.initialize();

        if (!isMounted) return;
        setLoading(false);
        setTrackerStatus("Ready");
        setHandSummaries([]);
        lastTimestampRef.current = performance.now();
        rafRef.current = requestAnimationFrame(animationLoop);
      } catch (err) {
        if (!isMounted) return;
        setLoading(false);
        setError(err.message || "Failed to initialize app.");
        setTrackerStatus("Error");
        setHandSummaries([]);
      }
    };

    boot();

    return () => {
      isMounted = false;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      handTrackerRef.current.close();
      detectorMapRef.current.clear();
      fireballOwnerRef.current = null;
      activeTransferRef.current = null;
      previousHandsRef.current.clear();
      transferEffectsRef.current = [];

      if (streamRef.current instanceof MediaStream) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const resizeCanvas = (videoWidth, videoHeight) => {
    if (!canvasRef.current) return;

    canvasRef.current.width = videoWidth;
    canvasRef.current.height = videoHeight;

    if (stageRef.current) {
      stageRef.current.style.aspectRatio = `${videoWidth} / ${videoHeight}`;
    }
  };

  const updateSetting = (key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (next.closedThreshold >= next.openThreshold) {
        next.closedThreshold = Math.max(0, next.openThreshold - 1);
      }
      return next;
    });
  };

  return (
    <main className="scifi-bg relative grid h-full w-full place-items-center overflow-hidden p-4 text-sky-50">
      {loading && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(8,21,37,0.5),rgba(1,4,10,0.85))]">
          <div className="grid min-w-[min(86vw,420px)] place-items-center gap-3 rounded-xl border border-cyan-200/30 bg-slate-950/80 p-4 shadow-[0_0_34px_rgba(59,130,212,0.22)]">
            <div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-200/30 border-t-cyan-100" />
            <p className="text-sm tracking-wide text-cyan-100">{loadingText}</p>
          </div>
        </div>
      )}

      <section
        ref={stageRef}
        className="relative aspect-video w-[min(94vw,1280px)] overflow-hidden rounded-2xl shadow-sciFi max-md:h-screen max-md:w-screen max-md:rounded-none"
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover brightness-95 saturate-105 contrast-110"
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full -scale-x-100" />
        <div className="scan-lines absolute inset-0" />
      </section>

      <aside className="absolute left-7 top-7 z-10 min-w-[260px] max-w-[92vw] rounded-xl border border-cyan-300/40 bg-slate-950/70 p-4 shadow-[0_0_28px_-8px_rgba(73,171,255,0.5)] backdrop-blur-md max-md:bottom-4 max-md:left-1/2 max-md:top-auto max-md:w-[min(92vw,440px)] max-md:-translate-x-1/2">
        <h1 className="mb-2 text-base font-bold uppercase tracking-[0.12em] text-cyan-100">Fireball Interface</h1>
        <p className="text-sm tracking-wide">
          <span className="text-sky-300/75">Tracker:</span> {trackerStatus}
        </p>
        <p className="text-sm tracking-wide">
          <span className="text-sky-300/75">Debug:</span> {debugEnabled ? "ON" : "OFF"}
        </p>

        <button
          type="button"
          onClick={() => setDebugEnabled((prev) => !prev)}
          className="mt-3 w-full rounded-lg border border-cyan-300/50 bg-gradient-to-b from-sky-900/70 to-slate-900/90 px-3 py-2 text-sm font-semibold tracking-wide text-cyan-50 transition hover:shadow-[0_0_18px_rgba(98,205,255,0.24)]"
        >
          Toggle Debug
        </button>

        <div className="mt-3 rounded-lg border border-cyan-200/20 bg-slate-900/50 p-3">
          <h2 className="mb-2 text-xs uppercase tracking-[0.12em] text-sky-200">Sensitivity</h2>

          <label className="mb-2 block text-xs text-sky-100/90">
            Open Fingers {settings.openThreshold}
            <input
              type="range"
              min="3"
              max="5"
              step="1"
              value={settings.openThreshold}
              onChange={(e) => updateSetting("openThreshold", Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>

          <label className="mb-2 block text-xs text-sky-100/90">
            Closed Fingers {settings.closedThreshold}
            <input
              type="range"
              min="0"
              max="2"
              step="1"
              value={settings.closedThreshold}
              onChange={(e) => updateSetting("closedThreshold", Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>

          <label className="mb-2 block text-xs text-sky-100/90">
            Confidence Frames {settings.confidenceFrames}
            <input
              type="range"
              min="2"
              max="8"
              step="1"
              value={settings.confidenceFrames}
              onChange={(e) => updateSetting("confidenceFrames", Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>

          <label className="block text-xs text-sky-100/90">
            Thumb Bias {settings.thumbBias.toFixed(2)}
            <input
              type="range"
              min="1"
              max="1.4"
              step="0.01"
              value={settings.thumbBias}
              onChange={(e) => updateSetting("thumbBias", Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
        </div>

        <p className="mt-2 text-xs text-sky-300/80">Press D or use button for landmarks.</p>

        <div className="mt-3 rounded-lg border border-cyan-200/20 bg-slate-900/50 p-3">
          <h2 className="mb-2 text-xs uppercase tracking-[0.12em] text-sky-200">Hands</h2>
          {handSummaries.length ? (
            handSummaries.map((hand) => (
              <div key={hand.key} className="mb-2 text-xs tracking-wide text-sky-100/90 last:mb-0">
                <div className="font-semibold text-cyan-100">{hand.label}</div>
                <div>Status: {hand.gestureState}</div>
                <div>Fingers: {hand.fingers}</div>
              </div>
            ))
          ) : (
            <div className="text-xs text-sky-100/70">No tracked hands yet</div>
          )}
        </div>
      </aside>

      {!!error && (
        <div className="absolute bottom-5 left-1/2 z-10 w-[min(86vw,640px)] -translate-x-1/2 rounded-lg border border-rose-300/50 bg-rose-950/75 px-4 py-3 text-center text-rose-100 shadow-lg">
          <strong className="block tracking-wide">Camera Error</strong>
          <p className="mt-1 text-sm">{error}</p>
        </div>
      )}
    </main>
  );
}

function drawDebug(ctx, canvas, landmarks, palmCenter, extendedFingerCount, state, label) {
  const width = canvas.width;
  const height = canvas.height;

  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];

  ctx.save();
  ctx.strokeStyle = "rgba(75, 202, 255, 0.5)";
  ctx.lineWidth = 1.75;

  connections.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
    ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
    ctx.stroke();
  });

  ctx.fillStyle = "rgba(90, 228, 255, 0.9)";
  landmarks.forEach((landmark) => {
    ctx.beginPath();
    ctx.arc(landmark.x * width, landmark.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "rgba(255, 160, 72, 0.95)";
  ctx.beginPath();
  ctx.arc(palmCenter.x * width, palmCenter.y * height, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(230, 248, 255, 0.95)";
  ctx.font = "600 22px Rajdhani, sans-serif";
  ctx.fillText(`${label}`, 20, 28);
  ctx.fillText(`Fingers: ${extendedFingerCount}`, 20, 56);
  ctx.fillText(`Gesture: ${state}`, 20, 84);
  ctx.restore();
}

function distanceBetween(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
