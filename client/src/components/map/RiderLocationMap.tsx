import { useEffect, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Star, Navigation, Car } from 'lucide-react';
import carIconImage from '../../assets/car-icon.png';

// Convert vehicle color name to CSS hue-rotate value
// The base car image has cyan/teal color (~180deg hue)
function getColorFilter(vehicleColor: string | null): string {
  if (!vehicleColor) return '';
  
  const color = vehicleColor.toLowerCase().trim();
  
  // Map common color names to hue rotation degrees
  // Base image is cyan (~180deg), so we calculate rotation from there
  const colorToHue: Record<string, number> = {
    'red': -180,        // 0deg
    'orange': -150,     // 30deg
    'yellow': -120,     // 60deg
    'lime': -90,        // 90deg
    'green': -60,       // 120deg
    'teal': 0,          // 180deg (base)
    'cyan': 0,          // 180deg (base)
    'blue': 60,         // 240deg
    'purple': 90,       // 270deg
    'magenta': 120,     // 300deg
    'pink': 150,        // 330deg
    'black': 0,         // Use grayscale
    'white': 0,         // Use brightness
    'gray': 0,          // Use grayscale
    'grey': 0,          // Use grayscale
    'silver': 0,        // Use grayscale
    'gold': -130,       // ~50deg
    'brown': -160,      // ~20deg
    'maroon': -175,     // ~5deg
    'navy': 60,         // Same as blue
    'olive': -100,      // ~80deg
    'aqua': 0,          // Same as cyan
    'turquoise': 10,    // ~190deg
    'indigo': 75,       // ~255deg
    'violet': 100,      // ~280deg
    'coral': -165,      // ~15deg
    'salmon': -155,     // ~25deg
    'beige': -120,      // ~60deg with low saturation
  };
  
  const hueRotation = colorToHue[color];
  
  if (hueRotation !== undefined) {
    // Special handling for grayscale colors
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
  
  // Try to parse hex colors
  if (color.startsWith('#')) {
    // Convert hex to HSL and calculate hue rotation
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    
    if (max !== min) {
      const d = max - min;
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    
    const targetHue = h * 360;
    const rotation = targetHue - 180; // 180 is cyan
    return `hue-rotate(${rotation}deg)`;
  }
  
  return '';
}

// Calculate sunrise/sunset times based on location and date
// Uses simplified algorithm for approximate times
function getSunTimes(lat: number, lng: number, date: Date): { sunrise: Date; sunset: Date } {
  const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
  
  // Fractional year in radians
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (12 - 12) / 24);
  
  // Equation of time in minutes
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  
  // Solar declination in radians
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  
  // Hour angle for sunrise/sunset
  const latRad = lat * Math.PI / 180;
  const zenith = 90.833 * Math.PI / 180;
  
  let ha = Math.acos(Math.cos(zenith) / (Math.cos(latRad) * Math.cos(decl)) - Math.tan(latRad) * Math.tan(decl));
  ha = ha * 180 / Math.PI; // Convert to degrees
  
  // Calculate sunrise and sunset in minutes from midnight UTC
  const sunriseMin = 720 - 4 * (lng + ha) - eqtime;
  const sunsetMin = 720 - 4 * (lng - ha) - eqtime;
  
  // Convert to local Date objects
  const sunrise = new Date(date);
  sunrise.setUTCHours(0, 0, 0, 0);
  sunrise.setUTCMinutes(sunriseMin);
  
  const sunset = new Date(date);
  sunset.setUTCHours(0, 0, 0, 0);
  sunset.setUTCMinutes(sunsetMin);
  
  return { sunrise, sunset };
}

function useIsDarkMode(lat: number | null, lng: number | null): boolean {
  const [isDark, setIsDark] = useState(false);
  
  useEffect(() => {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return;
    
    const checkDarkMode = () => {
      const now = new Date();
      const { sunrise, sunset } = getSunTimes(lat, lng, now);
      
      // It's dark before sunrise or after sunset
      const isNight = now < sunrise || now > sunset;
      setIsDark(isNight);
    };
    
    checkDarkMode();
    // Check every minute
    const interval = setInterval(checkDarkMode, 60000);
    
    return () => clearInterval(interval);
  }, [lat, lng]);
  
  return isDark;
}

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
  tier1MaxMiles: string | null;
  tier1RatePerMile: string | null;
  tier2MaxMiles: string | null;
  tier2RatePerMile: string | null;
  tier3RatePerMile: string | null;
  baseMinimumFare: string | null;
  serviceCategories: string[] | null;
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
  fullScreen?: boolean;
  centerTrigger?: number; // Increment to recenter map on user location
}

const createDriverIcon = (vehicleColor: string | null = null) => {
  const colorFilter = getColorFilter(vehicleColor);
  return L.divIcon({
    className: 'custom-car-marker',
    html: `<div style="
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.4));
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
    iconSize: [48, 48],
    iconAnchor: [24, 24],
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
  centerTrigger,
}: {
  userLocation: Location | null;
  destination?: Location | null;
  nearbyDrivers?: NearbyDriver[];
  centerTrigger?: number;
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

  // Recenter on user location when centerTrigger changes
  useEffect(() => {
    if (centerTrigger && centerTrigger > 0 && userLocation) {
      map.flyTo([userLocation.lat, userLocation.lng], 15, { duration: 0.5 });
    }
  }, [map, centerTrigger, userLocation]);

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
  fullScreen = false,
  centerTrigger = 0,
}: RiderLocationMapProps) {
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

  const userIcon = useMemo(() => createUserLocationIcon(), []);
  const destinationIcon = useMemo(() => createDestinationIcon(), []);
  
  // Create icons for each driver based on their vehicle color
  const driverIcons = useMemo(() => {
    const icons: Record<string, L.DivIcon> = {};
    nearbyDrivers.forEach(driver => {
      icons[driver.id] = createDriverIcon(driver.vehicleColor);
    });
    return icons;
  }, [nearbyDrivers]);
  
  // Check if it's dark based on sunrise/sunset at user's location
  const isDark = useIsDarkMode(userLocation?.lat ?? null, userLocation?.lng ?? null);

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
      <div className={`w-full h-full flex items-center justify-center bg-muted ${fullScreen ? '' : 'rounded-lg'} ${className}`}>
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
      className={`w-full h-full ${fullScreen ? '' : 'rounded-lg'} ${className}`}
      style={{ minHeight: fullScreen ? '100vh' : '150px', height: fullScreen ? '100vh' : undefined }}
      data-testid="rider-location-map"
      zoomControl={!fullScreen}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        className={isDark ? 'dark-map-tiles' : ''}
        key={isDark ? 'dark' : 'light'}
      />
      {isDark && (
        <style>{`
          .leaflet-tile-pane {
            filter: invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9);
          }
        `}</style>
      )}
      
      <MapUpdater
        userLocation={userLocation}
        destination={destination}
        nearbyDrivers={nearbyDrivers}
        centerTrigger={centerTrigger}
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
            color: '#0e7490',
            weight: 5,
            opacity: 0.85,
          }}
        />
      )}

      {nearbyDrivers.map((driver) => {
        if (!driver.currentLat || !driver.currentLng) return null;
        
        return (
          <Marker
            key={driver.id}
            position={[parseFloat(driver.currentLat), parseFloat(driver.currentLng)]}
            icon={driverIcons[driver.id] || createDriverIcon(null)}
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
                {(driver.ratePerMile || driver.tier1RatePerMile) && (
                  <div className="font-medium text-green-600 mt-1">
                    {driver.tier1RatePerMile && parseFloat(driver.tier1RatePerMile) > 0
                      ? (() => {
                          const t2 = parseFloat(driver.tier2RatePerMile || "0");
                          const t3 = parseFloat(driver.tier3RatePerMile || "0");
                          const lowest = t3 || t2 || parseFloat(driver.tier1RatePerMile);
                          return `from £${lowest.toFixed(2)}/mile`;
                        })()
                      : `£${parseFloat(driver.ratePerMile!).toFixed(2)}/mile`}
                    {driver.baseMinimumFare && parseFloat(driver.baseMinimumFare) > 0 && (
                      <span className="text-[10px] text-muted-foreground ml-1">(min £{parseFloat(driver.baseMinimumFare).toFixed(2)})</span>
                    )}
                  </div>
                )}
                {driver.serviceCategories && driver.serviceCategories.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 mt-1">
                    {driver.serviceCategories.map((cat) => (
                      <span key={cat} className="text-[9px] px-1 py-0.5 bg-primary/10 text-primary rounded capitalize">
                        {cat}
                      </span>
                    ))}
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
