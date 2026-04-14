export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const lerp = (start, end, t) => start + (end - start) * t;

export const damp = (current, target, smoothing, deltaTime) => {
  const t = 1 - Math.exp(-smoothing * deltaTime);
  return lerp(current, target, t);
};

export const mapRange = (value, inMin, inMax, outMin, outMax) => {
  if (inMax === inMin) return outMin;
  const normalized = (value - inMin) / (inMax - inMin);
  return outMin + (outMax - outMin) * normalized;
};

export const distance = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
};

export const averagePoints = (points) => {
  if (!points.length) return { x: 0, y: 0 };
  const sum = points.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
};

export const smoothDamp2D = (current, target, smoothing = 0.25) => {
  return {
    x: lerp(current.x, target.x, clamp(smoothing, 0, 1)),
    y: lerp(current.y, target.y, clamp(smoothing, 0, 1)),
  };
};

export const damp2D = (current, target, smoothing, deltaTime) => {
  return {
    x: damp(current.x, target.x, smoothing, deltaTime),
    y: damp(current.y, target.y, smoothing, deltaTime),
  };
};

export const nowSeconds = () => performance.now() * 0.001;
