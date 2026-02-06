import { useThree } from '@react-three/fiber';
import { useCallback } from 'react';

export function useCameraReset() {
  const { camera, controls } = useThree();

  return useCallback(() => {
    camera.position.set(40, 30, 40);
    camera.lookAt(0, 0, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drei controls type
    (controls as any)?.target?.set(0, 0, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (controls as any)?.update?.();
  }, [camera, controls]);
}
