/**
 * Driver Marker Controller
 * 
 * This class manages a Leaflet marker for displaying and animating
 * a driver's location on the map. It handles:
 * - Smooth position interpolation between GPS updates
 * - Heading rotation with shortest-path calculation
 * - Vehicle color customization via CSS filters
 * - Popup binding for marker information
 * 
 * The controller is designed to be instantiated once and updated
 * repeatedly as new location data arrives, avoiding the performance
 * cost of recreating DOM elements on each update.
 * 
 * @class DriverMarkerController
 * 
 * @example
 * // Create controller
 * const controller = new DriverMarkerController(map, carIconUrl);
 * 
 * // Update on each GPS reading
 * controller.update({ lat: 51.5, lng: -0.1 }, 45, 'blue');
 * 
 * // Clean up when done
 * controller.destroy();
 */

import L from 'leaflet';
import {
  interpolateHeading,
  getColorFilter,
  easeOutCubic,
  MAP_ANIMATION_CONFIG,
} from '@/lib/mapUtils';

/**
 * Position interface for geographic coordinates.
 */
interface Position {
  lat: number;
  lng: number;
}

/**
 * Controller class for animating a driver marker on a Leaflet map.
 * 
 * Design decisions:
 * - Uses requestAnimationFrame for smooth 60fps animations
 * - Maintains refs to current/target positions for interpolation
 * - Filters small heading changes to prevent jittery rotation
 * - Updates DOM directly for performance (avoids React re-renders)
 */
export class DriverMarkerController {
  /**
   * Reference to the Leaflet map instance.
   */
  private map: L.Map;
  
  /**
   * The Leaflet marker being controlled.
   */
  private marker: L.Marker | null = null;
  
  /**
   * URL to the car icon image.
   */
  private iconUrl: string;
  
  /**
   * Current animation frame request ID (for cancellation).
   */
  private animationFrameId: number | null = null;
  
  /**
   * Current interpolated position during animation.
   */
  private currentPosition: Position;
  
  /**
   * Target position to animate towards.
   */
  private targetPosition: Position;
  
  /**
   * Current interpolated heading in degrees.
   */
  private currentHeading: number;
  
  /**
   * Target heading to animate towards.
   */
  private targetHeading: number;
  
  /**
   * Timestamp of the last heading update (for threshold timing).
   */
  private lastHeadingUpdateTime: number;
  
  /**
   * Whether a valid heading has been received yet.
   * Used to immediately accept the first heading value.
   */
  private hasReceivedValidHeading: boolean = false;
  
  /**
   * Current vehicle color filter applied to the icon.
   */
  private currentColorFilter: string = '';
  
  /**
   * Creates a new DriverMarkerController.
   * 
   * @param map - The Leaflet map to add the marker to
   * @param iconUrl - URL to the car icon image
   * @param initialPosition - Starting position for the marker
   * @param initialHeading - Initial heading in degrees (null if unknown)
   * @param vehicleColor - Initial vehicle color (null for default)
   */
  constructor(
    map: L.Map,
    iconUrl: string,
    initialPosition: Position = { lat: 0, lng: 0 },
    initialHeading: number | null = null,
    vehicleColor: string | null = null
  ) {
    this.map = map;
    this.iconUrl = iconUrl;
    this.currentPosition = { ...initialPosition };
    this.targetPosition = { ...initialPosition };
    this.currentHeading = initialHeading ?? 0;
    this.targetHeading = initialHeading ?? 0;
    this.lastHeadingUpdateTime = Date.now();
    this.hasReceivedValidHeading = initialHeading !== null;
    this.currentColorFilter = getColorFilter(vehicleColor);
    
    this.createMarker(initialPosition);
  }
  
  /**
   * Creates the Leaflet marker with custom car icon.
   * 
   * The icon uses a div wrapper for rotation transforms,
   * allowing smooth CSS transitions on the heading.
   * 
   * @param position - Initial position for the marker
   */
  private createMarker(position: Position): void {
    const icon = L.divIcon({
      className: 'animated-car-marker',
      html: this.generateIconHtml(),
      iconSize: [MAP_ANIMATION_CONFIG.MARKER_SIZE_PX, MAP_ANIMATION_CONFIG.MARKER_SIZE_PX],
      iconAnchor: [
        MAP_ANIMATION_CONFIG.MARKER_SIZE_PX / 2,
        MAP_ANIMATION_CONFIG.MARKER_SIZE_PX / 2,
      ],
    });
    
    this.marker = L.marker([position.lat, position.lng], {
      icon,
      zIndexOffset: 1000, // Ensure driver marker is above other markers
    });
    
    // Bind popup for click information
    this.marker.bindPopup('<strong>Driver Location</strong>');
    this.marker.addTo(this.map);
  }
  
  /**
   * Generates the HTML for the car icon with current rotation and color.
   * 
   * @returns HTML string for the icon div
   */
  private generateIconHtml(): string {
    const size = MAP_ANIMATION_CONFIG.MARKER_SIZE_PX;
    
    return `<div class="car-icon-wrapper" style="
      width: ${size}px;
      height: ${size}px;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 3px 8px rgba(0,0,0,0.5));
      transform: rotate(${this.currentHeading}deg);
      will-change: transform;
    ">
      <img 
        src="${this.iconUrl}" 
        alt="Driver" 
        style="
          width: 100%;
          height: 100%;
          object-fit: contain;
          ${this.currentColorFilter ? `filter: ${this.currentColorFilter};` : ''}
        "
      />
    </div>`;
  }
  
  /**
   * Updates the marker position, heading, and color.
   * 
   * This method should be called whenever new location data arrives.
   * It triggers a smooth animation to the new position and heading.
   * 
   * Heading Update Rules:
   * 1. First valid heading is always accepted immediately
   * 2. Subsequent headings require either:
   *    - Change of more than 5 degrees, OR
   *    - More than 2 seconds since last update
   * 
   * This prevents jittery rotation from GPS noise while ensuring
   * the marker eventually aligns with the true heading.
   * 
   * @param position - New geographic position
   * @param heading - New heading in degrees (null if unknown)
   * @param vehicleColor - Vehicle color for icon tinting (null for default)
   */
  public update(
    position: Position,
    heading: number | null,
    vehicleColor: string | null
  ): void {
    // Update target position
    this.targetPosition = { ...position };
    
    // Process heading update with smoothing logic
    if (heading !== null) {
      const isFirstValidHeading = !this.hasReceivedValidHeading;
      const headingDiff = Math.abs(heading - this.targetHeading);
      const normalizedDiff = headingDiff > 180 ? 360 - headingDiff : headingDiff;
      const timeSinceLastUpdate = Date.now() - this.lastHeadingUpdateTime;
      
      // Accept heading if: first valid, significant change, or timeout
      if (
        isFirstValidHeading ||
        normalizedDiff > MAP_ANIMATION_CONFIG.HEADING_THRESHOLD_DEGREES ||
        timeSinceLastUpdate > MAP_ANIMATION_CONFIG.HEADING_MAX_DELAY_MS
      ) {
        this.targetHeading = heading;
        this.lastHeadingUpdateTime = Date.now();
        this.hasReceivedValidHeading = true;
      }
    }
    
    // Update color filter if changed
    const newColorFilter = getColorFilter(vehicleColor);
    if (newColorFilter !== this.currentColorFilter) {
      this.currentColorFilter = newColorFilter;
      this.updateColorFilter();
    }
    
    // Start animation
    this.startAnimation();
  }
  
  /**
   * Updates the color filter on the icon image element.
   * 
   * Directly manipulates the DOM for performance.
   */
  private updateColorFilter(): void {
    if (!this.marker) return;
    
    const element = this.marker.getElement();
    if (!element) return;
    
    const img = element.querySelector('img');
    if (img) {
      img.style.filter = this.currentColorFilter || '';
    }
  }
  
  /**
   * Starts the animation loop to interpolate position and heading.
   * 
   * Uses requestAnimationFrame for smooth 60fps updates.
   * Cancels any existing animation before starting a new one.
   */
  private startAnimation(): void {
    // Cancel any existing animation
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    
    const startPosition = { ...this.currentPosition };
    const startHeading = this.currentHeading;
    const startTime = performance.now();
    const duration = MAP_ANIMATION_CONFIG.ANIMATION_DURATION_MS;
    
    /**
     * Animation frame callback.
     * Interpolates position and heading based on elapsed time.
     */
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Apply easing for smooth deceleration
      const eased = easeOutCubic(progress);
      
      // Interpolate position
      this.currentPosition = {
        lat: startPosition.lat + (this.targetPosition.lat - startPosition.lat) * eased,
        lng: startPosition.lng + (this.targetPosition.lng - startPosition.lng) * eased,
      };
      
      // Interpolate heading using shortest path
      this.currentHeading = interpolateHeading(startHeading, this.targetHeading, eased);
      
      // Update marker position and rotation
      this.applyUpdate();
      
      // Continue animation if not complete
      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.animationFrameId = null;
      }
    };
    
    this.animationFrameId = requestAnimationFrame(animate);
  }
  
  /**
   * Applies the current interpolated position and heading to the marker.
   * 
   * Updates the Leaflet marker position and the CSS rotation transform.
   */
  private applyUpdate(): void {
    if (!this.marker) return;
    
    // Update marker position on map
    this.marker.setLatLng([this.currentPosition.lat, this.currentPosition.lng]);
    
    // Update rotation via DOM
    const element = this.marker.getElement();
    if (!element) return;
    
    const wrapper = element.querySelector('.car-icon-wrapper') as HTMLElement;
    if (wrapper) {
      wrapper.style.transform = `rotate(${this.currentHeading}deg)`;
    }
  }
  
  /**
   * Cleans up the marker and cancels any pending animations.
   * 
   * Should be called when the marker is no longer needed
   * to prevent memory leaks.
   */
  public destroy(): void {
    // Cancel any pending animation
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Remove marker from map
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
  }
  
  /**
   * Gets the current position of the marker.
   * 
   * @returns Current interpolated position
   */
  public getPosition(): Position {
    return { ...this.currentPosition };
  }
  
  /**
   * Gets the current heading of the marker.
   * 
   * @returns Current interpolated heading in degrees
   */
  public getHeading(): number {
    return this.currentHeading;
  }
}
