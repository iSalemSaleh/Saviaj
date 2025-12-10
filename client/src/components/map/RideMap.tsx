import { useEffect, useRef, useState, useCallback } from 'react';
import * as atlas from 'azure-maps-control';
import 'azure-maps-control/dist/atlas.min.css';

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
  const map = useRef<atlas.Map | null>(null);
  const dataSource = useRef<atlas.source.DataSource | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [azureKey, setAzureKey] = useState<string | null>(null);
  const markersRef = useRef<{ [key: string]: atlas.HtmlMarker }>({});

  useEffect(() => {
    fetch('/api/azure-maps/key')
      .then(res => res.json())
      .then(data => {
        if (data.key) {
          setAzureKey(data.key);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!mapContainer.current || map.current || !azureKey) return;

    map.current = new atlas.Map(mapContainer.current, {
      center: [pickupLocation.lng, pickupLocation.lat],
      zoom: 12,
      language: 'en-GB',
      authOptions: {
        authType: atlas.AuthenticationType.subscriptionKey,
        subscriptionKey: azureKey,
      },
      style: 'road',
    });

    map.current.controls.add([
      new atlas.control.ZoomControl(),
      new atlas.control.CompassControl(),
    ], {
      position: atlas.ControlPosition.TopRight,
    });

    map.current.events.add('ready', () => {
      if (!map.current) return;
      
      dataSource.current = new atlas.source.DataSource();
      map.current.sources.add(dataSource.current);

      map.current.layers.add(new atlas.layer.LineLayer(dataSource.current, undefined, {
        strokeColor: '#1a365d',
        strokeWidth: 5,
        lineJoin: 'round',
        lineCap: 'round',
      }));

      setMapReady(true);
    });

    return () => {
      if (map.current) {
        Object.values(markersRef.current).forEach(marker => {
          map.current?.markers.remove(marker);
        });
      }
      markersRef.current = {};
      map.current?.dispose();
      map.current = null;
    };
  }, [azureKey, pickupLocation.lat, pickupLocation.lng]);

  const createMarkerHtml = useCallback((type: 'driver' | 'rider' | 'pickup' | 'dropoff') => {
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
    
    return `<div style="
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
    ">${icons[type]}</div>`;
  }, []);

  const updateMarker = useCallback((type: string, lat: number, lng: number) => {
    if (!map.current || !mapReady) return;

    if (markersRef.current[type]) {
      markersRef.current[type].setOptions({
        position: [lng, lat],
      });
    } else {
      const marker = new atlas.HtmlMarker({
        position: [lng, lat],
        htmlContent: createMarkerHtml(type as any),
      });
      map.current.markers.add(marker);
      markersRef.current[type] = marker;
    }
  }, [mapReady, createMarkerHtml]);

  useEffect(() => {
    if (!mapReady) return;
    updateMarker('pickup', pickupLocation.lat, pickupLocation.lng);
    updateMarker('dropoff', dropoffLocation.lat, dropoffLocation.lng);
  }, [pickupLocation, dropoffLocation, mapReady, updateMarker]);

  useEffect(() => {
    if (!mapReady || !driverLocation) return;
    updateMarker('driver', driverLocation.lat, driverLocation.lng);
  }, [driverLocation, mapReady, updateMarker]);

  useEffect(() => {
    if (!mapReady || !riderLocation) return;
    updateMarker('rider', riderLocation.lat, riderLocation.lng);
  }, [riderLocation, mapReady, updateMarker]);

  useEffect(() => {
    if (!map.current || !mapReady || !showRoute || !dataSource.current) return;

    const getRoute = async () => {
      const start = driverLocation || pickupLocation;
      const end = dropoffLocation;

      try {
        const response = await fetch(
          `/api/azure-maps/route?startLat=${start.lat}&startLon=${start.lng}&endLat=${end.lat}&endLon=${end.lng}`
        );
        const data = await response.json();

        if (data.route) {
          const coordinates = data.route.geometry.map((p: any) => [p.lon, p.lat]);
          
          dataSource.current?.clear();
          dataSource.current?.add(new atlas.data.Feature(
            new atlas.data.LineString(coordinates)
          ));

          const durationMinutes = Math.round(data.route.durationInSeconds / 60);
          const distanceMiles = (data.route.distanceInMeters / 1609.34).toFixed(1);

          onEtaUpdate?.(durationMinutes);
          onDistanceUpdate?.(parseFloat(distanceMiles));
        }
      } catch (error) {
        console.error('Error fetching route:', error);
      }
    };

    getRoute();
  }, [pickupLocation, dropoffLocation, driverLocation, mapReady, showRoute, onEtaUpdate, onDistanceUpdate]);

  useEffect(() => {
    if (!map.current || !mapReady) return;

    const bounds = new atlas.data.BoundingBox(
      [Math.min(pickupLocation.lng, dropoffLocation.lng), Math.min(pickupLocation.lat, dropoffLocation.lat)],
      [Math.max(pickupLocation.lng, dropoffLocation.lng), Math.max(pickupLocation.lat, dropoffLocation.lat)]
    );

    if (driverLocation) {
      bounds[0] = Math.min(bounds[0], driverLocation.lng);
      bounds[1] = Math.min(bounds[1], driverLocation.lat);
      bounds[2] = Math.max(bounds[2], driverLocation.lng);
      bounds[3] = Math.max(bounds[3], driverLocation.lat);
    }
    if (riderLocation) {
      bounds[0] = Math.min(bounds[0], riderLocation.lng);
      bounds[1] = Math.min(bounds[1], riderLocation.lat);
      bounds[2] = Math.max(bounds[2], riderLocation.lng);
      bounds[3] = Math.max(bounds[3], riderLocation.lat);
    }

    map.current.setCamera({
      bounds: bounds,
      padding: 50,
    });
  }, [pickupLocation, dropoffLocation, driverLocation, riderLocation, mapReady]);

  if (!azureKey) {
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
