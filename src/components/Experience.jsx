// src/components/Experience.jsx
import { CameraControls, ContactShadows, Environment } from "@react-three/drei";
import { Suspense, useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";
import { Avatar } from "./Avatar";
import { Backdrop2D } from "./Backdrop2D";

export const Experience = () => {
  const cameraControls = useRef();
  const { cameraZoomed } = useChat();
  const selectedAvatar = localStorage.getItem("selectedAvatar") || "carol";

  useEffect(() => {
    if (!cameraControls.current) return;
    if (selectedAvatar === "ryan") {
      cameraControls.current.setLookAt(0, 1.5, 2.1, 0, 1.5, 0);
    } else {
      cameraControls.current.setLookAt(0, 2, 5, 0, 1.5, 0);
    }
  }, [selectedAvatar]);

  useEffect(() => {
    if (!cameraControls.current) return;
    if (cameraZoomed) {
      if (selectedAvatar === "ryan") {
        cameraControls.current.setLookAt(0, 1.5, 1.8, 0, 1.5, 0, true);
      } else {
        cameraControls.current.setLookAt(0, 1.5, 1.8, 0, 1.4, 0, true);
      }
    } else {
      cameraControls.current.setLookAt(0, 2.2, 5, 0, 1.0, 0, true);
    }
  }, [cameraZoomed, selectedAvatar]);

  return (
    <>
      {/* cor só de segurança caso o parallax mostre borda (com overscan não deve) */}
      <color attach="background" args={["#0b0b0b"]} />

      <CameraControls ref={cameraControls} maxDistance={1} minDistance={1.8} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 4, 4]} intensity={1.1} castShadow />

      {/* agora cobre a tela toda */}
      <Backdrop2D
        src="/images/classroom.png"
        z={-14}
        parallax={1.5}
        overscan={1.2}
        alignX={0}
        alignY={-0.15}
      />

      <Suspense>
        <Avatar />
      </Suspense>

      <ContactShadows opacity={0.55} blur={2.5} far={6} scale={6} />
    </>
  );
};