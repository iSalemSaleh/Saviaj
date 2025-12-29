import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import carIconImage from '../../assets/car-icon.png';

// Convert vehicle color name to CSS hue-rotate value
// The base car image has cyan/teal color (~180deg hue)
function getColorFilter(vehicleColor: string | null): string {
  if (!vehicleColor) return '';
  
  const color = vehicleColor.toLowerCase().trim();
  
  const colorToHue: Record<string, number> = {
    'red': -180, 'orange': -150, 'yellow': -120, 'lime': -90, 'green': -60,
    'teal': 0, 'cyan': 0, 'blue': 60, 'purple': 90, 'magenta': 120, 'pink': 150,
    'black': 0, 'white': 0, 'gray': 0, 'grey': 0, 'silver': 0, 'gold': -130,
    'brown': -160, 'maroon': -175, 'navy': 60, 'olive': -100, 'aqua': 0,
    'turquoise': 10, 'indigo': 75, 'violet': 100, 'coral': -165, 'salmon': -155, 'beige': -120,
  };
  
  const hueRotation = colorToHue[color];
  
  if (hueRotation !== undefined) {
    if (color === 'black') return 'brightness(0.1) saturate(0)';
    if (color === 'white' || color === 'silver') return 'brightness(1.5) saturate(0.3)';
    if (color === 'gray' || color === 'grey') return 'saturate(0)';
    return `hue-rotate(${hueRotation}deg)`;
  }
  
  return '';
}

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
  driverVehicleColor?: string | null;
  showRoute?: boolean;
  onEtaUpdate?: (eta: number) => void;
  onDistanceUpdate?: (distance: number) => void;
  className?: string;
}

const createIcon = (type: 'rider' | 'pickup' | 'dropoff') => {
  if (type === 'pickup') {
    // Blue dot for pickup - simple solid circle
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 16px;
        height: 16px;
        background-color: #0ea5e9;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }
  
  if (type === 'dropoff') {
    // Location pin for dropoff - peacock blue pin shape
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 32px;
        height: 40px;
        display: flex;
        flex-direction: column;
        align-items: center;
      ">
        <div style="
          width: 24px;
          height: 24px;
          background: linear-gradient(135deg, #0891b2, #0e7490);
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        ">
          <div style="
            width: 8px;
            height: 8px;
            background: white;
            border-radius: 50%;
            transform: rotate(45deg);
          "></div>
        </div>
      </div>`,
      iconSize: [32, 40],
      iconAnchor: [16, 40],
    });
  }
  
  // Rider icon - cyan circle with user icon
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 32px;
      height: 32px;
      background-color: #0891b2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      border: 2px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">👤</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const createDriverCarIcon = (vehicleColor: string | null = null) => {
  const colorFilter = getColorFilter(vehicleColor);
  return L.divIcon({
    className: 'custom-car-marker',
    html: `<div style="
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 3px 8px rgba(0,0,0,0.5));
    ">
      <img 
        src="${carIconImage}" 
        alt="Driver" 
        style="
          width: 100%;
          height: 100%;
          object-fit: contain;
          ${colorFilter ? `filter: ${colorFilter};` : ''}
        "
      />
    </div>`,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
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
  driverVehicleColor,
  showRoute = true,
  onEtaUpdate,
  onDistanceUpdate,
  className = "",
}: RideMapProps) {
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  const pickupIcon = useMemo(() => createIcon('pickup'), []);
  const dropoffIcon = useMemo(() => createIcon('dropoff'), []);
  const driverIcon = useMemo(() => createDriverCarIcon(driverVehicleColor), [driverVehicleColor]);
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
            color: '#0e7490',
            weight: 5,
            opacity: 0.85,
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
