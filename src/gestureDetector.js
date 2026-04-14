import {
  averagePoints,
  clamp,
  damp,
  distance,
  lerp,
  mapRange,
  smoothDamp2D,
} from "./utils.js";

const LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_TIP: 20,
};

const DEFAULT_CONFIG = {
  openThreshold: 4,
  closedThreshold: 1,
  openConfidenceFrames: 2,
  closedConfidenceFrames: 2,
  strongOpenThreshold: 5,
  strongClosedThreshold: 1,
  fingerStraightnessBias: 1.08,
  thumbExtensionBias: 1.1,
  thumbAngleMin: 145,
  minPalmSmoothing: 0.22,
  maxPalmSmoothing: 0.5,
  scaleSmoothing: 10,
  noHandGraceFrames: 6,
};

export class GestureDetector {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.openFrameCount = 0;
    this.closedFrameCount = 0;
    this.currentState = "No Hand";
    this.smoothedPalm = { x: 0.5, y: 0.5 };
    this.smoothedScale = 1;
    this.noHandFrames = 0;
  }

  cloneWithConfig() {
    return new GestureDetector({ ...this.config });
  }

  updateConfig(nextConfig = {}) {
    this.config = {
      ...this.config,
      ...nextConfig,
    };

    if (this.config.closedThreshold >= this.config.openThreshold) {
      this.config.closedThreshold = Math.max(0, this.config.openThreshold - 1);
    }

    if (this.config.strongOpenThreshold < this.config.openThreshold) {
      this.config.strongOpenThreshold = this.config.openThreshold + 1;
    }

    if (this.config.strongClosedThreshold > this.config.closedThreshold) {
      this.config.strongClosedThreshold = this.config.closedThreshold;
    }
  }

  reset() {
    this.openFrameCount = 0;
    this.closedFrameCount = 0;
    this.currentState = "No Hand";
    this.noHandFrames = 0;
  }

  detect(landmarks, handednessOrDeltaTime = "Unknown", maybeDeltaTime = 1 / 60) {
    const handedness = typeof handednessOrDeltaTime === "number" ? "Unknown" : handednessOrDeltaTime;
    const deltaTime = typeof handednessOrDeltaTime === "number" ? handednessOrDeltaTime : maybeDeltaTime;

    if (!landmarks?.length) {
      this.noHandFrames += 1;
      if (this.noHandFrames >= this.config.noHandGraceFrames) {
        this.currentState = "No Hand";
        this.openFrameCount = 0;
        this.closedFrameCount = 0;
      }

      this.smoothedScale = damp(
        this.smoothedScale,
        1,
        this.config.scaleSmoothing,
        deltaTime
      );

      return {
        gestureState: "No Hand",
        isPalmOpen: false,
        palmCenter: this.smoothedPalm,
        scaleFactor: this.smoothedScale,
        extendedFingerCount: 0,
      };
    }

    this.noHandFrames = 0;

    const palmCenter = this.computePalmCenter(landmarks);
    const palmDelta = distance(this.smoothedPalm, palmCenter);
    const adaptiveSmoothing = clamp(
      mapRange(palmDelta, 0.004, 0.08, this.config.minPalmSmoothing, this.config.maxPalmSmoothing),
      this.config.minPalmSmoothing,
      this.config.maxPalmSmoothing
    );

    this.smoothedPalm = smoothDamp2D(
      this.smoothedPalm,
      palmCenter,
      adaptiveSmoothing
    );

    const extendedCount = this.countExtendedFingers(landmarks, handedness);
    const strongOpen = extendedCount >= this.config.strongOpenThreshold;
    const zeroFingerClosed = extendedCount === 0;
    const strongClose = zeroFingerClosed || extendedCount <= this.config.strongClosedThreshold;

    // Strong poses switch immediately; ambiguous frames still use hysteresis.
    const instantState = strongOpen
      ? "Open Palm"
      : strongClose
        ? "Closed Palm"
        : extendedCount >= this.config.openThreshold
          ? "Open Palm"
          : extendedCount <= this.config.closedThreshold
            ? "Closed Palm"
            : this.currentState;

    if (instantState === "Open Palm") {
      this.openFrameCount += 1;
      this.closedFrameCount = Math.max(0, this.closedFrameCount - 1);
    } else if (instantState === "Closed Palm") {
      this.closedFrameCount += 1;
      this.openFrameCount = Math.max(0, this.openFrameCount - 1);
    } else {
      this.openFrameCount = Math.max(0, this.openFrameCount - 1);
      this.closedFrameCount = Math.max(0, this.closedFrameCount - 1);
    }

    if (strongOpen || this.openFrameCount >= this.config.openConfidenceFrames) {
      this.currentState = "Open Palm";
      this.closedFrameCount = 0;
      this.openFrameCount = Math.max(this.openFrameCount, this.config.openConfidenceFrames);
    } else if (strongClose || this.closedFrameCount >= this.config.closedConfidenceFrames) {
      this.currentState = "Closed Palm";
      this.openFrameCount = 0;
      this.closedFrameCount = Math.max(this.closedFrameCount, this.config.closedConfidenceFrames);
    }

    // Hard guard: zero extended fingers must never remain in Open Palm state.
    if (extendedCount === 0) {
      this.currentState = "Closed Palm";
      this.openFrameCount = 0;
      this.closedFrameCount = Math.max(this.closedFrameCount, this.config.closedConfidenceFrames);
    }

    this.smoothedScale = damp(
      this.smoothedScale,
      this.estimateScale(landmarks),
      this.config.scaleSmoothing,
      deltaTime
    );

    return {
      gestureState: this.currentState,
      isPalmOpen: this.currentState === "Open Palm",
      palmCenter: this.smoothedPalm,
      scaleFactor: this.smoothedScale,
      extendedFingerCount: extendedCount,
    };
  }

  getStateSummary() {
    return {
      currentState: this.currentState,
      openFrameCount: this.openFrameCount,
      closedFrameCount: this.closedFrameCount,
      noHandFrames: this.noHandFrames,
    };
  }

  computePalmCenter(landmarks) {
    return averagePoints([
      landmarks[LANDMARKS.WRIST],
      landmarks[LANDMARKS.INDEX_MCP],
      landmarks[LANDMARKS.MIDDLE_MCP],
      landmarks[LANDMARKS.RING_MCP],
      landmarks[LANDMARKS.PINKY_MCP],
    ]);
  }

  estimateScale(landmarks) {
    const palmWidth = distance(
      landmarks[LANDMARKS.INDEX_MCP],
      landmarks[LANDMARKS.PINKY_MCP]
    );
    const palmHeight = distance(
      landmarks[LANDMARKS.WRIST],
      landmarks[LANDMARKS.MIDDLE_MCP]
    );
    const palmSize = (palmWidth + palmHeight) * 0.5;

    return clamp(mapRange(palmSize, 0.09, 0.24, 0.7, 1.8), 0.6, 2.1);
  }

  countExtendedFingers(landmarks, handedness = "Unknown") {
    const wrist = landmarks[LANDMARKS.WRIST];
    const palmCenter = this.computePalmCenter(landmarks);
    const palmSize = this.getPalmSize(landmarks);
    const handLabel = String(handedness).toLowerCase();

    const fingerDefinitions = [
      {
        mcp: LANDMARKS.INDEX_MCP,
        pip: LANDMARKS.INDEX_PIP,
        tip: LANDMARKS.INDEX_TIP,
      },
      {
        mcp: LANDMARKS.MIDDLE_MCP,
        pip: LANDMARKS.MIDDLE_PIP,
        tip: LANDMARKS.MIDDLE_TIP,
      },
      {
        mcp: LANDMARKS.RING_MCP,
        pip: LANDMARKS.RING_PIP,
        tip: LANDMARKS.RING_TIP,
      },
      {
        mcp: LANDMARKS.PINKY_MCP,
        pip: LANDMARKS.PINKY_PIP,
        tip: LANDMARKS.PINKY_TIP,
      },
    ];

    const nonThumbCount = fingerDefinitions.reduce((count, finger) => {
      const mcp = landmarks[finger.mcp];
      const pip = landmarks[finger.pip];
      const tip = landmarks[finger.tip];

      const fingerAxis = this.normalizeVector({
        x: tip.x - mcp.x,
        y: tip.y - mcp.y,
      });

      const tipProjection = this.projectPoint(mcp, tip, fingerAxis);
      const pipProjection = this.projectPoint(mcp, pip, fingerAxis);
      const tipDistance = distance(tip, palmCenter);
      const pipDistance = distance(pip, palmCenter);

      const tipAheadOfPip = tipProjection > pipProjection * this.config.fingerStraightnessBias;
      const tipFartherFromPalm = tipDistance > pipDistance * 1.03;
      const fingerLength = distance(mcp, tip);
      const fingerLongEnough = fingerLength > palmSize * 0.42;

      const isExtended = tipAheadOfPip && tipFartherFromPalm && fingerLongEnough;

      return count + Number(isExtended);
    }, 0);

    const thumbCmc = landmarks[LANDMARKS.THUMB_CMC];
    const thumbTip = landmarks[LANDMARKS.THUMB_TIP];
    const thumbIp = landmarks[LANDMARKS.THUMB_IP];
    const thumbMcp = landmarks[LANDMARKS.THUMB_MCP];
    const indexMcp = landmarks[LANDMARKS.INDEX_MCP];
    const pinkyMcp = landmarks[LANDMARKS.PINKY_MCP];

    const thumbSpread = distance(thumbTip, indexMcp);
    const thumbFoldedSpread = distance(thumbIp, indexMcp);
    const thumbLength = distance(thumbTip, thumbMcp);
    const thumbBaseLength = distance(thumbIp, thumbMcp);
    const thumbAngle = this.getAngle(thumbMcp, thumbIp, thumbTip);
    const palmWidth = distance(indexMcp, pinkyMcp);
    const thumbToPalm = distance(thumbTip, palmCenter);
    const thumbRootToPalm = distance(thumbMcp, palmCenter);
    const thumbBaseToPalm = distance(thumbIp, palmCenter);

    const thumbDirection = this.normalizeVector({
      x: thumbTip.x - thumbCmc.x,
      y: thumbTip.y - thumbCmc.y,
    });
    const palmSpreadVector = this.normalizeVector({
      x: pinkyMcp.x - indexMcp.x,
      y: pinkyMcp.y - indexMcp.y,
    });

    const thumbProjectedOutward = Math.abs(this.dot(thumbDirection, palmSpreadVector)) > 0.28;
    const thumbAwayFromPalm = thumbToPalm > thumbBaseToPalm * 1.05;
    const thumbRootOpen = thumbTip.x !== thumbMcp.x ? thumbLength > thumbBaseLength * 1.08 : false;
    const thumbOnCorrectSide =
      handLabel.includes("left")
        ? thumbTip.x < palmCenter.x + palmWidth * 0.08
        : handLabel.includes("right")
          ? thumbTip.x > palmCenter.x - palmWidth * 0.08
          : true;

    // Thumb is extended only when it is longer, farther from the palm, and points outward.
    const thumbExtended =
      thumbSpread > thumbFoldedSpread * this.config.thumbExtensionBias &&
      thumbLength > thumbBaseLength * this.config.thumbExtensionBias &&
      thumbAngle >= this.config.thumbAngleMin &&
      thumbToPalm > palmWidth * 0.42 &&
      thumbProjectedOutward &&
      thumbAwayFromPalm &&
      thumbRootOpen &&
      thumbOnCorrectSide;

    return nonThumbCount + Number(thumbExtended);
  }

  getPalmSize(landmarks) {
    const palmWidth = distance(
      landmarks[LANDMARKS.INDEX_MCP],
      landmarks[LANDMARKS.PINKY_MCP]
    );
    const palmHeight = distance(
      landmarks[LANDMARKS.WRIST],
      landmarks[LANDMARKS.MIDDLE_MCP]
    );

    return (palmWidth + palmHeight) * 0.5;
  }

  normalizeVector(vector) {
    const magnitude = Math.hypot(vector.x, vector.y);
    if (magnitude === 0) return { x: 0, y: 0 };

    return { x: vector.x / magnitude, y: vector.y / magnitude };
  }

  dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  projectPoint(origin, point, axis) {
    return this.dot({ x: point.x - origin.x, y: point.y - origin.y }, axis);
  }

  getAngle(a, b, c) {
    const abx = a.x - b.x;
    const aby = a.y - b.y;
    const cbx = c.x - b.x;
    const cby = c.y - b.y;

    const dot = abx * cbx + aby * cby;
    const magAB = Math.hypot(abx, aby);
    const magCB = Math.hypot(cbx, cby);
    if (magAB === 0 || magCB === 0) return 0;

    const cosine = clamp(dot / (magAB * magCB), -1, 1);
    return (Math.acos(cosine) * 180) / Math.PI;
  }
}
