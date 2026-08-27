export default function SceneLighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#1a1a2e', 0.65]} position={[0, 0, 1]} />
      <directionalLight position={[-50, -80, 60]} intensity={0.85} color="#fff8f0" />
      <directionalLight position={[40, -30, -40]} intensity={0.15} color="#e0e8ff" />
    </>
  );
}
