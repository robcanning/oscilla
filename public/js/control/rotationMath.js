// rotationMath.js -- shared rotation constraint math for control plane
// Extracted from controlXY.js for reuse by o2p and future modules
// © 2025 Rob Canning — GPLv3

/**
 * Normalize hmode value to 'continuous' or 'limited'
 * Anything falsy or unrecognized defaults to 'continuous'
 */
export function normalizeHmodeValue(val) {
  if (val === 'limited' || val === 'limit' || val === 'clamped' || val === 'clamp') {
    return 'limited';
  }
  if (val === 'continuous' || val === 'cont' || val === 'wrap') {
    return 'continuous';
  }
  return 'continuous';
}

/**
 * Parse hmode parameter -- supports single value or array
 * Returns array matching count length
 */
export function parseHmode(hmodeValue, count) {
  if (hmodeValue === undefined || hmodeValue === null || hmodeValue === '') {
    return Array(count).fill('continuous');
  }
  if (Array.isArray(hmodeValue)) {
    const result = [];
    for (let i = 0; i < count; i++) {
      const val = hmodeValue[i];
      result.push(val ? normalizeHmodeValue(val) : 'continuous');
    }
    return result;
  }
  const normalized = normalizeHmodeValue(hmodeValue);
  return Array(count).fill(normalized);
}

/**
 * Parse rotation range in degrees
 * Default: 270 for limited, 360 for continuous
 */
export function parseRotRange(rotRangeValue, hmode) {
  if (typeof rotRangeValue === 'number') {
    return rotRangeValue;
  }
  return hmode === 'limited' ? 270 : 360;
}

/**
 * Constrain rotation angle based on hmode
 * Coordinate system: 0 = 7 o'clock (120deg standard SVG), clockwise positive
 *
 * Examples with 270deg range (limited mode default):
 *   0deg   (7 o'clock)  = minimum
 *   270deg (4 o'clock)  = maximum
 */
export function constrainRotation(angleDeg, hmode, range, currentAngle = 0) {
  if (hmode === 'continuous') {
    return ((angleDeg % 360) + 360) % 360;
  }

  // Limited mode -- stops at min/max
  let normalized = ((angleDeg % 360) + 360) % 360;

  if (normalized > range) {
    const distToMin = Math.min(normalized, 360 - normalized);
    const distToMax = Math.abs(normalized - range);
    return distToMin < distToMax ? 0 : range;
  }

  return normalized;
}

/**
 * Normalize rotation angle to 0-1 based on hmode
 *   limited:    0-rotRange  -> 0-1
 *   continuous: 0-360       -> 0-1
 */
export function normalizeRotation(angleDeg, hmode, range) {
  if (hmode === 'limited' && range) {
    return Math.max(0, Math.min(1, angleDeg / range));
  }
  return ((angleDeg % 360) + 360) % 360 / 360;
}

/**
 * Denormalize 0-1 value back to angle in degrees
 */
export function denormalizeRotation(normP, hmode, range) {
  if (hmode === 'limited' && range) {
    return normP * range;
  }
  return normP * 360;
}

/**
 * Shortest-arc interpolation for normalized rotation values (0-1)
 * Used for continuous mode tweening
 */
export function lerpAngleNorm(a, b, progress) {
  let diff = b - a;
  if (diff > 0.5) diff -= 1;
  if (diff < -0.5) diff += 1;
  return ((a + diff * progress) % 1 + 1) % 1;
}
