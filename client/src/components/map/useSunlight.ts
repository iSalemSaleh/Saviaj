/**
 * Sunlight Detection Hook
 * 
 * This module provides functionality to detect day/night based on
 * geographic location and current time. It uses sunrise/sunset
 * calculations to automatically switch map themes.
 * 
 * @module useSunlight
 */

import { useState, useEffect } from 'react';

/**
 * Calculates sunrise and sunset times for a given location and date.
 * 
 * Uses a simplified solar position algorithm that provides approximate
 * times accurate to within a few minutes. This is sufficient for
 * day/night map theme switching.
 * 
 * Algorithm based on NOAA Solar Calculator equations.
 * 
 * @param lat - Latitude in decimal degrees (-90 to 90)
 * @param lng - Longitude in decimal degrees (-180 to 180)
 * @param date - The date to calculate for (defaults to current date)
 * @returns Object containing sunrise and sunset as Date objects
 * 
 * @example
 * // Get sunrise/sunset for London
 * const { sunrise, sunset } = getSunTimes(51.5074, -0.1278, new Date());
 * console.log(`Sunrise: ${sunrise.toLocaleTimeString()}`);
 * console.log(`Sunset: ${sunset.toLocaleTimeString()}`);
 */
export function getSunTimes(
  lat: number,
  lng: number,
  date: Date
): { sunrise: Date; sunset: Date } {
  // Calculate day of year (1-365)
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (date.getTime() - startOfYear.getTime()) / 86400000
  );
  
  // Fractional year in radians (gamma)
  // Used for calculating the equation of time and solar declination
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (12 - 12) / 24);
  
  // Equation of time in minutes
  // Accounts for the Earth's elliptical orbit and axial tilt
  const eqtime = 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );
  
  // Solar declination in radians
  // The angle between the sun and the Earth's equatorial plane
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  
  // Convert latitude to radians
  const latRad = lat * Math.PI / 180;
  
  // Solar zenith angle for sunrise/sunset (in radians)
  // 90.833° accounts for atmospheric refraction and sun's radius
  const zenith = 90.833 * Math.PI / 180;
  
  // Calculate hour angle for sunrise/sunset
  // This is the angle of the sun from solar noon
  let ha = Math.acos(
    Math.cos(zenith) / (Math.cos(latRad) * Math.cos(decl)) -
    Math.tan(latRad) * Math.tan(decl)
  );
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

/**
 * React hook to detect if it's currently dark (night time) at a location.
 * 
 * Automatically updates when crossing sunrise/sunset boundaries.
 * Returns false (daytime) if location is not provided.
 * 
 * Used to switch map tiles to dark mode during night hours,
 * improving visibility and reducing eye strain.
 * 
 * @param lat - Latitude in decimal degrees (null if not available)
 * @param lng - Longitude in decimal degrees (null if not available)
 * @returns true if it's currently dark (before sunrise or after sunset)
 * 
 * @example
 * // In a map component
 * function MapComponent({ location }) {
 *   const isDark = useIsDarkMode(location?.lat, location?.lng);
 *   
 *   return (
 *     <MapContainer>
 *       <TileLayer url={isDark ? darkTileUrl : lightTileUrl} />
 *     </MapContainer>
 *   );
 * }
 */
export function useIsDarkMode(
  lat: number | null,
  lng: number | null
): boolean {
  const [isDark, setIsDark] = useState(false);
  
  useEffect(() => {
    // Skip if location not available
    if (lat === null || lat === undefined || lng === null || lng === undefined) {
      return;
    }
    
    /**
     * Checks current time against sunrise/sunset and updates state.
     */
    const checkDarkMode = () => {
      const now = new Date();
      const { sunrise, sunset } = getSunTimes(lat, lng, now);
      
      // It's dark before sunrise or after sunset
      const isNight = now < sunrise || now > sunset;
      setIsDark(isNight);
    };
    
    // Initial check
    checkDarkMode();
    
    // Re-check every minute to catch sunrise/sunset transitions
    const interval = setInterval(checkDarkMode, 60000);
    
    return () => clearInterval(interval);
  }, [lat, lng]);
  
  return isDark;
}
