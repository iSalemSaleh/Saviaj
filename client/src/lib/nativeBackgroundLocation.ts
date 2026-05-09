import { Capacitor, registerPlugin } from '@capacitor/core';

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (
      location:
        | {
            latitude: number;
            longitude: number;
            accuracy: number;
            speed: number | null;
            bearing: number | null;
            time: number;
          }
        | null,
      error?: { code: string; message: string }
    ) => void
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

let activeWatcherId: string | null = null;

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Start tracking the driver in the background. Android shows a persistent foreground
 * notification while this is active (required by Android 10+ for background location).
 */
export async function startBackgroundTracking(
  onLocation: (loc: { lat: number; lng: number; accuracy: number; speed: number | null }) => void
): Promise<void> {
  if (!isNative()) return;
  if (activeWatcherId) return;

  activeWatcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: 'Saviaj is sharing your location with riders',
      backgroundTitle: 'Trip in progress',
      requestPermissions: true,
      stale: false,
      distanceFilter: 10,
    },
    (location, error) => {
      if (error) {
        console.warn('background location error', error);
        return;
      }
      if (!location) return;
      onLocation({
        lat: location.latitude,
        lng: location.longitude,
        accuracy: location.accuracy,
        speed: location.speed,
      });
    }
  );
}

export async function stopBackgroundTracking(): Promise<void> {
  if (!isNative() || !activeWatcherId) return;
  await BackgroundGeolocation.removeWatcher({ id: activeWatcherId });
  activeWatcherId = null;
}
