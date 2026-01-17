/**
 * Map Utility Functions
 * 
 * This module contains pure utility functions for map-related calculations.
 * These functions have no side effects and can be easily tested independently.
 * 
 * @module mapUtils
 */

/**
 * Interpolates between two heading values using the shortest rotation path.
 * 
 * This function ensures smooth rotation by always taking the shorter path
 * around the circle. For example, rotating from 350° to 10° will go through
 * 0° (20° total) rather than going the long way (340° total).
 * 
 * @param from - Starting heading in degrees (0-360, where 0 = North)
 * @param to - Target heading in degrees (0-360, where 0 = North)
 * @param t - Interpolation factor (0 = start, 1 = end, 0.5 = halfway)
 * @returns The interpolated heading in degrees (0-360)
 * 
 * @example
 * // Rotate from 350° to 10° (crossing North)
 * interpolateHeading(350, 10, 0.5) // Returns 0 (halfway through the 20° arc)
 * 
 * @example
 * // Rotate from 90° to 180°
 * interpolateHeading(90, 180, 0.5) // Returns 135 (halfway)
 */
export function interpolateHeading(from: number, to: number, t: number): number {
  let diff = to - from;
  
  // Normalize difference to -180 to 180 for shortest path
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  
  // Apply interpolation and normalize result to 0-360
  return (from + diff * t + 360) % 360;
}

/**
 * Calculates the bearing (direction) from one geographic point to another.
 * 
 * Uses the forward azimuth formula to determine which direction you would
 * need to travel from point A to reach point B. This is useful for
 * estimating vehicle heading when GPS heading is not available.
 * 
 * @param from - Starting point with lat/lng coordinates
 * @param to - Destination point with lat/lng coordinates
 * @returns Bearing in degrees (0-360, where 0 = North, 90 = East, 180 = South, 270 = West)
 * 
 * @example
 * // Calculate bearing from London to Paris
 * const bearing = calculateBearing(
 *   { lat: 51.5074, lng: -0.1278 },  // London
 *   { lat: 48.8566, lng: 2.3522 }    // Paris
 * );
 * // Returns approximately 148° (Southeast)
 */
export function calculateBearing(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  // Convert degrees to radians
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const dLon = (to.lng - from.lng) * Math.PI / 180;
  
  // Calculate bearing using spherical trigonometry
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  
  // Convert from radians to degrees and normalize to 0-360
  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  bearing = (bearing + 360) % 360;
  
  return bearing;
}

/**
 * Color Mapping for Vehicle Icons
 * 
 * Maps common vehicle color names to CSS hue-rotate values.
 * The base car icon has a cyan/teal color (~180° hue), so we calculate
 * the rotation needed to shift from cyan to the target color.
 * 
 * Hue wheel reference:
 * - Red: 0°
 * - Yellow: 60°
 * - Green: 120°
 * - Cyan: 180° (base)
 * - Blue: 240°
 * - Magenta: 300°
 */
const COLOR_HUE_ROTATIONS: Record<string, number> = {
  // Primary colors
  'red': -180,
  'orange': -150,
  'yellow': -120,
  'lime': -90,
  'green': -60,
  'teal': 0,
  'cyan': 0,
  'blue': 60,
  'purple': 90,
  'magenta': 120,
  'pink': 150,
  
  // Neutral colors (handled specially)
  'black': 0,
  'white': 0,
  'gray': 0,
  'grey': 0,
  'silver': 0,
  
  // Additional colors
  'gold': -130,
  'brown': -160,
  'maroon': -175,
  'navy': 60,
  'olive': -100,
  'aqua': 0,
  'turquoise': 10,
  'indigo': 75,
  'violet': 100,
  'coral': -165,
  'salmon': -155,
  'beige': -120,
};

/**
 * Generates a CSS filter string to colorize a vehicle icon.
 * 
 * The base car icon is cyan/teal colored. This function returns
 * a CSS filter that transforms the icon to the specified color
 * using hue-rotate, brightness, and saturation adjustments.
 * 
 * @param vehicleColor - The target color name (e.g., "red", "blue", "black")
 * @returns CSS filter string to apply to the image, or empty string if no transformation needed
 * 
 * @example
 * // Get filter for a red car
 * getColorFilter('red') // Returns "hue-rotate(-180deg)"
 * 
 * @example
 * // Get filter for a black car
 * getColorFilter('black') // Returns "brightness(0.1) saturate(0)"
 * 
 * @example
 * // Unknown color returns empty string
 * getColorFilter('sparkle') // Returns ""
 */
export function getColorFilter(vehicleColor: string | null): string {
  if (!vehicleColor) return '';
  
  const color = vehicleColor.toLowerCase().trim();
  const hueRotation = COLOR_HUE_ROTATIONS[color];
  
  if (hueRotation === undefined) {
    return '';
  }
  
  // Special handling for neutral colors
  if (color === 'black') {
    return 'brightness(0.1) saturate(0)';
  }
  if (color === 'white' || color === 'silver') {
    return 'brightness(1.5) saturate(0.3)';
  }
  if (color === 'gray' || color === 'grey') {
    return 'saturate(0)';
  }
  
  return `hue-rotate(${hueRotation}deg)`;
}

/**
 * Animation Easing Functions
 * 
 * These functions transform linear progress (0-1) into eased values
 * for smoother animations.
 */

/**
 * Cubic ease-out function for smooth deceleration.
 * 
 * Creates an animation that starts fast and gradually slows down,
 * giving a natural "coming to rest" feeling. Used for marker position
 * and heading animations.
 * 
 * @param t - Linear progress from 0 to 1
 * @returns Eased progress value from 0 to 1
 * 
 * @example
 * easeOutCubic(0)   // Returns 0 (start)
 * easeOutCubic(0.5) // Returns 0.875 (most progress done early)
 * easeOutCubic(1)   // Returns 1 (end)
 */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Configuration constants for map animations and thresholds.
 * 
 * These values control the behavior of driver marker animations
 * and can be adjusted to fine-tune the user experience.
 */
export const MAP_ANIMATION_CONFIG = {
  /**
   * Duration of position/heading animations in milliseconds.
   * Higher values = smoother but slower transitions.
   */
  ANIMATION_DURATION_MS: 800,
  
  /**
   * Minimum heading change (degrees) required to trigger rotation.
   * Prevents jittery rotation from GPS noise when stationary.
   */
  HEADING_THRESHOLD_DEGREES: 5,
  
  /**
   * Maximum time (ms) before forcing a heading update regardless of threshold.
   * Ensures the marker eventually aligns even with small changes.
   */
  HEADING_MAX_DELAY_MS: 2000,
  
  /**
   * Minimum distance (in lat/lng units, ~5 meters) before calculating
   * bearing from movement. Prevents erratic heading from GPS jitter.
   */
  MIN_MOVEMENT_FOR_BEARING: 0.00005,
  
  /**
   * Default marker size in pixels.
   */
  MARKER_SIZE_PX: 56,
};
