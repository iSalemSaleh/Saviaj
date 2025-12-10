const AZURE_MAPS_KEY = process.env.AZURE_MAPS_KEY;

export interface GeocodingResult {
  id: string;
  address: string;
  position: {
    lat: number;
    lon: number;
  };
}

export interface RouteResult {
  distanceInMeters: number;
  durationInSeconds: number;
  geometry: Array<{ lat: number; lon: number }>;
}

export async function searchAddress(query: string): Promise<GeocodingResult[]> {
  if (!AZURE_MAPS_KEY) {
    throw new Error('Azure Maps key not configured');
  }

  const params = new URLSearchParams({
    'api-version': '1.0',
    'subscription-key': AZURE_MAPS_KEY,
    query: query,
    countrySet: 'GB',
    limit: '8',
    typeahead: 'true',
  });

  const response = await fetch(
    `https://atlas.microsoft.com/search/address/json?${params}`
  );

  if (!response.ok) {
    throw new Error(`Azure Maps geocoding failed: ${response.statusText}`);
  }

  const data = await response.json();

  return data.results?.map((result: any) => ({
    id: result.id || `${result.position.lat},${result.position.lon}`,
    address: result.address?.freeformAddress || '',
    position: {
      lat: result.position.lat,
      lon: result.position.lon,
    },
  })) || [];
}

export async function getRoute(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): Promise<RouteResult | null> {
  if (!AZURE_MAPS_KEY) {
    throw new Error('Azure Maps key not configured');
  }

  const params = new URLSearchParams({
    'api-version': '1.0',
    'subscription-key': AZURE_MAPS_KEY,
    routeType: 'fastest',
    traffic: 'true',
    travelMode: 'car',
  });

  const response = await fetch(
    `https://atlas.microsoft.com/route/directions/json?${params}&query=${startLat},${startLon}:${endLat},${endLon}`
  );

  if (!response.ok) {
    throw new Error(`Azure Maps routing failed: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.routes || data.routes.length === 0) {
    return null;
  }

  const route = data.routes[0];
  const summary = route.summary;

  const points: Array<{ lat: number; lon: number }> = [];
  route.legs?.forEach((leg: any) => {
    leg.points?.forEach((point: any) => {
      points.push({ lat: point.latitude, lon: point.longitude });
    });
  });

  return {
    distanceInMeters: summary.lengthInMeters,
    durationInSeconds: summary.travelTimeInSeconds,
    geometry: points,
  };
}

export function getAzureMapsKey(): string | undefined {
  return AZURE_MAPS_KEY;
}
