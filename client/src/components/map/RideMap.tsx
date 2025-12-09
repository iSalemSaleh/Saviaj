import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

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
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const driverMarker = useRef<mapboxgl.Marker | null>(null);
  const riderMarker = useRef<mapboxgl.Marker | null>(null);
  const pickupMarker = useRef<mapboxgl.Marker | null>(null);
  const dropoffMarker = useRef<mapboxgl.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/mapbox-token')
      .then(res => res.json())
      .then(data => {
        if (data.token) {
          setMapboxToken(data.token);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current || !mapboxToken) return;

    mapboxgl.accessToken = mapboxToken;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [pickupLocation.lng, pickupLocation.lat],
      zoom: 12,
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      setMapReady(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [mapboxToken, pickupLocation.lat, pickupLocation.lng]);

  const createMarkerElement = useCallback((type: 'driver' | 'rider' | 'pickup' | 'dropoff') => {
    const el = document.createElement('div');
    el.className = 'marker';
    
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
    
    el.style.cssText = `
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
      cursor: pointer;
    `;
    el.innerHTML = icons[type];
    
    return el;
  }, []);

  useEffect(() => {
    if (!map.current || !mapReady) return;

    if (!pickupMarker.current) {
      pickupMarker.current = new mapboxgl.Marker({
        element: createMarkerElement('pickup'),
      })
        .setLngLat([pickupLocation.lng, pickupLocation.lat])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Pickup Location</strong>'))
        .addTo(map.current);
    } else {
      pickupMarker.current.setLngLat([pickupLocation.lng, pickupLocation.lat]);
    }

    if (!dropoffMarker.current) {
      dropoffMarker.current = new mapboxgl.Marker({
        element: createMarkerElement('dropoff'),
      })
        .setLngLat([dropoffLocation.lng, dropoffLocation.lat])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Dropoff Location</strong>'))
        .addTo(map.current);
    } else {
      dropoffMarker.current.setLngLat([dropoffLocation.lng, dropoffLocation.lat]);
    }
  }, [pickupLocation, dropoffLocation, mapReady, createMarkerElement]);

  useEffect(() => {
    if (!map.current || !mapReady || !driverLocation) return;

    if (!driverMarker.current) {
      driverMarker.current = new mapboxgl.Marker({
        element: createMarkerElement('driver'),
      })
        .setLngLat([driverLocation.lng, driverLocation.lat])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Driver Location</strong>'))
        .addTo(map.current);
    } else {
      driverMarker.current.setLngLat([driverLocation.lng, driverLocation.lat]);
    }
  }, [driverLocation, mapReady, createMarkerElement]);

  useEffect(() => {
    if (!map.current || !mapReady || !riderLocation) return;

    if (!riderMarker.current) {
      riderMarker.current = new mapboxgl.Marker({
        element: createMarkerElement('rider'),
      })
        .setLngLat([riderLocation.lng, riderLocation.lat])
        .setPopup(new mapboxgl.Popup().setHTML('<strong>Rider Location</strong>'))
        .addTo(map.current);
    } else {
      riderMarker.current.setLngLat([riderLocation.lng, riderLocation.lat]);
    }
  }, [riderLocation, mapReady, createMarkerElement]);

  useEffect(() => {
    if (!map.current || !mapReady || !showRoute || !mapboxToken) return;

    const getRoute = async () => {
      const start = driverLocation || pickupLocation;
      const end = dropoffLocation;

      try {
        const response = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson&overview=full&access_token=${mapboxToken}`
        );
        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const routeGeometry = route.geometry;

          if (map.current?.getSource('route')) {
            (map.current.getSource('route') as mapboxgl.GeoJSONSource).setData({
              type: 'Feature',
              properties: {},
              geometry: routeGeometry,
            });
          } else if (map.current) {
            map.current.addLayer({
              id: 'route',
              type: 'line',
              source: {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  properties: {},
                  geometry: routeGeometry,
                },
              },
              layout: {
                'line-join': 'round',
                'line-cap': 'round',
              },
              paint: {
                'line-color': '#1a365d',
                'line-width': 5,
                'line-opacity': 0.75,
              },
            });
          }

          const durationMinutes = Math.round(route.duration / 60);
          const distanceMiles = (route.distance / 1609.34).toFixed(1);

          onEtaUpdate?.(durationMinutes);
          onDistanceUpdate?.(parseFloat(distanceMiles));
        }
      } catch (error) {
        console.error('Error fetching route:', error);
      }
    };

    getRoute();
  }, [pickupLocation, dropoffLocation, driverLocation, mapReady, showRoute, mapboxToken, onEtaUpdate, onDistanceUpdate]);

  useEffect(() => {
    if (!map.current || !mapReady) return;

    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([pickupLocation.lng, pickupLocation.lat]);
    bounds.extend([dropoffLocation.lng, dropoffLocation.lat]);
    
    if (driverLocation) {
      bounds.extend([driverLocation.lng, driverLocation.lat]);
    }
    if (riderLocation) {
      bounds.extend([riderLocation.lng, riderLocation.lat]);
    }

    map.current.fitBounds(bounds, {
      padding: 50,
      maxZoom: 15,
    });
  }, [pickupLocation, dropoffLocation, driverLocation, riderLocation, mapReady]);

  if (!mapboxToken) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <p className="text-gray-500">Loading map...</p>
      </div>
    );
  }

  return (
    <div ref={mapContainer} className={`w-full h-full ${className}`} data-testid="ride-map" />
  );
}
