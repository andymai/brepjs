export default function SceneLighting() {
  return (
    <>
      <hemisphereLight args={['#ffffff', '#5a5d6e', 0.85]} />
      <ambientLight intensity={0.25} color="#c8ccd6" />
      <directionalLight position={[-50, 60, 80]} intensity={0.75} color="#fff8f0" />
      <directionalLight position={[40, -40, 30]} intensity={0.2} color="#e0e8ff" />
    </>
  );
}
