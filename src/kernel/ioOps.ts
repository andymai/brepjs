/**
 * File I/O operations for OCCT shapes.
 *
 * Provides STEP, STL, and IGES import/export functionality.
 * Used by OCCTAdapter.
 */

import type { OpenCascadeInstance, OcShape } from './types.js';
import { uniqueIOFilename } from '../utils/ioFilename.js';

/**
 * Exports shapes to STEP format.
 */
export function exportSTEP(oc: OpenCascadeInstance, shapes: OcShape[]): string {
  const writer = new oc.STEPControl_Writer_1();
  oc.Interface_Static.SetIVal('write.step.schema', 5);
  writer.Model(true).delete();
  const progress = new oc.Message_ProgressRange_1();

  for (const shape of shapes) {
    writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
  }

  const filename = uniqueIOFilename('_export', 'step');
  const done = writer.Write(filename);
  writer.delete();
  progress.delete();

  if (done === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    const file = oc.FS.readFile('/' + filename);
    oc.FS.unlink('/' + filename);
    return new TextDecoder().decode(file);
  }
  throw new Error('STEP export failed: writer did not complete successfully');
}

/**
 * Exports a shape to STL format.
 */
export function exportSTL(
  oc: OpenCascadeInstance,
  shape: OcShape,
  binary = false
): string | ArrayBuffer {
  const filename = uniqueIOFilename('_export', 'stl');
  const done = oc.StlAPI.Write(shape, filename, !binary);

  if (done) {
    const file = oc.FS.readFile('/' + filename);
    oc.FS.unlink('/' + filename);
    if (binary) return file.buffer as ArrayBuffer;
    return new TextDecoder().decode(file);
  }
  throw new Error('STL export failed: StlAPI.Write returned false');
}

/**
 * Exports shapes to IGES format.
 */
export function exportIGES(oc: OpenCascadeInstance, shapes: OcShape[]): string {
  const writer = new oc.IGESControl_Writer_1();

  for (const shape of shapes) {
    writer.AddShape(shape);
  }
  writer.ComputeModel();

  const filename = uniqueIOFilename('_export', 'iges');
  const done = writer.Write_2(filename);
  writer.delete();

  if (done) {
    const file = oc.FS.readFile('/' + filename);
    oc.FS.unlink('/' + filename);
    return new TextDecoder().decode(file);
  }
  throw new Error('IGES export failed: writer did not complete successfully');
}

/**
 * Imports shapes from STEP data.
 */
export function importSTEP(oc: OpenCascadeInstance, data: string | ArrayBuffer): OcShape[] {
  const filename = uniqueIOFilename('_import', 'step');
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  oc.FS.writeFile('/' + filename, buffer);

  const reader = new oc.STEPControl_Reader_1();
  if (reader.ReadFile(filename)) {
    oc.FS.unlink('/' + filename);
    const progress = new oc.Message_ProgressRange_1();
    reader.TransferRoots(progress);
    progress.delete();
    const shape = reader.OneShape();
    reader.delete();
    return [shape];
  }
  oc.FS.unlink('/' + filename);
  reader.delete();
  throw new Error('Failed to import STEP file: reader could not parse the input data');
}

/**
 * Imports a shape from STL data.
 */
export function importSTL(oc: OpenCascadeInstance, data: string | ArrayBuffer): OcShape {
  const filename = uniqueIOFilename('_import', 'stl');
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  oc.FS.writeFile('/' + filename, buffer);

  const reader = new oc.StlAPI_Reader();
  const readShape = new oc.TopoDS_Shell();

  if (reader.Read(readShape, filename)) {
    oc.FS.unlink('/' + filename);
    const upgrader = new oc.ShapeUpgrade_UnifySameDomain_2(readShape, true, true, false);
    upgrader.Build();
    const upgraded = upgrader.Shape();
    const solidBuilder = new oc.BRepBuilderAPI_MakeSolid_1();
    solidBuilder.Add(oc.TopoDS.Shell_1(upgraded));
    const solid = solidBuilder.Solid();
    readShape.delete();
    upgrader.delete();
    solidBuilder.delete();
    reader.delete();
    return solid;
  }
  oc.FS.unlink('/' + filename);
  readShape.delete();
  reader.delete();
  throw new Error('Failed to import STL file: reader could not parse the input data');
}

/**
 * Imports shapes from IGES data.
 */
export function importIGES(oc: OpenCascadeInstance, data: string | ArrayBuffer): OcShape[] {
  const filename = uniqueIOFilename('_import', 'iges');
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  oc.FS.writeFile('/' + filename, buffer);

  const reader = new oc.IGESControl_Reader_1();
  const status = reader.ReadFile(filename);

  if (status === oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    oc.FS.unlink('/' + filename);
    const progress = new oc.Message_ProgressRange_1();
    reader.TransferRoots(progress);
    progress.delete();
    const shape = reader.OneShape();
    reader.delete();
    return [shape];
  }
  oc.FS.unlink('/' + filename);
  reader.delete();
  throw new Error('Failed to import IGES file: reader could not parse the input data');
}
