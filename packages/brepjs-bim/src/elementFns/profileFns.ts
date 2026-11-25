import type { Result } from 'brepjs';
import { ok, err } from 'brepjs';
import type { Profile } from '../specs/profile.js';
import { isExtendedProfile } from '../specs/profile.js';
import { extendedProfileArea } from '../specs/profilesExtended.js';
import type { BimError } from '../errors/bimError.js';
import { specError } from '../errors/bimError.js';
import { roundCorners } from '../specs/cornerFillet.js';

// Analytical cross-section area of a profile (mm²). Extended profiles delegate
// to extendedProfileArea (closed-form per kind); core profiles use the formulas
// below.
export function profileCrossSectionArea(profile: Profile): number {
  if (isExtendedProfile(profile)) {
    return extendedProfileArea(profile);
  }
  switch (profile.kind) {
    case 'RECTANGULAR':
      return profile.width * profile.height;
    case 'CIRCULAR':
      return Math.PI * profile.radius * profile.radius;
    case 'I_BEAM': {
      const flangeArea = 2 * profile.overallWidth * profile.flangeThickness;
      const webHeight = profile.overallDepth - 2 * profile.flangeThickness;
      const webArea = webHeight * profile.webThickness;
      // Each of the four root fillets fills a corner notch: the r×r square corner
      // minus the quarter disc it sweeps out, i.e. r²(1 - π/4) of added material.
      const r = profile.filletRadius ?? 0;
      const filletArea = 4 * r * r * (1 - Math.PI / 4);
      return flangeArea + webArea + filletArea;
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
): Result<Array<[number, number, number]>, BimError> {
  if (isExtendedProfile(profile)) {
    // Extended profiles (including hollow sections with inner voids) cannot be
    // represented as a single outer polygon. Solid builders for extended
    // profiles must use extendedProfileToFace() + extrude() instead.
    return err(
      specError(
        'EXTENDED_PROFILE_NO_POLYGON',
        `profileToPolygon: extended profile kind '${profile.kind}' has no single-polygon outline; use extendedProfileToFace()`
      )
    );
  }
  switch (profile.kind) {
    case 'RECTANGULAR': {
      const halfW = profile.width / 2;
      const halfH = profile.height / 2;
      const pts: Array<[number, number, number]> = [
        [-halfW, -halfH, 0],
        [halfW, -halfH, 0],
        [halfW, halfH, 0],
        [-halfW, halfH, 0],
      ];
      return ok(pts);
    }
    case 'CIRCULAR': {
      if (circleSegments < 3) {
        return err(
          specError(
            'PROFILE_CIRCLE_SEGMENTS',
            `profileToPolygon: circleSegments must be >= 3, got ${circleSegments}`
          )
        );
      }
      const pts: Array<[number, number, number]> = [];
      for (let i = 0; i < circleSegments; i++) {
        const theta = (2 * Math.PI * i) / circleSegments;
        pts.push([profile.radius * Math.cos(theta), profile.radius * Math.sin(theta), 0]);
      }
      return ok(pts);
    }
    case 'I_BEAM': {
      const halfW = profile.overallWidth / 2;
      const halfD = profile.overallDepth / 2;
      const halfWeb = profile.webThickness / 2;
      const flangeInnerY = halfD - profile.flangeThickness;
      // Outline vertices traced clockwise from the bottom-left flange corner.
      // The four web-to-flange junctions (indices 3, 4, 9, 10) are the concave
      // root corners; with a fillet radius they become tessellated arcs.
      const v: Array<[number, number]> = [
        [-halfW, -halfD],
        [halfW, -halfD],
        [halfW, -flangeInnerY],
        [halfWeb, -flangeInnerY],
        [halfWeb, flangeInnerY],
        [halfW, flangeInnerY],
        [halfW, halfD],
        [-halfW, halfD],
        [-halfW, flangeInnerY],
        [-halfWeb, flangeInnerY],
        [-halfWeb, -flangeInnerY],
        [-halfW, -flangeInnerY],
      ];
      const r = profile.filletRadius ?? 0;
      const rounded = roundCorners(v, new Map([3, 4, 9, 10].map((i) => [i, r])));
      return ok(rounded.map(([x, y]): [number, number, number] => [x, y, 0]));
    }
  }
}
