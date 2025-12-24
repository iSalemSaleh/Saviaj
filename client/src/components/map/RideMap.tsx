import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Check if system prefers dark mode
function useSystemDarkMode(): boolean {
  const [isDark, setIsDark] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDark(mediaQuery.matches);
    
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  return isDark;
}

interface Location {
  lat: number;
  lng: number;
}

interface RideMapProps {
  pickupLocation: Location;
  dropoffLocation: Location;
  driverLocation?: Location | null;
  riderLocation?: Location | null;
  showRoute?: boolean;
  onEtaUpdate?: (eta: number) => void;
  onDistanceUpdate?: (distance: number) => void;
  className?: string;
}

const createIcon = (type: 'driver' | 'rider' | 'pickup' | 'dropoff') => {
  const colors: Record<string, string> = {
    driver: '#1a365d',
    rider: '#0891b2',
    pickup: '#22c55e',
    dropoff: '#ef4444',
  };
  
  const icons: Record<string, string> = {
    driver: '🚗',
    rider: '👤',
    pickup: '📍',
    dropoff: '🏁',
  };

  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 40px;
      height: 40px;
      background-color: ${colors[type]};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      border: 3px solid white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    ">${icons[type]}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
};

function MapBoundsUpdater({ 
  pickupLocation, 
  dropoffLocation, 
  driverLocation, 
  riderLocation 
}: {
  pickupLocation: Location;
  dropoffLocation: Location;
  driverLocation?: Location | null;
  riderLocation?: Location | null;
}) {
  const map = useMap();

  useEffect(() => {
    const bounds = L.latLngBounds([
      [pickupLocation.lat, pickupLocation.lng],
      [dropoffLocation.lat, dropoffLocation.lng],
    ]);
    
    if (driverLocation) {
      bounds.extend([driverLocation.lat, driverLocation.lng]);
    }
    if (riderLocation) {
      bounds.extend([riderLocation.lat, riderLocation.lng]);
    }

    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [map, pickupLocation, dropoffLocation, driverLocation, riderLocation]);

  return null;
}

export function RideMap({
  pickupLocation,
  dropoffLocation,
  driverLocation,
  riderLocation,
  showRoute = true,
  onEtaUpdate,
  onDistanceUpdate,
  className = "",
}: RideMapProps) {
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  const pickupIcon = useMemo(() => createIcon('pickup'), []);
  const dropoffIcon = useMemo(() => createIcon('dropoff'), []);
  const driverIcon = useMemo(() => createIcon('driver'), []);
  const riderIcon = useMemo(() => createIcon('rider'), []);

  const fetchRoute = useCallback(async () => {
    if (!showRoute) return;

    const start = driverLocation || pickupLocation;
    const end = dropoffLocation;

    try {
      const response = await fetch(
        `/api/azure-maps/route?startLat=${start.lat}&startLon=${start.lng}&endLat=${end.lat}&endLon=${end.lng}`
      );
      const data = await response.json();

      if (data.route) {
        const coordinates: [number, number][] = data.route.geometry.map(
          (p: { lat: number; lon: number }) => [p.lat, p.lon]
        );
        setRouteCoordinates(coordinates);

        const durationMinutes = Math.round(data.route.durationInSeconds / 60);
        const distanceMiles = (data.route.distanceInMeters / 1609.34).toFixed(1);

        onEtaUpdate?.(durationMinutes);
        onDistanceUpdate?.(parseFloat(distanceMiles));
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    }
  }, [pickupLocation, dropoffLocation, driverLocation, showRoute, onEtaUpdate, onDistanceUpdate]);

  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  const center: [number, number] = [pickupLocation.lat, pickupLocation.lng];

  const isDark = useSystemDarkMode();
  
  return (
    <MapContainer
      center={center}
      zoom={12}
      className={`w-full h-full ${className}`}
      style={{ minHeight: '400px' }}
      data-testid="ride-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        key={isDark ? 'dark' : 'light'}
      />
      {isDark && (
        <style>{`
          .leaflet-tile-pane {
            filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9);
          }
        `}</style>
      )}
      
      <MapBoundsUpdater
        pickupLocation={pickupLocation}
        dropoffLocation={dropoffLocation}
        driverLocation={driverLocation}
        riderLocation={riderLocation}
      />

      {routeCoordinates.length > 0 && (
        <Polyline
          positions={routeCoordinates}
          pathOptions={{
            color: '#1a365d',
            weight: 5,
            opacity: 0.75,
          }}
        />
      )}

      <Marker position={[pickupLocation.lat, pickupLocation.lng]} icon={pickupIcon}>
        <Popup>
          <strong>Pickup Location</strong>
        </Popup>
      </Marker>

      <Marker position={[dropoffLocation.lat, dropoffLocation.lng]} icon={dropoffIcon}>
        <Popup>
          <strong>Dropoff Location</strong>
        </Popup>
      </Marker>

      {driverLocation && (
        <Marker position={[driverLocation.lat, driverLocation.lng]} icon={driverIcon}>
          <Popup>
            <strong>Driver Location</strong>
          </Popup>
        </Marker>
      )}

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
