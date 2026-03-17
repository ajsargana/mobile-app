/**
 * Mobile Location Service
 *
 * Gets user location for geographic diversity
 * - GPS coordinates (high accuracy)
 * - IP address (fallback)
 * - Permission handling
 */

import * as Location from 'expo-location';
import axios from 'axios';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  method: 'gps' | 'network' | 'ip';
}

interface IPLocationData {
  ip: string;
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
}

export class LocationService {
  private cachedLocation: LocationData | null = null;
  private cachedIP: IPLocationData | null = null;

  /**
   * Get user's current location
   * Tries GPS first, falls back to IP-based location
   */
  async getCurrentLocation(): Promise<LocationData> {
    try {
      // Try GPS location first
      const gpsLocation = await this.getGPSLocation();
      if (gpsLocation) {
        this.cachedLocation = gpsLocation;
        return gpsLocation;
      }
    } catch (error) {
      console.warn('GPS location failed, falling back to IP:', error);
    }

    // Fallback to IP-based location
    try {
      const ipLocation = await this.getIPLocation();
      const locationData: LocationData = {
        latitude: ipLocation.latitude,
        longitude: ipLocation.longitude,
        accuracy: 10000, // IP location is less accurate (~10km)
        method: 'ip',
      };

      this.cachedLocation = locationData;
      return locationData;
    } catch (error) {
      console.error('Failed to get location:', error);
      throw new Error('Unable to determine location. Please enable location services.');
    }
  }

  /**
   * Get GPS location from device
   */
  private async getGPSLocation(): Promise<LocationData | null> {
    try {
      console.log('📍 Requesting location permissions...');

      // Request location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        console.warn('Location permission denied');
        return null;
      }

      console.log('📍 Getting GPS location...');

      // Get current position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // Balance accuracy and battery
      });

      const locationData: LocationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || 100,
        method: 'gps',
      };

      console.log(`✅ GPS location: ${locationData.latitude}, ${locationData.longitude}`);

      return locationData;
    } catch (error) {
      console.error('GPS location error:', error);
      return null;
    }
  }

  /**
   * Get IP-based location (fallback)
   */
  async getIPLocation(): Promise<IPLocationData> {
    try {
      if (this.cachedIP) {
        console.log('📍 Using cached IP location');
        return this.cachedIP;
      }

      console.log('📍 Getting IP-based location...');

      // Get location from IP (using ipapi.co - free tier)
      const response = await axios.get('https://ipapi.co/json/', {
        timeout: 5000,
      });

      const ipLocation: IPLocationData = {
        ip: response.data.ip,
        country: response.data.country_code || 'Unknown',
        region: response.data.region || 'Unknown',
        city: response.data.city || 'Unknown',
        latitude: response.data.latitude || 0,
        longitude: response.data.longitude || 0,
      };

      this.cachedIP = ipLocation;

      console.log(`✅ IP location: ${ipLocation.city}, ${ipLocation.country}`);

      return ipLocation;
    } catch (error) {
      console.error('IP location error:', error);
      throw new Error('Failed to get IP-based location');
    }
  }

  /**
   * Get just the IP address
   */
  async getIPAddress(): Promise<string> {
    try {
      const response = await axios.get('https://api.ipify.org?format=json', {
        timeout: 3000,
      });

      return response.data.ip;
    } catch (error) {
      console.error('Failed to get IP address:', error);

      // Fallback to ipapi.co
      try {
        const ipLocation = await this.getIPLocation();
        return ipLocation.ip;
      } catch (fallbackError) {
        throw new Error('Failed to get IP address');
      }
    }
  }

  /**
   * Check if location permissions are granted
   */
  async hasLocationPermission(): Promise<boolean> {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Failed to check location permission:', error);
      return false;
    }
  }

  /**
   * Request location permissions
   */
  async requestLocationPermission(): Promise<boolean> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('Failed to request location permission:', error);
      return false;
    }
  }

  /**
   * Get cached location (no network request)
   */
  getCachedLocation(): LocationData | null {
    return this.cachedLocation;
  }

  /**
   * Clear cached location
   */
  clearCache(): void {
    this.cachedLocation = null;
    this.cachedIP = null;
    console.log('🧹 Location cache cleared');
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth radius in km

    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }

  /**
   * Convert degrees to radians
   */
  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Format location for display
   */
  formatLocation(location: LocationData): string {
    const method = location.method.toUpperCase();
    const accuracy = Math.round(location.accuracy);

    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} (±${accuracy}m, ${method})`;
  }
}

// Singleton instance
export const locationService = new LocationService();
