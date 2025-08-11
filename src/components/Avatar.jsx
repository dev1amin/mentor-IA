// Avatar.jsx
import { useAnimations, useGLTF, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { button, useControls } from "leva";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";
import { Lipsync, VISEMES } from "wawa-lipsync";

const lipsyncManager = new Lipsync();

// ===== DEBUG FLAGS =====
const DEBUG_SHOW_BUTTON_DESKTOP = false;      // true para testar o botão no desktop
const DEBUG_ATTACH_NATIVE_CONTROLS = false;   // true para ver o player nativo

// ===== Expressões =====
const facialExpressions = {
  default: { browInnerUp: 0.1, eyeSquintLeft: 0.22, eyeSquintRight: 0.24, noseSneerLeft: 0.08, noseSneerRight: 0.07, mouthPressLeft: 0.02, mouthPressRight: 0.02 },
  smile:   { browInnerUp: 0.12, eyeSquintLeft: 0.24, eyeSquintRight: 0.26, noseSneerLeft: 0.08, noseSneerRight: 0.07, mouthPressLeft: 0.02, mouthPressRight: 0.02 },
  funnyFace: { jawLeft: 0.4, mouthPucker: 0.35, noseSneerLeft: 0.5, noseSneerRight: 0.2, mouthLeft: 0.6, eyeLookUpLeft: 0.6, eyeLookUpRight: 0.6, cheekPuff: 0.5, mouthDimpleLeft: 0.3, mouthRollLower: 0.25, mouthSmileLeft: 0.28, mouthSmileRight: 0.28 },
  sad: { mouthFrownLeft: 0.6, mouthFrownRight: 0.6, mouthShrugLower: 0.5, browInnerUp: 0.28, eyeSquintLeft: 0.45, eyeSquintRight: 0.47, eyeLookDownLeft: 0.35, eyeLookDownRight: 0.35, jawForward: 0.6 },
  surprised: { eyeWideLeft: 0.35, eyeWideRight: 0.35, jawOpen: 0.22, mouthFunnel: 0.6, browInnerUp: 0.6 },
  angry: { browDownLeft: 0.65, browDownRight: 0.65, eyeSquintLeft: 0.7, eyeSquintRight: 0.7, jawForward: 0.6, jawLeft: 0.6, mouthShrugLower: 0.6, noseSneerLeft: 0.7, noseSneerRight: 0.35, eyeLookDownLeft: 0.12, eyeLookDownRight: 0.12, cheekSquintLeft: 0.7, cheekSquintRight: 0.7, mouthClose: 0.18, mouthFunnel: 0.45, mouthDimpleRight: 0.7 },
  crazy: { browInnerUp: 0.6, jawForward: 0.7, noseSneerLeft: 0.38, noseSneerRight: 0.34, eyeLookDownLeft: 0.28, eyeLookUpRight: 0.3, eyeLookInLeft: 0.7, eyeLookInRight: 0.7, jawOpen: 0.65, mouthDimpleLeft: 0.6, mouthDimpleRight: 0.6, mouthStretchLeft: 0.2, mouthStretchRight: 0.2, mouthSmileLeft: 0.38, mouthSmileRight: 0.32, tongueOut: 0.6 },
};

let setupMode = false;

// iOS / iPadOS
const isIOS = () => {
  const ua = navigator.userAgent || "";
  const iOSLike = /iPad|iPhone|iPod/.test(ua);
  const iPadOS13Plus = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSLike || iPadOS13Plus;
};

// Lipsync params
const LIP_MAX = 0.55;
const RISE_VOWEL = 0.12;
const RISE_CONS = 0.18;
const DECAY_VOWEL = 0.08;
const DECAY_CONS = 0.12;

export function Avatar(props) {
  const selectedAvatar = localStorage.getItem("selectedAvatar");
  if (!selectedAvatar) return null;

  const avatarGLB = `/models/${selectedAvatar}.glb`;
  const animationsGLB = `/models/animations-${selectedAvatar}.glb`;

  const [showPlayButton, setShowPlayButton] = useState(false);
  const playTimeoutRef = useRef(null);

  const { nodes, materials, scene } = useGLTF(avatarGLB);
  const { message, onMessagePlayed, setLoading, setButtonsDisabled } = useChat();

  const audioRef = useRef(null);
  const connectedRef = useRef(false);
  const [animation, setAnimation] = useState("Idle");
  const blobUrlRef = useRef(null);          // revogar blobs antigos
  const lastHandledUuidRef = useRef(null);  // evita duplicar no StrictMode
  const lastAppliedSrcRef = useRef("");     // evita reiniciar o mesmo áudio

  // ===== bridge: ouve mensagens vindas do ChatDock (postMessage)
  const [externalMsg, setExternalMsg] = useState(null);
  useEffect(() => {
    const onMsg = (ev) => {
      if (ev?.data?.type === "avatarMessage" && ev.data.data) {
        setExternalMsg(ev.data.data); // { uuid, text, audioUrl, avatar, ... }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Converte data: para blob:
  const ensurePlayableSrc = async (src) => {
    if (!src || !src.startsWith("data:")) return src;
    try {
      if (src.startsWith("data:audio/mp3")) {
        src = src.replace("data:audio/mp3", "data:audio/mpeg");
      }
      const res = await fetch(src);
      const blobRaw = await res.blob();
      const mime = blobRaw.type || "audio/mpeg";
      const buf = await blobRaw.arrayBuffer();
      const blob = new Blob([buf], { type: mime === "audio/mp3" ? "audio/mpeg" : mime });
      const url = URL.createObjectURL(blob);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = url;
      return url;
    } catch {
      return src;
    }
  };

  const resumeAudioContextIfNeeded = async () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = lipsyncManager.audioContext || lipsyncManager.context || window.__wawaAudioCtx || new Ctx();
      window.__wawaAudioCtx = ctx;
      if (ctx.state === "suspended") await ctx.resume();
    } catch {}
  };

  const tryConnectToDestination = () => {
    try {
      const ctx =
        lipsyncManager.audioContext ||
        lipsyncManager.context ||
        lipsyncManager._audioContext ||
        lipsyncManager._context ||
        null;

      const analyser = lipsyncManager.analyser || lipsyncManager._analyser || null;
      const source =
        lipsyncManager.sourceNode ||
        lipsyncManager.source ||
        lipsyncManager.mediaElementSource ||
        lipsyncManager._sourceNode ||
        lipsyncManager._source ||
        null;

      if (ctx) {
        if (analyser?.connect) { try { analyser.connect(ctx.destination); } catch {} }
        if (source?.connect)   { try { source.connect(ctx.destination);   } catch {} }
      }
    } catch {}
  };

  const handleUserPlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      await resumeAudioContextIfNeeded();
      if (audio.readyState < 3) {
        await new Promise((resolve, reject) => {
          const ok = () => { cleanup(); resolve(); };
          const err = () => { cleanup(); reject(); };
          const cleanup = () => {
            audio.removeEventListener("canplaythrough", ok);
            audio.removeEventListener("error", err);
          };
          audio.addEventListener("canplaythrough", ok, { once: true });
          audio.addEventListener("error", err, { once: true });
          try { audio.load(); } catch {}
        });
      }
      audio.muted = false;
      audio.volume = 1;
      if (audio.paused) await audio.play();  // evita replay
      setShowPlayButton(false);
      setAnimation("Talking_1");
    } catch {
      setShowPlayButton(true);
    }
  };

  const setFacialExpression = (expression) => {
    if (expression && facialExpressions[expression]) {
      Object.entries(facialExpressions[expression]).forEach(([target, value]) => {
        lerpMorphTarget(target, value, 0.1);
      });
    } else {
      Object.keys(facialExpressions.default).forEach((key) => {
        lerpMorphTarget(key, 0, 0.1);
      });
    }
  };

  const resetFacialExpressions = () => {
    Object.values(VISEMES).forEach((viseme) => {
      lerpMorphTarget(viseme, 0, 0.15);
    });
    setFacialExpression("default");
  };

  // ===== efeito principal: processa tanto message (hook) quanto externalMsg (ChatDock)
  useEffect(() => {
    (async () => {
      const payload = externalMsg || message; // prioridade ao que vem do ChatDock
      if (!payload) { setAnimation("Idle"); return; }

      // dedup por uuid (evita tocar 2x no StrictMode)
      const uuid = payload.uuid || `${payload.text || payload.output || ""}`.slice(0, 64);
      if (uuid && lastHandledUuidRef.current === uuid) return;
      lastHandledUuidRef.current = uuid;

      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
      setLoading?.(false);
      setButtonsDisabled?.(true);

      setFacialExpression(payload.facialExpression || "default");

      // cria <audio> uma vez
      if (!audioRef.current) {
        const el = new Audio();
        el.preload = "auto";
        el.playsInline = true;
        el.muted = false;
        el.volume = 1;
        el.loop = false;
        if (DEBUG_ATTACH_NATIVE_CONTROLS) el.controls = true;
        el.style.position = "fixed";
        el.style.left = DEBUG_ATTACH_NATIVE_CONTROLS ? "16px" : "-9999px";
        el.style.bottom = "16px";
        document.body.appendChild(el);
        audioRef.current = el;
      }

      const audio = audioRef.current;

      // prepara src
      let nextSrc = payload.audio || payload.audioUrl || "";
      if (nextSrc.startsWith("data:audio/mp3")) {
        nextSrc = nextSrc.replace("data:audio/mp3", "data:audio/mpeg");
      }
      nextSrc = await ensurePlayableSrc(nextSrc);

      // só troca se mudou
      if (lastAppliedSrcRef.current !== nextSrc) {
        try { audio.pause(); } catch {}
        audio.src = nextSrc || "";          // se vazio, ainda anima só com visemas nulos
        lastAppliedSrcRef.current = nextSrc;
        try { audio.load(); } catch {}
      }

      // lipsync (uma única vez)
      if (!connectedRef.current && nextSrc) {
        try {
          lipsyncManager.connectAudio(audio);
          connectedRef.current = true;
        } catch {}
      }
      tryConnectToDestination();

      audio.onplay = () => setAnimation(payload.animation || "Talking_1");

      audio.onended = () => {
        setAnimation("Idle");
        resetFacialExpressions();
        setButtonsDisabled?.(false);
        setLoading?.(false);
        onMessagePlayed?.();
      };

      audio.onerror = () => {
        setShowPlayButton(true);
        setButtonsDisabled?.(false);
        setLoading?.(false);
      };

      // autoplay (exceto iOS)
      if (isIOS() || DEBUG_SHOW_BUTTON_DESKTOP) {
        setShowPlayButton(true);
        playTimeoutRef.current = setTimeout(() => {
          setShowPlayButton(false);
          setButtonsDisabled?.(false);
          setLoading?.(false);
        }, 120000);
      } else {
        try {
          if (audio.paused && nextSrc) await audio.play();
          setShowPlayButton(false);
        } catch {
          setShowPlayButton(true);
        }
      }
    })();

    return () => {
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    };
  }, [externalMsg, message, setButtonsDisabled, setLoading, onMessagePlayed]);

  // ===== animações do glTF
  const { animations } = useGLTF(animationsGLB);
  const group = useRef();
  const { actions, mixer } = useAnimations(animations, group);

  useEffect(() => {
    const fallback = animations[0]?.name || "Idle";
    const target = actions[animation] || actions[fallback];
    if (target) target.reset().fadeIn(mixer.stats?.actions?.inUse === 0 ? 0 : 0.5).play();
    return () => target && target.fadeOut(0.5);
  }, [animation, actions, animations, mixer]);

  // ===== morph targets / visemas
  const lerpMorphTarget = (target, value, speed = 0.1) => {
    scene.traverse((child) => {
      if (child.isSkinnedMesh && child.morphTargetDictionary) {
        const index = child.morphTargetDictionary[target];
        if (index === undefined || child.morphTargetInfluences[index] === undefined) return;
        child.morphTargetInfluences[index] = THREE.MathUtils.lerp(
          child.morphTargetInfluences[index],
          value,
          speed
        );
      }
    });
  };

  const [blink, setBlink] = useState(false);
  const [winkLeft, setWinkLeft] = useState(false);
  const [winkRight, setWinkRight] = useState(false);

  useFrame(() => {
    lerpMorphTarget("eyeBlinkLeft", blink || winkLeft ? 1 : 0, 0.5);
    lerpMorphTarget("eyeBlinkRight", blink || winkRight ? 1 : 0, 0.5);

    lipsyncManager.processAudio();
    if (setupMode) return;

    const viseme = lipsyncManager.viseme;
    const state = lipsyncManager.state;

    if (viseme) {
      lerpMorphTarget(viseme, LIP_MAX, state === "vowel" ? RISE_VOWEL : RISE_CONS);
    }

    Object.values(VISEMES).forEach((value) => {
      if (value === viseme) return;
      lerpMorphTarget(value, 0, state === "vowel" ? DECAY_VOWEL : DECAY_CONS);
    });
  });

  useEffect(() => {
    let blinkTimeout;
    const nextBlink = () => {
      blinkTimeout = setTimeout(() => {
        setBlink(true);
        setTimeout(() => {
          setBlink(false);
          nextBlink();
        }, 200);
      }, THREE.MathUtils.randInt(1200, 5200));
    };
    nextBlink();
    return () => clearTimeout(blinkTimeout);
  }, []);

  useControls("FacialExpressions", {
    winkLeft: button(() => { setWinkLeft(true); setTimeout(() => setWinkLeft(false), 300); }),
    winkRight: button(() => { setWinkRight(true); setTimeout(() => setWinkRight(false), 300); }),
    animation: { value: animation, options: [], onChange: (v) => setAnimation(v) },
  });

  // cleanup blobs ao desmontar
  useEffect(() => {
    return () => {
      try { audioRef.current?.pause(); } catch {}
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  return (
    <>
      <group ref={group} {...props} dispose={null}>
        {selectedAvatar === "carol" && (
          <>
            <primitive object={nodes.Hips} />
            <skinnedMesh name="EyeLeft" geometry={nodes.EyeLeft.geometry} material={materials.Wolf3D_Eye} skeleton={nodes.EyeLeft.skeleton} morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary} morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences} />
            <skinnedMesh name="EyeRight" geometry={nodes.EyeRight.geometry} material={materials.Wolf3D_Eye} skeleton={nodes.EyeRight.skeleton} morphTargetDictionary={nodes.EyeRight.morphTargetDictionary} morphTargetInfluences={nodes.EyeRight.morphTargetInfluences} />
            <skinnedMesh geometry={nodes.Wolf3D_Body.geometry} material={materials.Wolf3D_Body} skeleton={nodes.Wolf3D_Body.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Glasses.geometry} material={materials.Wolf3D_Glasses} skeleton={nodes.Wolf3D_Glasses.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Hair.geometry} material={materials.Wolf3D_Hair} skeleton={nodes.Wolf3D_Hair.skeleton} />
            <skinnedMesh name="Wolf3D_Head" geometry={nodes.Wolf3D_Head.geometry} material={materials.Wolf3D_Skin} skeleton={nodes.Wolf3D_Head.skeleton} morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary} morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences} />
            <skinnedMesh geometry={nodes.Wolf3D_Outfit_Bottom.geometry} material={materials.Wolf3D_Outfit_Bottom} skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Outfit_Footwear.geometry} material={materials.Wolf3D_Outfit_Footwear} skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Outfit_Top.geometry} material={materials.Wolf3D_Outfit_Top} skeleton={nodes.Wolf3D_Outfit_Top.skeleton} />
            <skinnedMesh name="Wolf3D_Teeth" geometry={nodes.Wolf3D_Teeth.geometry} material={materials.Wolf3D_Teeth} skeleton={nodes.Wolf3D_Teeth.skeleton} morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary} morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences} />
          </>
        )}
        {selectedAvatar === "david" && (
          <>
            <primitive object={nodes.Hips} />
            <skinnedMesh name="EyeLeft" geometry={nodes.EyeLeft.geometry} material={materials.Wolf3D_Eye} skeleton={nodes.EyeLeft.skeleton} morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary} morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences} />
            <skinnedMesh name="EyeRight" geometry={nodes.EyeRight.geometry} material={materials.Wolf3D_Eye} skeleton={nodes.EyeRight.skeleton} morphTargetDictionary={nodes.EyeRight.morphTargetDictionary} morphTargetInfluences={nodes.EyeRight.morphTargetInfluences} />
            <skinnedMesh name="Wolf3D_Head" geometry={nodes.Wolf3D_Head.geometry} material={materials.Wolf3D_Skin} skeleton={nodes.Wolf3D_Head.skeleton} morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary} morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences} />
            <skinnedMesh name="Wolf3D_Teeth" geometry={nodes.Wolf3D_Teeth.geometry} material={materials.Wolf3D_Teeth} skeleton={nodes.Wolf3D_Teeth.skeleton} morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary} morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences} />
            <skinnedMesh geometry={nodes.Wolf3D_Body.geometry} material={materials.Wolf3D_Body} skeleton={nodes.Wolf3D_Body.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Outfit_Bottom.geometry} material={materials.Wolf3D_Outfit_Bottom} skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Outfit_Footwear.geometry} material={materials.Wolf3D_Outfit_Footwear} skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Outfit_Top.geometry} material={materials.Wolf3D_Outfit_Top} skeleton={nodes.Wolf3D_Outfit_Top.skeleton} />
          </>
        )}
        {selectedAvatar === "ryan" && (
          <>
            <primitive object={nodes.Hips} />
            <skinnedMesh name="EyeLeft" geometry={nodes.EyeLeft.geometry} material={materials.Wolf3D_Eye} skeleton={nodes.EyeLeft.skeleton} morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary} morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences} />
            <skinnedMesh name="EyeRight" geometry={nodes.EyeRight.geometry} material={materials.Wolf3D_Eye} skeleton={nodes.EyeRight.skeleton} morphTargetDictionary={nodes.EyeRight.morphTargetDictionary} morphTargetInfluences={nodes.EyeRight.morphTargetInfluences} />
            <skinnedMesh name="Wolf3D_Head" geometry={nodes.Wolf3D_Head.geometry} material={materials.Wolf3D_Skin} skeleton={nodes.Wolf3D_Head.skeleton} morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary} morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences} />
            <skinnedMesh name="Wolf3D_Teeth" geometry={nodes.Wolf3D_Teeth.geometry} material={materials.Wolf3D_Teeth} skeleton={nodes.Wolf3D_Teeth.skeleton} morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary} morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences} />
            <skinnedMesh geometry={nodes.Wolf3D_Hair.geometry} material={materials.Wolf3D_Hair} skeleton={nodes.Wolf3D_Hair.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Body.geometry} material={materials.Wolf3D_Body} skeleton={nodes.Wolf3D_Body.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Outfit_Bottom.geometry} material={materials.Wolf3D_Outfit_Bottom} skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Outfit_Footwear.geometry} material={materials.Wolf3D_Outfit_Footwear} skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton} />
            <skinnedMesh geometry={nodes.Wolf3D_Outfit_Top.geometry} material={materials.Wolf3D_Outfit_Top} skeleton={nodes.Wolf3D_Outfit_Top.skeleton} />
          </>
        )}
      </group>

      {/* Botão (iOS e desktop p/ debug) */}
      {showPlayButton && (
        <Html position={[0, 1, 0]}>
          <div style={playButtonStyle}>
            <button onClick={handleUserPlay}>
              <img
                className="botao-ios"
                src="https://i.imgur.com/wz4S77M.png"
                alt="Play"
                style={{ width: "100%", height: "20%", zIndex: 999999, transform: "translate(-50px, -200px)" }}
              />
            </button>
          </div>
        </Html>
      )}
    </>
  );
}

const playButtonStyle = {
  backgroundColor: "transparent",
  border: "none",
  fontSize: "2rem",
  cursor: "pointer",
  width: "100%",
  height: "100%",
};

useGLTF.preload(`/models/carol.glb`);
useGLTF.preload(`/models/animations-carol.glb`);
useGLTF.preload(`/models/david.glb`);
useGLTF.preload(`/models/animations-david.glb`);
useGLTF.preload(`/models/ryan.glb`);
useGLTF.preload(`/models/animations-ryan.glb`);