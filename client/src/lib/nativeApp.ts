import { Capacitor } from '@capacitor/core';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export async function initNativeApp(navigate: (path: string) => void): Promise<void> {
  if (!isNativePlatform()) return;

  try {
    const { App } = await import('@capacitor/app');

    App.addListener('appUrlOpen', (event) => {
      try {
        const url = new URL(event.url);
        const path = url.pathname + url.search + url.hash;
        if (path && path !== '/') {
          navigate(path);
        }
      } catch (err) {
        console.warn('appUrlOpen: invalid URL', event.url, err);
      }
    });

    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        App.exitApp();
      }
    });
  } catch (err) {
    console.warn('Native App init failed', err);
  }
}
