import { Geolocation, Position, PermissionStatus } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface GeolocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface GeolocationResult {
  coords: GeolocationCoords;
  timestamp: number;
}

export interface GeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function checkPermissions(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    return { location: 'granted', coarseLocation: 'granted' };
  }
  return await Geolocation.checkPermissions();
}

export async function requestPermissions(): Promise<PermissionStatus> {
  if (!isNativePlatform()) {
    return { location: 'granted', coarseLocation: 'granted' };
  }
  return await Geolocation.requestPermissions();
}

export async function getCurrentPosition(options?: GeolocationOptions): Promise<GeolocationResult> {
  if (isNativePlatform()) {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: options?.enableHighAccuracy ?? true,
      timeout: options?.timeout ?? 10000,
      maximumAge: options?.maximumAge ?? 5000,
    });
    return convertPosition(position);
  } else {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(convertBrowserPosition(pos)),
        reject,
        options
      );
    });
  }
}

export function watchPosition(
  successCallback: (position: GeolocationResult) => void,
  errorCallback?: (error: any) => void,
  options?: GeolocationOptions
): { clearWatch: () => void } {
  if (isNativePlatform()) {
    let watchId: string | null = null;
    
    Geolocation.watchPosition(
      {
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 10000,
        maximumAge: options?.maximumAge ?? 5000,
      },
      (position, err) => {
        if (err) {
          errorCallback?.(err);
        } else if (position) {
          successCallback(convertPosition(position));
        }
      }
    ).then((id) => {
      watchId = id;
    });

    return {
      clearWatch: () => {
        if (watchId) {
          Geolocation.clearWatch({ id: watchId });
        }
      },
    };
  } else {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => successCallback(convertBrowserPosition(pos)),
      errorCallback,
      options
    );

    return {
      clearWatch: () => navigator.geolocation.clearWatch(watchId),
    };
  }
}

function convertPosition(position: Position): GeolocationResult {
  return {
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude ?? null,
      altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
      heading: position.coords.heading ?? null,
      speed: position.coords.speed ?? null,
    },
    timestamp: position.timestamp,
  };
}

function convertBrowserPosition(position: GeolocationPosition): GeolocationResult {
  return {
    coords: {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
    },
    timestamp: position.timestamp,
  };
}
