export default function SceneLighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#1a1a2e', 0.65]} />
      <directionalLight position={[-50, 60, 80]} intensity={0.85} color="#fff8f0" />
      <directionalLight position={[40, -40, 30]} intensity={0.15} color="#e0e8ff" />
    </>
  );
}
