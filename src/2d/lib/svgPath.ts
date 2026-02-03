import type { OcType } from '../../kernel/types.js';
import { RAD2DEG } from '../../core/constants.js';
import { findCurveType } from '../../core/definitionMaps.js';
import { unwrap } from '../../core/result.js';
import { bug } from '../../core/errors.js';
import { getKernel } from '../../kernel/index.js';
import round2 from '../../utils/round2.js';
import round5 from '../../utils/round5.js';
import type { Point2D } from './definitions.js';
import { gcWithScope } from '../../core/disposal.js';

const fromPnt = (pnt: OcType) => `${round2(pnt.X())} ${round2(pnt.Y())}`;

export const adaptedCurveToPathElem = (adaptor: OcType, lastPoint: Point2D): string => {
  const oc = getKernel().oc;
  const r = gcWithScope();
  const curveType = unwrap(findCurveType(adaptor.GetType()));

  const [endX, endY] = lastPoint;
  const endpoint = `${round5(endX)} ${round5(endY)}`;
  if (curveType === 'LINE') {
    return `L ${endpoint}`;
  }
  if (curveType === 'BEZIER_CURVE') {
    const bezierHandle = r(adaptor.Bezier());
    const curve = bezierHandle.get();
    const deg = curve.Degree();

    if (deg === 1) {
      return `L ${endpoint}`;
    }

    if (deg === 2) {
      const pole2 = r(curve.Pole(2));
      return `Q ${fromPnt(pole2)} ${endpoint}`;
    }

    if (deg === 3) {
      const pole2 = r(curve.Pole(2));
      const pole3 = r(curve.Pole(3));
      const p1 = fromPnt(pole2);
      const p2 = fromPnt(pole3);
      return `C ${p1} ${p2} ${endpoint}`;
    }
  }
  if (curveType === 'CIRCLE') {
    const curve = r(adaptor.Circle());
    const radius = curve.Radius();

    const p1 = adaptor.FirstParameter();
    const p2 = adaptor.LastParameter();

    const paramAngle = (p2 - p1) * RAD2DEG;

    const end = paramAngle !== 360 ? endpoint : `${round5(endX)} ${round5(endY + 0.0001)}`;

    return `A ${radius} ${radius} 0 ${Math.abs(paramAngle) > 180 ? '1' : '0'} ${
      curve.IsDirect() ? '1' : '0'
    } ${end}`;
  }

  if (curveType === 'ELLIPSE') {
    const curve = r(adaptor.Ellipse());
    const rx = curve.MajorRadius();
    const ry = curve.MinorRadius();

    const p1 = adaptor.FirstParameter();
    const p2 = adaptor.LastParameter();

    const paramAngle = (p2 - p1) * RAD2DEG;

    const end = paramAngle !== 360 ? endpoint : `${round5(endX)} ${round5(endY + 0.0001)}`;

    const dir0 = r(new oc.gp_Dir2d_1());
    const xAxis = r(curve.XAxis());
    const xDir = r(xAxis.Direction());
    const angle = 180 - xDir.Angle(dir0) * RAD2DEG;

    return `A ${round5(rx)} ${round5(ry)} ${round5(angle)} ${
      Math.abs(paramAngle) > 180 ? '1' : '0'
    } ${curve.IsDirect() ? '1' : '0'} ${end}`;
  }

  bug('adaptedCurveToPathElem', `Unsupported curve type: ${curveType}`);
};
