export default function SceneLighting() {
  return (
    <>
      <hemisphereLight args={['#fafafa', '#111118', 0.6]} />
      <directionalLight position={[-50, 60, 80]} intensity={0.9} color="#ffffff" />
      <directionalLight position={[40, -40, 30]} intensity={0.25} color="#d4d8f8" />
    </>
  );
}
