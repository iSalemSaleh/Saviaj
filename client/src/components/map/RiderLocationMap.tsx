import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Star, Navigation, Car } from 'lucide-react';

interface Location {
  lat: number;
  lng: number;
}

interface NearbyDriver {
  id: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  driverRating: string | null;
  totalRatingsAsDriver: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  ratePerMile: string | null;
  distanceFromPickup: number;
  currentLat: string | null;
  currentLng: string | null;
}

interface RiderLocationMapProps {
  userLocation: Location | null;
  destination?: Location | null;
  nearbyDrivers?: NearbyDriver[];
  showRoute?: boolean;
  onRouteInfo?: (distance: number, duration: number) => void;
  className?: string;
  onDriverClick?: (driver: NearbyDriver) => void;
}

const createDriverIcon = () => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 32px;
      height: 32px;
      background-color: #22c55e;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      border: 2px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">🚗</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

const createDestinationIcon = () => {
  return L.divIcon({
    className: 'destination-marker',
    html: `<div style="
      display: flex;
      flex-direction: column;
      align-items: center;
    ">
      <svg width="24" height="36" viewBox="0 0 24 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.372 0 0 5.372 0 12c0 9 12 24 12 24s12-15 12-24c0-6.628-5.372-12-12-12z" fill="#ef4444"/>
        <circle cx="12" cy="12" r="5" fill="white"/>
      </svg>
    </div>`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
  });
};

const pulsingCircleStyles = `
  @keyframes pulse {
    0% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.5);
      opacity: 0.4;
    }
    100% {
      transform: scale(1);
      opacity: 0.8;
    }
  }
  .pulsing-circle {
    width: 16px;
    height: 16px;
    background-color: #3b82f6;
    border-radius: 50%;
    border: 3px solid white;
    box-shadow: 0 0 0 rgba(59, 130, 246, 0.5);
    position: relative;
  }
  .pulsing-circle::before {
    content: '';
    position: absolute;
    top: -6px;
    left: -6px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: rgba(59, 130, 246, 0.3);
    animation: pulse 2s ease-in-out infinite;
  }
`;

const createUserLocationIcon = () => {
  return L.divIcon({
    className: 'user-location-marker',
    html: `
      <style>${pulsingCircleStyles}</style>
      <div class="pulsing-circle"></div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

function MapUpdater({ 
  userLocation, 
  destination,
  nearbyDrivers,
}: {
  userLocation: Location | null;
  destination?: Location | null;
  nearbyDrivers?: NearbyDriver[];
}) {
  const map = useMap();

  useEffect(() => {
    if (!userLocation) return;

    const bounds = L.latLngBounds([[userLocation.lat, userLocation.lng]]);
    
    if (destination) {
      bounds.extend([destination.lat, destination.lng]);
    }
    
    nearbyDrivers?.forEach(driver => {
      if (driver.currentLat && driver.currentLng) {
        bounds.extend([parseFloat(driver.currentLat), parseFloat(driver.currentLng)]);
      }
    });

    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }, [map, userLocation, destination, nearbyDrivers]);

  return null;
}

export function RiderLocationMap({
  userLocation,
  destination,
  nearbyDrivers = [],
  showRoute = true,
  onRouteInfo,
  className = "",
  onDriverClick,
}: RiderLocationMapProps) {
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  const userIcon = useMemo(() => createUserLocationIcon(), []);
  const driverIcon = useMemo(() => createDriverIcon(), []);
  const destinationIcon = useMemo(() => createDestinationIcon(), []);

  const fetchRoute = useCallback(async () => {
    if (!showRoute || !userLocation || !destination) {
      setRouteCoordinates([]);
      return;
    }

    try {
      const response = await fetch(
        `/api/azure-maps/route?startLat=${userLocation.lat}&startLon=${userLocation.lng}&endLat=${destination.lat}&endLon=${destination.lng}`
      );
      const data = await response.json();

      if (data.route) {
        const coordinates: [number, number][] = data.route.geometry.map(
          (p: { lat: number; lon: number }) => [p.lat, p.lon]
        );
        setRouteCoordinates(coordinates);

        const durationMinutes = Math.round(data.route.durationInSeconds / 60);
        const distanceMiles = parseFloat((data.route.distanceInMeters / 1609.34).toFixed(1));

        onRouteInfo?.(distanceMiles, durationMinutes);
      }
    } catch (error) {
      console.error('Error fetching route:', error);
    }
  }, [userLocation, destination, showRoute, onRouteInfo]);

  useEffect(() => {
    fetchRoute();
  }, [fetchRoute]);

  if (!userLocation) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-muted rounded-lg ${className}`}>
        <div className="text-center text-muted-foreground">
          <Navigation className="h-8 w-8 mx-auto mb-2 animate-pulse" />
          <p>Getting your location...</p>
        </div>
      </div>
    );
  }

  const center: [number, number] = [userLocation.lat, userLocation.lng];

  return (
    <MapContainer
      center={center}
      zoom={13}
      className={`w-full h-full rounded-lg ${className}`}
      style={{ minHeight: '300px' }}
      data-testid="rider-location-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      
      <MapUpdater
        userLocation={userLocation}
        destination={destination}
        nearbyDrivers={nearbyDrivers}
      />

      <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
        <Popup>
          <strong>Your Location</strong>
        </Popup>
      </Marker>

      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={destinationIcon}>
          <Popup>
            <strong>Destination</strong>
          </Popup>
        </Marker>
      )}

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

      {nearbyDrivers.map((driver) => {
        if (!driver.currentLat || !driver.currentLng) return null;
        
        return (
          <Marker
            key={driver.id}
            position={[parseFloat(driver.currentLat), parseFloat(driver.currentLng)]}
            icon={driverIcon}
            eventHandlers={{
              click: () => onDriverClick?.(driver),
            }}
          >
            <Popup>
              <div className="text-sm min-w-[150px]">
                <div className="font-semibold flex items-center gap-1">
                  <Car className="h-4 w-4" />
                  {driver.firstName} {driver.lastName?.charAt(0)}.
                </div>
                {driver.vehicleMake && driver.vehicleModel && (
                  <div className="text-muted-foreground text-xs">
                    {driver.vehicleColor} {driver.vehicleMake} {driver.vehicleModel}
                  </div>
                )}
                {driver.driverRating && (
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    {parseFloat(driver.driverRating).toFixed(1)}
                    {driver.totalRatingsAsDriver && (
                      <span className="text-muted-foreground">
                        ({driver.totalRatingsAsDriver})
                      </span>
                    )}
                  </div>
                )}
                {driver.ratePerMile && (
                  <div className="font-medium text-green-600 mt-1">
                    £{parseFloat(driver.ratePerMile).toFixed(2)}/mile
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {driver.distanceFromPickup.toFixed(1)} miles away
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
