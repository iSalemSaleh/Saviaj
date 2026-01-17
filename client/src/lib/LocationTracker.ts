/**
 * Location Tracker
 * 
 * This class manages GPS location tracking with heading estimation.
 * It handles both browser Geolocation API and native platform APIs
 * (via Capacitor), providing a unified interface for location updates.
 * 
 * @class LocationTracker
 * 
 * @example
 * // Create tracker
 * const tracker = new LocationTracker();
 * 
 * // Listen for updates
 * tracker.onLocationUpdate((location) => {
 *   console.log('New position:', location.lat, location.lng);
 *   console.log('Heading:', location.heading);
 * });
 * 
 * // Start tracking
 * await tracker.start();
 * 
 * // Stop when done
 * tracker.stop();
 */

import {
  watchPosition,
  isNativePlatform,
  requestPermissions,
  GeolocationResult,
} from '@/lib/nativeGeolocation';
import { calculateBearing, MAP_ANIMATION_CONFIG } from '@/lib/mapUtils';

/**
 * Location data with optional heading and speed.
 */
export interface TrackedLocation {
  /**
   * Latitude in decimal degrees.
   */
  lat: number;
  
  /**
   * Longitude in decimal degrees.
   */
  lng: number;
  
  /**
   * Heading in degrees (0-360, 0 = North).
   * Calculated from movement if not provided by GPS.
   */
  heading?: number;
  
  /**
   * Speed in meters per second.
   */
  speed?: number;
  
  /**
   * Timestamp of the location reading.
   */
  timestamp: number;
}

/**
 * Callback type for location updates.
 */
type LocationCallback = (location: TrackedLocation) => void;

/**
 * Callback type for errors.
 */
type ErrorCallback = (error: string) => void;

/**
 * Configuration options for the location tracker.
 */
export interface LocationTrackerOptions {
  /**
   * Enable high accuracy mode (GPS vs network).
   * Higher accuracy uses more battery.
   * @default true
   */
  enableHighAccuracy?: boolean;
  
  /**
   * Maximum age (ms) of a cached position to use.
   * @default 5000
   */
  maximumAge?: number;
  
  /**
   * Timeout (ms) for acquiring position.
   * @default 10000
   */
  timeout?: number;
}

/**
 * GPS location tracker with heading estimation.
 * 
 * Features:
 * - Cross-platform support (browser and native apps)
 * - Automatic heading estimation from movement
 * - Noise filtering for stable heading
 * - Clean event-based API
 */
export class LocationTracker {
  /**
   * Configuration options.
   */
  private options: Required<LocationTrackerOptions>;
  
  /**
   * Watch handle for stopping location updates.
   */
  private watchHandle: { clearWatch: () => void } | null = null;
  
  /**
   * Previous position for heading calculation.
   */
  private previousPosition: { lat: number; lng: number } | null = null;
  
  /**
   * Whether tracking is currently active.
   */
  private isTracking: boolean = false;
  
  /**
   * Event callbacks.
   */
  private locationCallbacks: LocationCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  
  /**
   * Creates a new LocationTracker.
   * 
   * @param options - Configuration options
   */
  constructor(options: LocationTrackerOptions = {}) {
    this.options = {
      enableHighAccuracy: options.enableHighAccuracy ?? true,
      maximumAge: options.maximumAge ?? 5000,
      timeout: options.timeout ?? 10000,
    };
  }
  
  /**
   * Starts location tracking.
   * 
   * Requests permissions if needed (native platforms) and begins
   * watching the device's position. Location updates are delivered
   * via the onLocationUpdate callback.
   * 
   * @throws Error if location services are unavailable
   */
  public async start(): Promise<void> {
    if (this.isTracking) {
      return; // Already tracking
    }
    
    // Check availability
    if (!isNativePlatform() && !navigator.geolocation) {
      const error = 'Location services unavailable. Please use a modern browser with HTTPS.';
      this.notifyError(error);
      throw new Error(error);
    }
    
    // Request permissions on native platforms
    if (isNativePlatform()) {
      try {
        await requestPermissions();
      } catch (e) {
        const error = 'Location permission denied';
        this.notifyError(error);
        throw new Error(error);
      }
    }
    
    // Start watching position
    this.watchHandle = watchPosition(
      this.handlePosition.bind(this),
      this.handleError.bind(this),
      {
        enableHighAccuracy: this.options.enableHighAccuracy,
        timeout: this.options.timeout,
        maximumAge: this.options.maximumAge,
      }
    );
    
    this.isTracking = true;
  }
  
  /**
   * Stops location tracking.
   * 
   * Clears the position watch and resets internal state.
   */
  public stop(): void {
    if (this.watchHandle) {
      this.watchHandle.clearWatch();
      this.watchHandle = null;
    }
    
    this.isTracking = false;
    this.previousPosition = null;
  }
  
  /**
   * Handles incoming position updates.
   * 
   * Calculates heading from movement if not provided by the GPS,
   * then notifies all listeners.
   * 
   * @param position - Position from the Geolocation API
   */
  private handlePosition(position: GeolocationResult): void {
    const currentPos = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    
    // Get heading from GPS if available
    let heading = position.coords.heading ?? undefined;
    
    // Calculate heading from movement if not provided
    if (heading === undefined || heading === null) {
      heading = this.estimateHeadingFromMovement(currentPos);
    }
    
    // Update previous position for next calculation
    this.previousPosition = currentPos;
    
    // Build location object
    const location: TrackedLocation = {
      lat: currentPos.lat,
      lng: currentPos.lng,
      heading,
      speed: position.coords.speed ?? undefined,
      timestamp: position.timestamp,
    };
    
    // Notify listeners
    this.notifyLocationUpdate(location);
  }
  
  /**
   * Estimates heading based on movement from previous position.
   * 
   * Only calculates heading if the movement distance is above
   * a minimum threshold to avoid erratic values from GPS jitter.
   * 
   * @param currentPos - Current position
   * @returns Estimated heading or undefined if insufficient movement
   */
  private estimateHeadingFromMovement(
    currentPos: { lat: number; lng: number }
  ): number | undefined {
    if (!this.previousPosition) {
      return undefined;
    }
    
    // Calculate distance (approximate, in coordinate units)
    const distance = Math.sqrt(
      Math.pow(currentPos.lat - this.previousPosition.lat, 2) +
      Math.pow(currentPos.lng - this.previousPosition.lng, 2)
    );
    
    // Only calculate heading if movement is significant
    if (distance < MAP_ANIMATION_CONFIG.MIN_MOVEMENT_FOR_BEARING) {
      return undefined;
    }
    
    return calculateBearing(this.previousPosition, currentPos);
  }
  
  /**
   * Handles geolocation errors.
   * 
   * Translates error codes to user-friendly messages.
   * 
   * @param err - Error from the Geolocation API
   */
  private handleError(err: unknown): void {
    let errorMessage = 'Location error';
    
    if (err && typeof err === 'object' && 'code' in err) {
      const geoError = err as GeolocationPositionError;
      
      switch (geoError.code) {
        case 1: // PERMISSION_DENIED
          errorMessage = 'Location access denied. Please enable location in your device settings.';
          break;
        case 2: // POSITION_UNAVAILABLE
          errorMessage = 'Location unavailable. Please check your GPS or network connection.';
          break;
        case 3: // TIMEOUT
          errorMessage = 'Location request timed out. Please try again.';
          break;
        default:
          errorMessage = geoError.message || 'Unable to get location';
      }
    } else if (err && typeof err === 'object' && 'message' in err) {
      errorMessage = (err as Error).message || 'Unable to get location';
    }
    
    this.notifyError(errorMessage);
  }
  
  /**
   * Notifies location update listeners.
   */
  private notifyLocationUpdate(location: TrackedLocation): void {
    this.locationCallbacks.forEach((cb) => cb(location));
  }
  
  /**
   * Notifies error listeners.
   */
  private notifyError(error: string): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }
  
  /**
   * Registers a callback for location updates.
   * 
   * @param callback - Function to call when location is updated
   * @returns Unsubscribe function
   * 
   * @example
   * const unsubscribe = tracker.onLocationUpdate((location) => {
   *   console.log('New location:', location);
   * });
   * 
   * // Later, to stop receiving updates:
   * unsubscribe();
   */
  public onLocationUpdate(callback: LocationCallback): () => void {
    this.locationCallbacks.push(callback);
    return () => {
      this.locationCallbacks = this.locationCallbacks.filter((cb) => cb !== callback);
    };
  }
  
  /**
   * Registers a callback for errors.
   * 
   * @param callback - Function to call when an error occurs
   * @returns Unsubscribe function
   */
  public onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
    };
  }
  
  /**
   * Checks if tracking is currently active.
   */
  public isActive(): boolean {
    return this.isTracking;
  }
}
