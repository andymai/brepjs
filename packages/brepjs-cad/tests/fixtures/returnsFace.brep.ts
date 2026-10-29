import { drawRoundedRectangle } from 'brepjs';
export default () => drawRoundedRectangle(60, 30, 5).sketchOnPlane('XY').face();
