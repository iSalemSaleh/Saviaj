/**
 * Route Fetching Hook
 * 
 * This hook handles fetching route data from the Azure Maps API.
 * It provides route geometry, ETA, and distance information with
 * proper caching and cleanup.
 * 
 * @module useRoute
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Geographic position with latitude and longitude.
 */
interface Position {
  lat: number;
  lng: number;
}

/**
 * Route data returned from the Azure Maps API.
 */
interface RouteData {
  /**
   * Array of coordinates forming the route polyline.
   * Each coordinate is [latitude, longitude].
   */
  coordinates: [number, number][];
  
  /**
   * Estimated time of arrival in minutes.
   */
  etaMinutes: number;
  
  /**
   * Route distance in miles.
   */
  distanceMiles: number;
}

/**
 * Return type of the useRoute hook.
 */
interface UseRouteResult {
  /**
   * Route coordinates for drawing on the map.
   * Empty array if no route is available.
   */
  routeCoordinates: [number, number][];
  
  /**
   * Estimated time of arrival in minutes.
   * Null if not yet calculated.
   */
  etaMinutes: number | null;
  
  /**
   * Distance in miles.
   * Null if not yet calculated.
   */
  distanceMiles: number | null;
  
  /**
   * Whether a route fetch is currently in progress.
   */
  isLoading: boolean;
  
  /**
   * Error message if the last fetch failed.
   * Null if no error.
   */
  error: string | null;
  
  /**
   * Manually trigger a route refresh.
   */
  refetch: () => void;
}

/**
 * Configuration for route fetching behavior.
 */
interface UseRouteOptions {
  /**
   * Whether to enable automatic route fetching.
   * Set to false to disable fetching until manually triggered.
   * @default true
   */
  enabled?: boolean;
  
  /**
   * Minimum time (ms) between route fetches to prevent excessive API calls.
   * @default 5000
   */
  debounceMs?: number;
}

/**
 * Creates a cache key from start and end positions.
 * 
 * Rounds coordinates to 5 decimal places (~1 meter precision)
 * to allow cache hits for nearby positions.
 * 
 * @param start - Starting position
 * @param end - Ending position
 * @returns Cache key string
 */
function createCacheKey(start: Position, end: Position): string {
  const round = (n: number) => n.toFixed(5);
  return `${round(start.lat)},${round(start.lng)}-${round(end.lat)},${round(end.lng)}`;
}

/**
 * Simple in-memory cache for route data.
 * Prevents redundant API calls for the same route.
 */
const routeCache = new Map<string, RouteData>();

/**
 * Maximum number of cached routes (LRU eviction).
 */
const MAX_CACHE_SIZE = 50;

/**
 * Adds a route to the cache with LRU eviction.
 * 
 * @param key - Cache key
 * @param data - Route data to cache
 */
function cacheRoute(key: string, data: RouteData): void {
  // Evict oldest entry if cache is full
  if (routeCache.size >= MAX_CACHE_SIZE) {
    const firstKey = routeCache.keys().next().value;
    if (firstKey) routeCache.delete(firstKey);
  }
  routeCache.set(key, data);
}

/**
 * React hook for fetching and managing route data.
 * 
 * Features:
 * - Automatic fetching when positions change
 * - In-memory caching to reduce API calls
 * - Debouncing to prevent rapid successive fetches
 * - AbortController for cleanup of pending requests
 * - Error handling with retry capability
 * 
 * @param startPosition - Starting point of the route
 * @param endPosition - Ending point of the route
 * @param options - Configuration options
 * @returns Route data, loading state, and refetch function
 * 
 * @example
 * function MapComponent({ pickup, dropoff }) {
 *   const { routeCoordinates, etaMinutes, isLoading } = useRoute(
 *     { lat: pickup.lat, lng: pickup.lng },
 *     { lat: dropoff.lat, lng: dropoff.lng }
 *   );
 *   
 *   return (
 *     <MapContainer>
 *       {!isLoading && routeCoordinates.length > 0 && (
 *         <Polyline positions={routeCoordinates} />
 *       )}
 *       {etaMinutes && <div>ETA: {etaMinutes} minutes</div>}
 *     </MapContainer>
 *   );
 * }
 */
export function useRoute(
  startPosition: Position | null,
  endPosition: Position | null,
  options: UseRouteOptions = {}
): UseRouteResult {
  const { enabled = true, debounceMs = 5000 } = options;
  
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [distanceMiles, setDistanceMiles] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Refs for debouncing and abort handling
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastFetchTimeRef = useRef<number>(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  /**
   * Fetches route data from the API.
   * 
   * @param start - Starting position
   * @param end - Ending position
   * @param signal - AbortSignal for cancellation
   */
  const fetchRoute = useCallback(async (
    start: Position,
    end: Position,
    signal: AbortSignal
  ): Promise<void> => {
    // Check cache first
    const cacheKey = createCacheKey(start, end);
    const cached = routeCache.get(cacheKey);
    
    if (cached) {
      setRouteCoordinates(cached.coordinates);
      setEtaMinutes(cached.etaMinutes);
      setDistanceMiles(cached.distanceMiles);
      setError(null);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/azure-maps/route?startLat=${start.lat}&startLon=${start.lng}&endLat=${end.lat}&endLon=${end.lng}`,
        { signal }
      );
      
      if (!response.ok) {
        throw new Error(`Route fetch failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.route) {
        // Parse route geometry
        const coordinates: [number, number][] = data.route.geometry.map(
          (p: { lat: number; lon: number }) => [p.lat, p.lon]
        );
        
        // Calculate ETA and distance
        const eta = Math.round(data.route.durationInSeconds / 60);
        const distance = parseFloat((data.route.distanceInMeters / 1609.34).toFixed(1));
        
        // Update state
        setRouteCoordinates(coordinates);
        setEtaMinutes(eta);
        setDistanceMiles(distance);
        
        // Cache the result
        cacheRoute(cacheKey, {
          coordinates,
          etaMinutes: eta,
          distanceMiles: distance,
        });
      }
    } catch (err) {
      // Ignore abort errors (expected during cleanup)
      if ((err as Error).name === 'AbortError') {
        return;
      }
      
      console.error('Error fetching route:', err);
      setError((err as Error).message || 'Failed to fetch route');
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Triggers a route fetch with debouncing.
   */
  const triggerFetch = useCallback(() => {
    if (!enabled || !startPosition || !endPosition) {
      return;
    }
    
    // Cancel any pending debounce
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Check if we need to debounce
    const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current;
    
    if (timeSinceLastFetch < debounceMs) {
      // Schedule fetch after debounce period
      debounceTimeoutRef.current = setTimeout(() => {
        performFetch();
      }, debounceMs - timeSinceLastFetch);
    } else {
      performFetch();
    }
    
    function performFetch() {
      lastFetchTimeRef.current = Date.now();
      abortControllerRef.current = new AbortController();
      fetchRoute(startPosition!, endPosition!, abortControllerRef.current.signal);
    }
  }, [enabled, startPosition, endPosition, debounceMs, fetchRoute]);
  
  // Trigger fetch when positions change
  useEffect(() => {
    triggerFetch();
    
    // Cleanup on unmount or position change
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [triggerFetch]);
  
  return {
    routeCoordinates,
    etaMinutes,
    distanceMiles,
    isLoading,
    error,
    refetch: triggerFetch,
  };
}
