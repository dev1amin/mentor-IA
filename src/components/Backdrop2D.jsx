// src/components/Backdrop2D.jsx
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame, useLoader } from "@react-three/fiber";
import { Image } from "@react-three/drei";

export function Backdrop2D({
  src = "/images/classroom.png",
  z = -10,
  parallax = 0.12,
  overscan = 1.1,
  alignX = 0,
  alignY = -0.1,
}) {
  const group = useRef();
  const { viewport, camera, size } = useThree();

  const texture = useLoader(THREE.TextureLoader, src);
  const imgW = texture.source?.data?.width || texture.image?.width || 1920;
  const imgH = texture.source?.data?.height || texture.image?.height || 1080;
  const imgAspect = imgW / imgH;

  const memo = useMemo(() => {
    const vp = viewport.getCurrentViewport(camera, new THREE.Vector3(0, 0, z));
    const vpW = vp.width;
    const vpH = vp.height;
    const vpAspect = vpW / vpH;

    let width, height, baseX = 0, baseY = 0;

    if (imgAspect > vpAspect) {
      height = vpH * overscan;
      width  = height * imgAspect;
      const extraW = width - vpW;
      baseX = (extraW / 2) * alignX;
    } else {
      width  = vpW * overscan;
      height = width / imgAspect;
      const extraH = height - vpH;
      baseY = (extraH / 2) * alignY;
    }

    const limitX = (width  - vpW) / 2 - 0.001;
    const limitY = (height - vpH) / 2 - 0.001;

    return {
      scale: [width, height, 1],
      baseOffset: new THREE.Vector3(
        THREE.MathUtils.clamp(baseX, -limitX, limitX),
        THREE.MathUtils.clamp(baseY, -limitY, limitY),
        0
      ),
      limits: { limitX, limitY },
    };
  }, [viewport, camera, z, size.width, size.height, imgAspect, overscan, alignX, alignY]);

  // Parallax apenas no X (Y travado)
  useFrame((state, dt) => {
    if (!group.current) return;

    const targetX = memo.baseOffset.x + -state.pointer.x * parallax;
    const clampedX = THREE.MathUtils.clamp(targetX, -memo.limits.limitX, memo.limits.limitX);

    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, clampedX, 3, dt);
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, memo.baseOffset.y, 10, dt); // travado
  });

  return (
    <group ref={group}>
      <Image url={src} position={[0, 0, z]} scale={memo.scale} toneMapped={false} />
    </group>
  );
}