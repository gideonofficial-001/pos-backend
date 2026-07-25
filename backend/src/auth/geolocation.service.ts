import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface LocationCheckResult {
  isAllowed: boolean;
  distanceFromBranch?: number;
  reason?: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }

  /**
   * Check if login location is suspicious
   */
  async checkLoginLocation(
    userId: string,
    branchId: string | null,
    location: GeoLocation | null,
    ipAddress: string,
  ): Promise<LocationCheckResult> {
    // If no location provided, check against last known location
    if (!location) {
      const lastLogin = await this.prisma.loginLocation.findFirst({
        where: { userId, status: 'SUCCESS' },
        orderBy: { createdAt: 'desc' },
        skip: 1, // Skip current login
      });

      if (lastLogin && lastLogin.latitude && lastLogin.longitude) {
        return {
          isAllowed: true,
          riskLevel: 'MEDIUM',
          reason: 'Location not provided. Using IP-based check.',
        };
      }

      return {
        isAllowed: true,
        riskLevel: 'LOW',
        reason: 'First login or location unavailable.',
      };
    }

    // Check against branch geofence if user has a branch
    if (branchId) {
      const branchLocation = await this.prisma.branchLocation.findUnique({
        where: { branchId },
      });

      if (branchLocation) {
        const distance = this.calculateDistance(
          location.latitude,
          location.longitude,
          branchLocation.latitude,
          branchLocation.longitude,
        );

        if (distance > branchLocation.radiusMeters) {
          return {
            isAllowed: false,
            distanceFromBranch: Math.round(distance),
            riskLevel: 'HIGH',
            reason: `Login location is ${Math.round(distance)}m from assigned branch (max allowed: ${branchLocation.radiusMeters}m).`,
          };
        }

        return {
          isAllowed: true,
          distanceFromBranch: Math.round(distance),
          riskLevel: 'LOW',
          reason: `Within branch radius (${Math.round(distance)}m).`,
        };
      }
    }

    // Check for impossible travel (login from different country within short time)
    const recentLogins = await this.prisma.loginLocation.findMany({
      where: {
        userId,
        status: 'SUCCESS',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (recentLogins.length > 0) {
      const lastLogin = recentLogins[0];
      if (lastLogin.latitude && lastLogin.longitude) {
        const distance = this.calculateDistance(
          location.latitude,
          location.longitude,
          lastLogin.latitude,
          lastLogin.longitude,
        );

        // If distance > 500km within 1 hour, flag as suspicious
        const timeDiff = Date.now() - lastLogin.createdAt.getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        if (distance > 500000 && hoursDiff < 1) {
          return {
            isAllowed: false,
            riskLevel: 'HIGH',
            reason: `Impossible travel detected: ${Math.round(distance / 1000)}km in ${Math.round(hoursDiff * 60)} minutes.`,
          };
        }

        if (distance > 100000) { // > 100km
          return {
            isAllowed: true,
            riskLevel: 'MEDIUM',
            reason: `Unusual location: ${Math.round(distance / 1000)}km from last login.`,
          };
        }
      }
    }

    return {
      isAllowed: true,
      riskLevel: 'LOW',
      reason: 'Location check passed.',
    };
  }

  /**
   * Get IP-based location (using ipapi.co or similar)
   * In production, use a proper IP geolocation service
   */
  async getIpLocation(ipAddress: string): Promise<Partial<GeoLocation> & { city?: string; region?: string; country?: string }> {
    try {
      // Free tier: ipapi.co
      // Replace with your preferred IP geolocation service
      const response = await fetch(`https://ipapi.co/${ipAddress}/json/`);
      const data = await response.json();

      return {
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city,
        region: data.region,
        country: data.country_name,
      };
    } catch (error) {
      this.logger.error(`Failed to get IP location for ${ipAddress}`, error);
      return {};
    }
  }
}
