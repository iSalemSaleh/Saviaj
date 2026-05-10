/**
 * Ride Map Component
 * 
 * This component displays an interactive map for ride tracking.
 * It renders pickup/dropoff markers, route polyline, and animated
 * driver/rider markers with real-time updates.
 * 
 * Architecture:
 * - Uses modular sub-components for each marker type
 * - Delegates route fetching to useRoute hook
 * - Delegates day/night detection to useSunlight hook
 * - Delegates driver animation to DriverMarkerController
 * 
 * File Dependencies:
 * - ./useSunlight.ts: Day/night detection hook
 * - ./DriverMarkerController.ts: Animated marker controller class
 * - @/hooks/useRoute.ts: Route fetching hook
 * - @/lib/mapUtils.ts: Utility functions
 * 
 * @component
 * 
 * @example
 * <RideMap
 *   pickupLocation={{ lat: 51.5074, lng: -0.1278 }}
 *   dropoffLocation={{ lat: 51.5174, lng: -0.1378 }}
 *   driverLocation={driverLocation}
 *   driverVehicleColor="blue"
 *   showRoute={true}
 *   onEtaUpdate={(eta) => console.log('ETA:', eta)}
 * />
 */

import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { useIsDarkMode } from './useSunlight';
import { useRoute } from '@/hooks/useRoute';
import { DriverMarkerController } from './DriverMarkerController';
import carIconImage from '../../assets/car-icon.png';

// ============================================================
// Constants
// ============================================================

/**
 * Minimum distance change (in degrees) required to trigger a bounds update.
 * Approximately 50 meters at mid-latitudes.
 */
const BOUNDS_UPDATE_THRESHOLD = 0.0005;

/**
 * Minimum time (ms) between bounds updates to prevent excessive re-renders.
 */
const BOUNDS_UPDATE_THROTTLE_MS = 2000;

// ============================================================
// Type Definitions
// ============================================================

/**
 * Geographic position with optional heading and speed.
 */
interface Location {
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

/**
 * Props for the RideMap component.
 */
interface RideMapProps {
  /**
   * Pickup location coordinates.
   * Displayed as a blue dot on the map.
   */
  pickupLocation: Location;
  
  /**
   * Dropoff/destination location coordinates.
   * Displayed as a red location pin on the map.
   */
  dropoffLocation: Location;
  
  /**
   * Driver's current location (for real-time tracking).
   * When provided, displays an animated car marker.
   */
  driverLocation?: Location | null;
  
  /**
   * Rider's current location (for driver's view).
   * When provided, displays a user icon marker.
   */
  riderLocation?: Location | null;
  
  /**
   * Driver's heading in degrees (fallback if not in driverLocation).
   * 0 = North, 90 = East, 180 = South, 270 = West
   */
  driverHeading?: number | null;
  
  /**
   * Vehicle color for tinting the driver icon.
   * Supports common color names: red, blue, black, white, etc.
   */
  driverVehicleColor?: string | null;
  
  /**
   * Whether to fetch and display the route polyline.
   * @default true
   */
  showRoute?: boolean;
  
  /**
   * Callback when ETA is updated (in minutes).
   */
  onEtaUpdate?: (etaMinutes: number) => void;
  
  /**
   * Callback when distance is updated (in miles).
   */
  onDistanceUpdate?: (distanceMiles: number) => void;
  
  /**
   * Additional CSS classes for the container.
   */
  className?: string;
}

// ============================================================
// Static Icon Factory
// ============================================================

/**
 * Creates a Leaflet divIcon for pickup/dropoff/rider markers.
 * 
 * These icons are static (non-animated) and are created using
 * Leaflet's divIcon with inline styles for maximum compatibility.
 * 
 * Icon Styles:
 * - Pickup: Blue dot (represents starting point)
 * - Dropoff: Red location pin (represents destination)
 * - Rider: Cyan circle with user emoji (represents passenger)
 * 
 * @param type - Type of marker to create
 * @returns Leaflet DivIcon instance
 */
function createStaticIcon(type: 'rider' | 'pickup' | 'dropoff'): L.DivIcon {
  if (type === 'pickup') {
    // Blue dot for pickup location — sized for mobile visibility (Material guideline ~24dp+)
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 22px;
        height: 22px;
        background-color: #0ea5e9;
        border-radius: 50%;
        border: 4px solid white;
        box-shadow: 0 2px 10px rgba(0,0,0,0.35);
      "></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }
  
  if (type === 'dropoff') {
    // Red location pin for dropoff — bumped up for mobile readability
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 40px;
        height: 52px;
        display: flex;
        flex-direction: column;
        align-items: center;
      ">
        <div style="
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #ef4444, #dc2626);
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 3px solid white;
          box-shadow: 0 2px 10px rgba(0,0,0,0.4);
        ">
          <div style="
            width: 10px;
            height: 10px;
            background: white;
            border-radius: 50%;
            transform: rotate(45deg);
          "></div>
        </div>
      </div>`,
      iconSize: [40, 52],
      iconAnchor: [20, 52],
    });
  }
  
  // Rider icon - cyan circle with user emoji
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 40px;
      height: 40px;
      background-color: #0891b2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      border: 3px solid white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    ">👤</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

// ============================================================
// Sub-Components
// ============================================================

/**
 * Calculates the maximum position change from previous positions.
 * Used to determine if a bounds update is needed.
 */
function getMaxPositionChange(
  current: { lat: number; lng: number },
  previous: { lat: number; lng: number } | null
): number {
  if (!previous) return Infinity; // First update always triggers
  return Math.max(
    Math.abs(current.lat - previous.lat),
    Math.abs(current.lng - previous.lng)
  );
}

/**
 * Component that adjusts map bounds to fit all markers.
 * 
 * Automatically adjusts the map viewport when locations change
 * to ensure all markers are visible with appropriate padding.
 * 
 * Optimization:
 * - Throttled to update at most every 2 seconds
 * - Only updates if position changed by more than ~50 meters
 * - Initial fit is always performed immediately
 * 
 * Behavior:
 * - Creates bounds from pickup and dropoff
 * - Extends bounds to include driver and rider if present
 * - Fits map with padding and max zoom limit
 */
function MapBoundsUpdater({
  pickupLocation,
  dropoffLocation,
  driverLocation,
  riderLocation,
}: {
  pickupLocation: Location;
  dropoffLocation: Location;
  driverLocation?: Location | null;
  riderLocation?: Location | null;
}) {
  const map = useMap();
  
  // Track previous positions for change detection
  const prevPickupRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevDropoffRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevDriverRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevRiderRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const hasInitialFitRef = useRef<boolean>(false);
  
  useEffect(() => {
    // Only refit when pickup or dropoff (the trip endpoints) change.
    // Driver/rider live positions update frequently and must NOT trigger refits,
    // otherwise the map zooms in/out repeatedly while the user is interacting.
    const pickupChange = getMaxPositionChange(pickupLocation, prevPickupRef.current);
    const dropoffChange = getMaxPositionChange(dropoffLocation, prevDropoffRef.current);
    const tripChanged = pickupChange > BOUNDS_UPDATE_THRESHOLD || dropoffChange > BOUNDS_UPDATE_THRESHOLD;

    if (!hasInitialFitRef.current || tripChanged) {
      const bounds = L.latLngBounds([
        [pickupLocation.lat, pickupLocation.lng],
        [dropoffLocation.lat, dropoffLocation.lng],
      ]);
      // Include driver/rider in the INITIAL fit only, then leave the viewport alone.
      if (driverLocation) bounds.extend([driverLocation.lat, driverLocation.lng]);
      if (riderLocation) bounds.extend([riderLocation.lat, riderLocation.lng]);

      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      hasInitialFitRef.current = true;
      lastUpdateTimeRef.current = Date.now();
    }

    prevPickupRef.current = { lat: pickupLocation.lat, lng: pickupLocation.lng };
    prevDropoffRef.current = { lat: dropoffLocation.lat, lng: dropoffLocation.lng };
    if (driverLocation) prevDriverRef.current = { lat: driverLocation.lat, lng: driverLocation.lng };
    if (riderLocation) prevRiderRef.current = { lat: riderLocation.lat, lng: riderLocation.lng };
  }, [map, pickupLocation.lat, pickupLocation.lng, dropoffLocation.lat, dropoffLocation.lng]);
  
  return null;
}

/**
 * Component for the animated driver marker.
 * 
 * Uses DriverMarkerController to smoothly animate position
 * and heading changes. The controller is created once and
 * updated on each prop change.
 * 
 * Animation Features:
 * - Smooth position interpolation with easing
 * - Heading rotation via shortest path
 * - Jitter filtering for stable rotation
 * - Vehicle color tinting
 */
function AnimatedDriverMarker({
  position,
  heading,
  vehicleColor,
}: {
  position: { lat: number; lng: number };
  heading: number | null;
  vehicleColor: string | null;
}) {
  const map = useMap();
  const controllerRef = useRef<DriverMarkerController | null>(null);
  
  // Create controller on mount
  useEffect(() => {
    const controller = new DriverMarkerController(
      map,
      carIconImage,
      position,
      heading,
      vehicleColor
    );
    controllerRef.current = controller;
    
    // Cleanup: destroy controller on unmount
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [map]); // Only recreate if map changes
  
  // Update controller when props change
  useEffect(() => {
    controllerRef.current?.update(position, heading, vehicleColor);
  }, [position.lat, position.lng, heading, vehicleColor]);
  
  return null;
}

// ============================================================
// Main Component
// ============================================================

/**
 * Main ride map component.
 * 
 * Renders an interactive map with:
 * - Pickup marker (blue dot)
 * - Dropoff marker (red pin)
 * - Driver marker (animated car with heading)
 * - Rider marker (cyan circle with user icon)
 * - Route polyline (cyan line following roads)
 * 
 * Features:
 * - Automatic day/night theme switching
 * - Route caching and debouncing
 * - Smooth driver marker animation
 * - Responsive bounds adjustment
 */
export function RideMap({
  pickupLocation,
  dropoffLocation,
  driverLocation,
  riderLocation,
  driverHeading,
  driverVehicleColor,
  showRoute = true,
  onEtaUpdate,
  onDistanceUpdate,
  className = '',
}: RideMapProps) {
  // ============================================================
  // Memoized Icons
  // Create icons once and reuse for performance
  // ============================================================
  
  const pickupIcon = useMemo(() => createStaticIcon('pickup'), []);
  const dropoffIcon = useMemo(() => createStaticIcon('dropoff'), []);
  const riderIcon = useMemo(() => createStaticIcon('rider'), []);
  
  // ============================================================
  // Route Fetching
  // ============================================================
  
  // Determine route start point (driver if available, else pickup)
  const routeStart = driverLocation || pickupLocation;
  
  // Fetch route data with caching and debouncing
  const {
    routeCoordinates,
    etaMinutes,
    distanceMiles,
  } = useRoute(
    showRoute ? { lat: routeStart.lat, lng: routeStart.lng } : null,
    showRoute ? { lat: dropoffLocation.lat, lng: dropoffLocation.lng } : null,
    { enabled: showRoute }
  );
  
  // ============================================================
  // Callback Notifications
  // ============================================================
  
  // Notify parent of ETA updates
  useEffect(() => {
    if (etaMinutes !== null && onEtaUpdate) {
      onEtaUpdate(etaMinutes);
    }
  }, [etaMinutes, onEtaUpdate]);
  
  // Notify parent of distance updates
  useEffect(() => {
    if (distanceMiles !== null && onDistanceUpdate) {
      onDistanceUpdate(distanceMiles);
    }
  }, [distanceMiles, onDistanceUpdate]);
  
  // ============================================================
  // Theme Detection
  // ============================================================
  
  // Detect day/night for map tile theme
  const isDark = useIsDarkMode(pickupLocation.lat, pickupLocation.lng);
  
  // ============================================================
  // Computed Values
  // ============================================================
  
  // Compute driver heading (from driverLocation or fallback prop)
  const heading = driverLocation?.heading ?? driverHeading ?? null;
  
  // Map center (pickup location)
  const center: [number, number] = [pickupLocation.lat, pickupLocation.lng];
  
  // ============================================================
  // Render
  // ============================================================
  
  return (
    <MapContainer
      center={center}
      zoom={12}
      className={`w-full h-full ${className}`}
      style={{ minHeight: '100px' }}
      data-testid="ride-map"
    >
      {/* Map Tiles */}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        key={isDark ? 'dark' : 'light'}
      />
      
      {/* Dark Mode Filter for Night-Time Viewing */}
      {isDark && (
        <style>{`
          .leaflet-tile-pane {
            filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9);
          }
        `}</style>
      )}
      
      {/* Automatic Bounds Adjustment */}
      <MapBoundsUpdater
        pickupLocation={pickupLocation}
        dropoffLocation={dropoffLocation}
        driverLocation={driverLocation}
        riderLocation={riderLocation}
      />
      
      {/* Route Polyline */}
      {routeCoordinates.length > 0 && (
        <Polyline
          positions={routeCoordinates}
          pathOptions={{
            color: '#0e7490',
            weight: 5,
            opacity: 0.85,
          }}
        />
      )}
      
      {/* Pickup Marker (Blue Dot) */}
      <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={pickupIcon}>
        <Popup>
          <strong>Pickup Location</strong>
        </Popup>
      </Marker>
      
      {/* Dropoff Marker (Red Pin) */}
      <Marker position={[dropoffLocation.lat, dropoffLocation.lng]} icon={dropoffIcon}>
        <Popup>
          <strong>Dropoff Location</strong>
        </Popup>
      </Marker>
      
      {/* Animated Driver Marker */}
      {driverLocation && (
        <AnimatedDriverMarker
          position={{ lat: driverLocation.lat, lng: driverLocation.lng }}
          heading={heading}
          vehicleColor={driverVehicleColor ?? null}
        />
      )}
      
      {/* Rider Marker */}
      {riderLocation && (
        <Marker position={[riderLocation.lat, riderLocation.lng]} icon={riderIcon}>
          <Popup>
            <strong>Rider Location</strong>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
