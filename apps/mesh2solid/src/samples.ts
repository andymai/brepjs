export interface Sample {
  readonly file: string;
  readonly title: string;
  readonly detail: string;
}

/** Made by `scripts/genSamples.ts` from parts the package tests convert. All are in millimeters. */
export const SAMPLES: readonly Sample[] = [
  {
    file: 'bracket.stl',
    title: 'Bracket',
    detail: 'CAD export, 1,044 triangles',
  },
  {
    file: 'knob-scan.ply',
    title: 'Scanned knob',
    detail: 'Simulated 3D scan with noise, 37,740 triangles',
  },
  {
    file: 'blob.obj',
    title: 'Organic body',
    detail: 'Freeform surface, 5,120 triangles',
  },
];

export async function fetchSample(sample: Sample): Promise<File> {
  const res = await fetch(`${import.meta.env.BASE_URL}samples/${sample.file}`);
  if (!res.ok) throw new Error(`the server answered ${res.status}`);
  return new File([await res.blob()], sample.file);
}
