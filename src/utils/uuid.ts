export function uuidv(): string {
  return (String([1e7]) + String(-1e3) + String(-4e3) + String(-8e3) + String(-1e11)).replace(
    /[018]/g,
    (c: string) =>
      (
        Number(c) ^
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))
      ).toString(16)
  );
}
