import { box, shape } from 'brepjs';
export default () => shape(box(10, 20, 30)).translate([5, 0, 0]);
