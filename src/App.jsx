// src/App.jsx
import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { useEffect, useState } from "react";
import { Experience } from "./components/Experience";
import ChatDock from "./components/ChatDock"; // ✅ default import

function App() {
  const [isAvatarSelected, setIsAvatarSelected] = useState(true);

  // Garante defaults em produção/preview (storage limpo)
  useEffect(() => {
    if (!localStorage.getItem("selectedAvatar")) {
      localStorage.setItem("selectedAvatar", "carol"); // fallback seguro
    }
    if (localStorage.getItem("isAvatarSelected") !== "true") {
      localStorage.setItem("isAvatarSelected", "true");
    }
    setIsAvatarSelected(true);
  }, []);

  return (
    <>
      <Loader className="loader" />
      <Leva hidden />

      <div className="mentor-root">
        <div className="stage">
          <Canvas className="stage-canvas" shadows camera={{ position: [0, 0, 1], fov: 30 }}>
            <Experience />
          </Canvas>
          {/* fade entre stage e chat (se você já tem .stage-fade no CSS, mantém) */}
          <div className="stage-fade" />
        </div>

        <div className="dock">
          {/* ChatDock não depende de isAvatarSelected; deixa sempre montado */}
          <ChatDock />
        </div>
      </div>
    </>
  );
}

export default App;