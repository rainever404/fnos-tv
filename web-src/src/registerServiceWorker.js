/* eslint-disable no-console */

async function clearLegacyServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(registration => registration.unregister()))

    if ('caches' in window) {
      const cacheNames = await window.caches.keys()
      await Promise.all(cacheNames.map(cacheName => window.caches.delete(cacheName)))
    }
  } catch (error) {
    console.warn('Service worker cleanup failed:', error)
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('load', clearLegacyServiceWorker)
}
