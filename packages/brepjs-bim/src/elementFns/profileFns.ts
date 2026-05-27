import type { Profile } from '../specs/profile.js';

// Analytical cross-section area of a profile (mm²).
export function profileCrossSectionArea(profile: Profile): number {
  switch (profile.kind) {
    case 'RECTANGULAR':
      return profile.width * profile.height;
    case 'CIRCULAR':
      return Math.PI * profile.radius * profile.radius;
    case 'I_BEAM': {
      const flangeArea = 2 * profile.overallWidth * profile.flangeThickness;
      const webHeight = profile.overallDepth - 2 * profile.flangeThickness;
      const webArea = webHeight * profile.webThickness;
      return flangeArea + webArea;
    }
  }
}

// Returns 3D polygon vertices (z = 0) approximating the profile outline.
// Used as the source polygon for brepjs polygon() + extrude().
// Polygon is centered on the local origin.
//
// Circular profiles are tessellated to N segments (N = 32 default — visually
// circular while staying lightweight for boolean tools).
export function profileToPolygon(
  profile: Profile,
  circleSegments = 32
): Array<[number, number, number]> {
  switch (profile.kind) {
    case 'RECTANGULAR': {
      const halfW = profile.width / 2;
      const halfH = profile.height / 2;
      return [
        [-halfW, -halfH, 0],
        [halfW, -halfH, 0],
        [halfW, halfH, 0],
        [-halfW, halfH, 0],
      ];
    }
    case 'CIRCULAR': {
      if (circleSegments < 3) {
        throw new Error(`profileToPolygon: circleSegments must be >= 3, got ${circleSegments}`);
      }
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i < circleSegments; i++) {
        const theta = (2 * Math.PI * i) / circleSegments;
        pts.push([profile.radius * Math.cos(theta), profile.radius * Math.sin(theta), 0]);
      }
      return pts;
    }
    case 'I_BEAM': {
      const halfW = profile.overallWidth / 2;
      const halfD = profile.overallDepth / 2;
      const halfWeb = profile.webThickness / 2;
      const flangeInnerY = halfD - profile.flangeThickness;
      // Trace the I outline clockwise starting from bottom-left flange corner.
      return [
        [-halfW, -halfD, 0],
        [halfW, -halfD, 0],
        [halfW, -flangeInnerY, 0],
        [halfWeb, -flangeInnerY, 0],
        [halfWeb, flangeInnerY, 0],
        [halfW, flangeInnerY, 0],
        [halfW, halfD, 0],
        [-halfW, halfD, 0],
        [-halfW, flangeInnerY, 0],
        [-halfWeb, flangeInnerY, 0],
        [-halfWeb, -flangeInnerY, 0],
        [-halfW, -flangeInnerY, 0],
      ];
    }
  }
}
