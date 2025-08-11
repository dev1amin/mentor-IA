// App.jsx
import { Loader } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva } from "leva";
import { Experience } from "./components/Experience";
import { UI } from "./components/UI";
import { useState } from "react";

function App() {
  const [isAvatarSelected, setIsAvatarSelected] = useState(
    localStorage.getItem("isAvatarSelected") === "true"
  );

  return (
    <>
      <Loader className="loader" />
      <Leva hidden />
      <UI
        isAvatarSelected={isAvatarSelected}
        setIsAvatarSelected={setIsAvatarSelected}
      />
      {isAvatarSelected && <div className="overlay"></div>}
      <Canvas
        shadows
        camera={{ position: [0, 0, 1], fov: 30 }}
        gl={{ alpha: false }}  // 👈 evita fundo transparente
      >
        <Experience />
      </Canvas>
    </>
  );
}

export default App;