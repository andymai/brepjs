import { getKernel, getKernelCapabilities } from '@/kernel/index.js';
import type { Face, Shape3D } from '@/core/shapeTypes.js';
import type { ValidSolid } from '@/core/validityTypes.js';
import { HASH_CODE_MAX } from '@/core/constants.js';
import { type Result, type Err, ok, err } from '@/core/result.js';
import type { BrepError } from '@/core/errors.js';
import { kernelError, BrepErrorCode } from '@/core/errors.js';
import { getSuggestionForCode } from '@/core/kernelErrorTranslation.js';
import type { ShapeEvolution } from '@/kernel/types.js';
import { getFaces } from './topologyQueryFns.js';

/*
 * OCCT reports these thick-solid results as done although none is a usable
 * solid: past the wall a body can take, MakeThickSolid hands back the untouched
 * input and MakeOffsetShape a null shape, and an offset surface whose radius
 * goes negative comes back flipped as a valid-looking inverted face (an r=5
 * cylinder shelled at 6 gets an r=1 "cavity"). BRepCheck passes the last one,
 * so a point on each generated wall is projected back onto its source face.
 * One point is enough, since every point of an offset surface sits at the wall
 * distance, and it costs far less than a face-to-face extrema.
 */
type ThickResultFailure = 'unchanged' | 'empty' | 'volume' | 'invalid' | 'wall-distance';

export interface ThickResultSpec {
  readonly operation: 'shell' | 'offset';
  /** Signed offset distance; a shell wall grows inward, so pass its thickness negated. */
  readonly distance: number;
  readonly tolerance: number;
  /** Shell openings: their history records the rim, not an offset wall. */
  readonly openedFaceHashes?: ReadonlySet<number> | undefined;
}

const UNCHANGED_VOLUME_REL_TOL = 1e-7;
const WALL_DISTANCE_REL_TOL = 1e-3;

function facesByHash(shape: Shape3D): Map<number, Face> {
  const kernel = getKernel();
  const byHash = new Map<number, Face>();
  for (const face of getFaces(shape)) {
    byHash.set(kernel.hashCode(face.wrapped, HASH_CODE_MAX), face);
  }
  return byHash;
}

// A real shell always adds faces (an inner wall per kept face, a rim per
// opening), so an equal face count separates a handed-back input from a valid
// shell whose cavity is only a sliver of the volume.
function volumeFailure(
  distance: number,
  input: { volume: number; faceCount: number },
  result: { volume: number; faceCount: number }
): ThickResultFailure | undefined {
  const sameVolume =
    Math.abs(result.volume - input.volume) <= UNCHANGED_VOLUME_REL_TOL * Math.abs(input.volume);
  if (sameVolume && result.faceCount === input.faceCount) return 'unchanged';
  if (result.volume <= 0) return 'volume';
  return result.volume > input.volume === distance > 0 ? undefined : 'volume';
}

/** Distance from the middle of a generated wall's surface to its source face. */
function wallGap(source: Face, generated: Face): number {
  const kernel = getKernel();
  const uv = kernel.uvBounds(generated.wrapped);
  const p = kernel.pointOnSurface(
    generated.wrapped,
    (uv.uMin + uv.uMax) / 2,
    (uv.vMin + uv.vMax) / 2
  );
  const q = kernel.projectPointOnFace(source.wrapped, p);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function worstWallDeviation(
  input: ValidSolid,
  result: Shape3D,
  evolution: ShapeEvolution,
  spec: ThickResultSpec
): number {
  if (evolution.generated.size === 0) return 0;
  const sources = facesByHash(input);
  const produced = facesByHash(result);
  const wall = Math.abs(spec.distance);
  let worst = 0;
  for (const [sourceHash, generatedHashes] of evolution.generated) {
    if (spec.openedFaceHashes?.has(sourceHash)) continue;
    const source = sources.get(sourceHash);
    if (!source) continue;
    for (const hash of generatedHashes) {
      const face = produced.get(hash);
      if (!face) continue;
      worst = Math.max(worst, Math.abs(wallGap(source, face) - wall));
    }
  }
  return worst;
}

function failure(
  spec: ThickResultSpec,
  reason: ThickResultFailure,
  metadata: Record<string, unknown>
): Err<BrepError> {
  const wall = Math.abs(spec.distance);
  const isShell = spec.operation === 'shell';
  if (isShell && reason === 'unchanged') {
    const code = BrepErrorCode.SHELL_NO_EFFECT;
    return err(
      kernelError(
        code,
        `Shell left the solid unchanged: a ${wall} wall is too thick for this body`,
        undefined,
        { operation: 'shell', reason, thickness: wall, ...metadata },
        getSuggestionForCode(code)
      )
    );
  }
  const code = isShell ? BrepErrorCode.SHELL_INVALID_RESULT : BrepErrorCode.OFFSET_INVALID_RESULT;
  const what = isShell ? `a ${wall} wall` : `an offset of ${spec.distance}`;
  return err(
    kernelError(
      code,
      `${spec.operation} gave no usable solid (${reason}): ${what} is too large for this body`,
      undefined,
      { operation: spec.operation, reason, distance: spec.distance, ...metadata },
      getSuggestionForCode(code)
    )
  );
}

/**
 * Verify a shell/offset result against its input. The wall-distance check
 * needs `evolution` built from every input face hash and a kernel with native
 * history; pass `undefined` to skip it.
 */
export function checkThickResult(
  input: ValidSolid,
  result: Shape3D,
  evolution: ShapeEvolution | undefined,
  spec: ThickResultSpec
): Result<undefined> {
  const kernel = getKernel();
  if (kernel.isNull(result.wrapped)) return failure(spec, 'empty', {});

  const inputVolume = kernel.volume(input.wrapped);
  const resultVolume = kernel.volume(result.wrapped);
  const byVolume = volumeFailure(
    spec.distance,
    { volume: inputVolume, faceCount: getFaces(input).length },
    { volume: resultVolume, faceCount: getFaces(result).length }
  );
  if (byVolume) return failure(spec, byVolume, { inputVolume, resultVolume });

  if (!kernel.isValid(result.wrapped)) return failure(spec, 'invalid', {});

  if (evolution && getKernelCapabilities().nativeHistory === true) {
    const deviation = worstWallDeviation(input, result, evolution, spec);
    const allowed = Math.max(10 * spec.tolerance, WALL_DISTANCE_REL_TOL * Math.abs(spec.distance));
    if (deviation > allowed) return failure(spec, 'wall-distance', { deviation, allowed });
  }
  return ok(undefined);
}
