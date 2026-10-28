/// <reference types="@types/google.maps" />
import { useState, useEffect } from 'react';

declare global {
  interface Window {
    google?: typeof google;
  }
}

interface UseGoogleMapsResult {
  isLoaded: boolean;
  loadError: string | null;
}

export const useGoogleMaps = (apiKey?: string): UseGoogleMapsResult => {
  const key = apiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const [isLoaded, setIsLoaded] = useState<boolean>(() => {
    return Boolean(typeof window !== 'undefined' && window.google?.maps);
  });

  const [loadError, setLoadError] = useState<string | null>(() => {
    if (!key) {
      return 'Thiếu Google Maps API Key (VITE_GOOGLE_MAPS_API_KEY). Vui lòng kiểm tra cấu hình .env.';
    }
    return null;
  });

  useEffect(() => {
    if (!key) return;

    if (window.google?.maps) {
      return;
    }

    const existingScript = document.getElementById('google-maps-script');
    if (existingScript) {
      const handleLoad = () => setIsLoaded(true);
      const handleError = () => setLoadError('Không thể nạp Google Maps SDK.');
      existingScript.addEventListener('load', handleLoad);
      existingScript.addEventListener('error', handleError);
      return () => {
        existingScript.removeEventListener('load', handleLoad);
        existingScript.removeEventListener('error', handleError);
      };
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      setIsLoaded(true);
    };

    script.onerror = () => {
      setLoadError('Lỗi kết nối tới dịch vụ bản đồ Google Maps.');
    };

    document.head.appendChild(script);
  }, [key]);

  return { isLoaded, loadError };
};
