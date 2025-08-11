// App.jsx
import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Experience } from "./components/Experience";
import { UI } from "./components/UI";
import { useState } from "react";
import ChatDock from "./components/ChatDock";

function App() {
  const [isAvatarSelected, setIsAvatarSelected] = useState(
    localStorage.getItem("isAvatarSelected") === "true"
  );

  // Renderiza a tela de seleção apenas antes de escolher o avatar.
  if (!isAvatarSelected) {
    return (
      <>
        <Loader className="loader" />
        <Leva hidden />
        <UI
          isAvatarSelected={isAvatarSelected}
          setIsAvatarSelected={setIsAvatarSelected}
        />
      </>
    );
  }

  // Depois de escolher o avatar: layout 50/50 (Canvas em cima, Chat embaixo)
  return (
    <>
      <Loader className="loader" />
      <Leva hidden />

      <div className="split-root">
        {/* metade de cima: Avatar/Canvas */}
        <div className="stage">
          <Canvas className="stage-canvas" shadows camera={{ position: [0, 0, 1], fov: 30 }}>
            <Experience />
          </Canvas>
        </div>

        {/* metade de baixo: Chat (um único) */}
        <div className="chat-half">
          <div className="chat-dock">
            <ChatDock />
          </div>
        </div>
      </div>
    </>
  );
}

export default App;