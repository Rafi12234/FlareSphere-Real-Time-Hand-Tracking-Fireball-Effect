export async function initializeWebcam({
  width = 1280,
  height = 720,
  facingMode = "user",
} = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("getUserMedia is not supported in this browser.");
  }

  const constraints = {
    audio: false,
    video: {
      width: { ideal: width },
      height: { ideal: height },
      facingMode: { ideal: facingMode },
    },
  };

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    if (error.name === "NotAllowedError") {
      throw new Error("Webcam access was denied. Please allow camera permission and retry.");
    }

    if (error.name === "NotFoundError") {
      throw new Error("No webcam device was found on this machine.");
    }

    throw new Error(`Unable to initialize webcam: ${error.message}`);
  }
}

export async function startWebcamStream(videoElement, stream) {
  videoElement.autoplay = true;
  videoElement.muted = true;
  videoElement.playsInline = true;
  videoElement.srcObject = stream;

  await videoElement.play();
}

export function getVideoDimensions(videoElement) {
  return new Promise((resolve) => {
    const done = () => {
      resolve({
        width: videoElement.videoWidth,
        height: videoElement.videoHeight,
      });
    };

    if (videoElement.readyState >= 1 && videoElement.videoWidth > 0) {
      done();
      return;
    }

    videoElement.addEventListener("loadedmetadata", done, { once: true });
  });
}
