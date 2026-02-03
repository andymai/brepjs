/**
 * Text Engraving Example
 *
 * Creates a nameplate with engraved text.
 */

import {
  makeBox,
  castShape,
  cutShape,
  textBlueprints,
  loadFont,
  sketchBlueprintOnPlane,
  sketchExtrude,
  translateShape,
  fnMeasureVolume,
  fnExportSTEP,
  unwrap,
  isOk,
} from 'brepjs';

async function main() {
  // Load a font (you'll need to provide a .ttf or .otf file)
  // For this example, we'll skip if no font is available
  console.log('Text Engraving Example');
  console.log('======================\n');

  // Create the nameplate base (100mm x 40mm x 5mm)
  const plateWidth = 100;
  const plateHeight = 40;
  const plateDepth = 5;
  const plate = castShape(makeBox([0, 0, 0], [plateWidth, plateHeight, plateDepth]).wrapped);

  console.log('Created nameplate base:');
  console.log(`  Dimensions: ${plateWidth}mm x ${plateHeight}mm x ${plateDepth}mm`);
  console.log(`  Volume: ${fnMeasureVolume(plate).toFixed(1)} mm³`);

  // Note: Text engraving requires loading a font file
  // This is a demonstration of the workflow

  /*
  // Load font from file
  const fontPath = '/path/to/font.ttf';
  await loadFont('myFont', fontPath);

  // Create text blueprints
  const text = 'BREPJS';
  const fontSize = 12;
  const blueprints = textBlueprints(text, fontSize, { font: 'myFont' });

  // Position text centered on plate
  const textWidth = blueprints.reduce((w, bp) => w + bp.boundingBox.width, 0);
  const offsetX = (plateWidth - textWidth) / 2;
  const offsetY = (plateHeight - fontSize) / 2;

  // Sketch text on top face and extrude downward
  for (const bp of blueprints) {
    const sketch = sketchBlueprintOnPlane(bp, 'XY', plateDepth);
    const letterResult = sketchExtrude(sketch, { height: -2 }); // 2mm deep engraving

    if (isOk(letterResult)) {
      const letter = translateShape(letterResult.value, [offsetX, offsetY, 0]);
      // Cut letter from plate
      const cutResult = cutShape(plate, letter);
      if (isOk(cutResult)) {
        plate = cutResult.value;
      }
    }
  }
  */

  console.log('\nTo engrave text:');
  console.log('1. Load a TTF/OTF font with loadFont()');
  console.log('2. Create text blueprints with textBlueprints()');
  console.log('3. Sketch on the target face');
  console.log('4. Extrude and cut from the base shape');

  // Export the plain plate
  const stepResult = fnExportSTEP(plate);
  if (isOk(stepResult)) {
    console.log(`\nExported nameplate: ${stepResult.value.size} bytes`);
  }
}

main().catch(console.error);
