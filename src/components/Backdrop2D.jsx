// src/components/Backdrop2D.jsx
import React, { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, useFrame, useLoader } from "@react-three/fiber";
import { Image } from "@react-three/drei";

export function Backdrop2D({
  src = "/images/classroom.png",
  z = -10,
  parallax = 0.12,
  overscan = 1.1,     // margem extra
  alignX = 0,         // -1 esq | 0 centro | 1 dir
  alignY = -0.1,      // -1 baixo | 0 centro | 1 topo
}) {
  const group = useRef();
  const { viewport, camera, size } = useThree();

  // Pega aspecto da imagem
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
      // cobre pela ALTURA
      height = vpH * overscan;
      width  = height * imgAspect;
      const extraW = width - vpW;
      baseX = (extraW / 2) * alignX;
    } else {
      // cobre pela LARGURA
      width  = vpW * overscan;
      height = width / imgAspect;
      const extraH = height - vpH;
      baseY = (extraH / 2) * alignY;
    }

    // limites máximos pra nunca revelar borda
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

  // Parallax + clamp
  useFrame((state, dt) => {
    if (!group.current) return;
    const targetX = memo.baseOffset.x + -state.pointer.x * parallax;
    const targetY = memo.baseOffset.y +  state.pointer.y * parallax * 0.6;

    const clampedX = THREE.MathUtils.clamp(targetX, -memo.limits.limitX, memo.limits.limitX);
    const clampedY = THREE.MathUtils.clamp(targetY, -memo.limits.limitY, memo.limits.limitY);

    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, clampedX, 3, dt);
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, clampedY, 3, dt);
  });

  return (
    <group ref={group}>
      <Image url={src} position={[0, 0, z]} scale={memo.scale} toneMapped={false} />
    </group>
  );
}