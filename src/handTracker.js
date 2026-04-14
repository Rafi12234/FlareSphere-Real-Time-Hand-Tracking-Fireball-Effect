import {
  FilesetResolver,
  HandLandmarker,
} from "@mediapipe/tasks-vision";

const MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class HandTracker {
  constructor() {
    this.handLandmarker = null;
    this.runningMode = "VIDEO";
    this.lastVideoTime = -1;
    this.lastResult = null;
  }

  async initialize() {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );

    this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_PATH,
      },
      runningMode: this.runningMode,
      numHands: 2,
      minHandDetectionConfidence: 0.45,
      minHandPresenceConfidence: 0.45,
      minTrackingConfidence: 0.45,
    });
  }

  detectForVideo(videoElement, timestampMs = performance.now()) {
    if (!this.handLandmarker) {
      throw new Error("HandTracker is not initialized.");
    }

    if (videoElement.readyState < 2) {
      return null;
    }

    // Avoid duplicate inference work when the HTML video frame did not advance.
    if (videoElement.currentTime === this.lastVideoTime) {
      return this.lastResult;
    }

    this.lastVideoTime = videoElement.currentTime;

    const result = this.handLandmarker.detectForVideo(videoElement, timestampMs);

    if (!result.landmarks?.length) {
      this.lastResult = null;
      return null;
    }

    this.lastResult = {
      hands: result.landmarks.map((landmarks, index) => ({
        landmarks,
        worldLandmarks: result.worldLandmarks?.[index] ?? null,
        handedness: result.handedness?.[index]?.[0]?.categoryName ?? `Hand-${index}`,
        score: result.handedness?.[index]?.[0]?.score ?? 0,
      })),
    };

    return this.lastResult;
  }

  close() {
    this.handLandmarker?.close();
    this.handLandmarker = null;
    this.lastResult = null;
    this.lastVideoTime = -1;
  }
}
