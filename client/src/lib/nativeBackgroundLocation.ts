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
  onLocation: (loc: { lat: number; lng: number; accuracy: number; speed: number | null }) => void,
  context?: { riderName?: string; tripLabel?: string }
): Promise<void> {
  if (!isNative()) return;
  if (activeWatcherId) return;

  const who = context?.riderName?.trim();
  const trip = context?.tripLabel?.trim();
  const title = trip ? `Saviaj — ${trip}` : 'Saviaj — Trip in progress';
  const message = who
    ? `Sharing your live location with ${who}. Tap to return to the trip.`
    : 'Sharing your live location with your rider. Tap to return to the trip.';

  activeWatcherId = await BackgroundGeolocation.addWatcher(
    {
      backgroundMessage: message,
      backgroundTitle: title,
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
