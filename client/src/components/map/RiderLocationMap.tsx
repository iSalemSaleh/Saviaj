import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, Circle } from 'react-leaflet';
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

const createIcon = (type: 'user' | 'driver' | 'destination') => {
  const colors: Record<string, string> = {
    user: '#0891b2',
    driver: '#22c55e',
    destination: '#ef4444',
  };
  
  const icons: Record<string, string> = {
    user: '📍',
    driver: '🚗',
    destination: '🏁',
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

  const userIcon = useMemo(() => createIcon('user'), []);
  const driverIcon = useMemo(() => createIcon('driver'), []);
  const destinationIcon = useMemo(() => createIcon('destination'), []);

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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      
      <MapUpdater
        userLocation={userLocation}
        destination={destination}
        nearbyDrivers={nearbyDrivers}
      />

      <Circle
        center={[userLocation.lat, userLocation.lng]}
        radius={50}
        pathOptions={{
          color: '#0891b2',
          fillColor: '#0891b2',
          fillOpacity: 0.2,
        }}
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
