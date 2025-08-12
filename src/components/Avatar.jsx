// src/components/Avatar.jsx
import { useAnimations, useGLTF, Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { button, useControls } from "leva";
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";
import { Lipsync, VISEMES } from "../lib/wawa-lipsync.js";

const lipsyncManager = new Lipsync({ fftSize: 1024, historySize: 8, smoothing: 0.5 });

// ===== DEBUG FLAGS =====
const DEBUG_SHOW_BUTTON_DESKTOP = false;
const DEBUG_ATTACH_NATIVE_CONTROLS = false;

// ===== Expressões (não mexem em boca) =====
const facialExpressions = {
  smile: { browInnerUp: 0.12, eyeSquintLeft: 0.24, eyeSquintRight: 0.26, noseSneerLeft: 0.08, noseSneerRight: 0.07 },
};

// iOS / iPadOS
const isIOS = () => {
  const ua = navigator.userAgent || "";
  const iOSLike = /iPad|iPhone|iPod/.test(ua);
  const iPadOS13Plus = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOSLike || iPadOS13Plus;
};

// ===== Ganhos / velocidades (menos exagero)
const AMP_MAX      = 0.70;  // teto global menor
const MIN_OPEN     = 0.05;  // mínima quando há fala
const LEVEL_GATE   = 0.060; // gate mais alto = menos chiado mexendo
const RISE_ACTIVE  = 0.22;  // subida do viseme ativo
const DECAY_OTHERS = 0.20;  // queda dos demais
const ZERO_SPEED   = 0.30;  // velocidade para zerar no silêncio

// Limites por alvo (evita “boca subir demais”)
const CAPS = {
  jawOpen: 0.55,
  mouthFunnel: 0.45,
  mouthPucker: 0.50,
  mouthClose: 0.60,
  mouthStretchLeft: 0.22,
  mouthStretchRight: 0.22,
  tongueOut: 0.25,
  mouthDimpleLeft: 0.20,
  mouthDimpleRight: 0.20,
};

// Mapa wawa-viseme -> blendshapes Wolf3D (pesos base já suaves)
const V2W = {
  [VISEMES.sil]: {},
  // Vogais (menos agressivas)
  [VISEMES.aa]: { jawOpen: 0.85, mouthFunnel: 0.12 },               // “a”
  [VISEMES.E]:  { jawOpen: 0.50, mouthFunnel: 0.18 },               // “é/ê”
  [VISEMES.I]:  { mouthClose: 0.70, mouthStretchLeft: 0.15, mouthStretchRight: 0.15, jawOpen: 0.06 }, // “i”
  [VISEMES.O]:  { mouthFunnel: 0.60, jawOpen: 0.22 },               // “ó/ô”
  [VISEMES.U]:  { mouthPucker: 0.65, jawOpen: 0.12 },               // “u”
  // Fricativas / plosivas (bem discretas, sem “shrug”)
  [VISEMES.FF]: { mouthClose: 0.25 },
  [VISEMES.TH]: { tongueOut: 0.30, jawOpen: 0.10, mouthClose: 0.15 },
  [VISEMES.PP]: { mouthClose: 0.50 },
  [VISEMES.DD]: { jawOpen: 0.18, mouthClose: 0.12 },
  [VISEMES.kk]: { jawOpen: 0.16, mouthClose: 0.12 },
  [VISEMES.CH]: { mouthClose: 0.25, jawOpen: 0.12 },
  [VISEMES.SS]: { mouthClose: 0.22 },
  [VISEMES.nn]: { mouthClose: 0.18 },
  [VISEMES.RR]: { mouthDimpleLeft: 0.15, mouthDimpleRight: 0.15 },
};

// Chaves de boca para zerar
const MOUTH_KEYS = [
  "mouthClose","mouthFunnel","mouthPucker",
  "mouthSmileLeft","mouthSmileRight",
  "mouthPressLeft","mouthPressRight",
  "mouthDimpleLeft","mouthDimpleRight",
  "mouthShrugLower","mouthShrugUpper",
  "mouthRollLower","mouthRollUpper",
  "mouthStretchLeft","mouthStretchRight",
  "jawOpen","jawLeft","jawRight","jawForward",
  "noseSneerLeft","noseSneerRight",
  "cheekSquintLeft","cheekSquintRight","tongueOut",
];

export function Avatar(props) {
  const selectedAvatar = localStorage.getItem("selectedAvatar");
  if (!selectedAvatar) return null;

  const avatarGLB = `/models/${selectedAvatar}.glb`;
  const animationsGLB = `/models/animations-${selectedAvatar}.glb`;

  const [showPlayButton, setShowPlayButton] = useState(false);
  const playTimeoutRef = useRef(null);
  const endWatchdogRef = useRef(null);

  const { nodes, materials, scene } = useGLTF(avatarGLB);
  const { message, onMessagePlayed, setLoading, setButtonsDisabled } = useChat();

  const audioRef = useRef(null);
  const connectedRef = useRef(false);
  const [animation, setAnimation] = useState("Idle");
  const blobUrlRef = useRef(null);
  const lastHandledUuidRef = useRef(null);
  const lastAppliedSrcRef = useRef("");

  // bridge: postMessage do ChatDock
  const [externalMsg, setExternalMsg] = useState(null);
  useEffect(() => {
    const onMsg = (ev) => {
      if (ev?.data?.type === "avatarMessage" && ev.data.data) {
        setExternalMsg(ev.data.data);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // util lerp morph
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

  const zeroMouth = (speed = ZERO_SPEED) => MOUTH_KEYS.forEach((k) => lerpMorphTarget(k, 0, speed));
  const setNeutralFace = () => zeroMouth();

  const setFacialExpression = (expression) => {
    if (expression && facialExpressions[expression]) {
      Object.entries(facialExpressions[expression]).forEach(([t, v]) => lerpMorphTarget(t, v, 0.12));
    } else {
      setNeutralFace();
    }
  };

  const resetFacialExpressions = () => {
    setNeutralFace();
  };

  // DataURL -> BlobURL
  const ensurePlayableSrc = async (src) => {
    if (!src || !src.startsWith("data:")) return src;
    try {
      if (src.startsWith("data:audio/mp3")) src = src.replace("data:audio/mp3", "data:audio/mpeg");
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
      const ctx = lipsyncManager.audioContext || window.__wawaAudioCtx || new Ctx();
      window.__wawaAudioCtx = ctx;
      if (ctx.state === "suspended") await ctx.resume();
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
      if (audio.paused) await audio.play();
      setShowPlayButton(false);
      setAnimation("Talking_1");
    } catch {
      setShowPlayButton(true);
    }
  };

  // principal: processa mensagens
  useEffect(() => {
    (async () => {
      const payload = externalMsg || message;
      if (!payload) { setAnimation("Idle"); return; }

      const uuid = payload.uuid || `${payload.text || payload.output || ""}`.slice(0, 64);
      if (uuid && lastHandledUuidRef.current === uuid) return;
      lastHandledUuidRef.current = uuid;

      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
      if (endWatchdogRef.current) clearTimeout(endWatchdogRef.current);

      setLoading?.(false);
      setButtonsDisabled?.(true);

      setFacialExpression(payload.facialExpression);

      if (!audioRef.current) {
        const el = new Audio();
        el.preload = "auto";
        el.playsInline = true;
        el.muted = false;
        el.volume = 1;
        el.loop = false;
        el.crossOrigin = "anonymous";
        if (DEBUG_ATTACH_NATIVE_CONTROLS) el.controls = true;
        el.style.position = "fixed";
        el.style.left = DEBUG_ATTACH_NATIVE_CONTROLS ? "16px" : "-9999px";
        el.style.bottom = "16px";
        document.body.appendChild(el);
        audioRef.current = el;
      }

      const audio = audioRef.current;

      let nextSrc = payload.audio || payload.audioUrl || "";
      if (nextSrc.startsWith("data:audio/mp3")) {
        nextSrc = nextSrc.replace("data:audio/mp3", "data:audio/mpeg");
      }
      nextSrc = await ensurePlayableSrc(nextSrc);

      if (!nextSrc) {
        setAnimation("Idle");
        resetFacialExpressions();
        setButtonsDisabled?.(false);
        setLoading?.(false);
        onMessagePlayed?.();
        return;
      }

      if (lastAppliedSrcRef.current !== nextSrc) {
        try { audio.pause(); } catch {}
        audio.src = nextSrc;
        lastAppliedSrcRef.current = nextSrc;
        try { audio.load(); } catch {}
      }

      if (!connectedRef.current) {
        try {
          lipsyncManager.connectAudio(audio);
          connectedRef.current = true;
        } catch {}
      }

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
        resetFacialExpressions();
        setAnimation("Idle");
      };

      endWatchdogRef.current = setTimeout(() => {
        if (!audio.paused) return;
        setAnimation("Idle");
        resetFacialExpressions();
        setButtonsDisabled?.(false);
        setLoading?.(false);
        onMessagePlayed?.();
      }, 45000);

      if (isIOS() || DEBUG_SHOW_BUTTON_DESKTOP) {
        setShowPlayButton(true);
        playTimeoutRef.current = setTimeout(() => {
          setShowPlayButton(false);
          setButtonsDisabled?.(false);
          setLoading?.(false);
        }, 120000);
      } else {
        try {
          await resumeAudioContextIfNeeded();
          if (audio.paused) await audio.play();
          setShowPlayButton(false);
        } catch {
          setShowPlayButton(true);
        }
      }
    })();

    return () => {
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
      if (endWatchdogRef.current) clearTimeout(endWatchdogRef.current);
    };
  }, [externalMsg, message, setButtonsDisabled, setLoading, onMessagePlayed]);

  // ===== animações glTF
  const { animations } = useGLTF(animationsGLB);
  const group = useRef();
  const { actions, mixer } = useAnimations(animations, group);

  useEffect(() => {
    const fallback = animations[0]?.name || "Idle";
    const target = actions[animation] || actions[fallback];
    if (target) target.reset().fadeIn(mixer.stats?.actions?.inUse === 0 ? 0 : 0.5).play();
    return () => target && target.fadeOut(0.5);
  }, [animation, actions, animations, mixer]);

  // ===== blink / wink + lipsync frame
  const [blink, setBlink] = useState(false);
  const [winkLeft, setWinkLeft] = useState(false);
  const [winkRight, setWinkRight] = useState(false);

  useFrame(() => {
    // Piscar
    lerpMorphTarget("eyeBlinkLeft", blink || winkLeft ? 1 : 0, 0.5);
    lerpMorphTarget("eyeBlinkRight", blink || winkRight ? 1 : 0, 0.5);

    // Processa audio -> viseme
    lipsyncManager.processAudio();

    const v = lipsyncManager.viseme;
    const vol = lipsyncManager.volume || 0;

    // Gate: silêncio => tudo a zero
    if (vol < LEVEL_GATE || v === VISEMES.sil) {
      for (const k of MOUTH_KEYS) lerpMorphTarget(k, 0, ZERO_SPEED);
      return;
    }

    // Amplitude com leve boost + easing (bem mais contido)
    const volBoost = Math.min(1, vol * 1.3);
    const eased = volBoost * volBoost * (3 - 2 * volBoost);
    const ampVowel = MIN_OPEN + (AMP_MAX - MIN_OPEN) * eased;
    const ampCons  = Math.min(0.35, ampVowel * 0.60); // consoantes bem discretas

    // Alvo do viseme atual
    const map = V2W[v] || {};
    const activeKeys = new Set(Object.keys(map));
    const isVowel = (v === VISEMES.aa || v === VISEMES.E || v === VISEMES.I || v === VISEMES.O || v === VISEMES.U);

    // Aplica viseme ativo (com caps por alvo)
    for (const key of activeKeys) {
      const base = map[key];
      const scalar = key === "jawOpen" && isVowel ? Math.min(1, ampVowel * 1.02) : (isVowel ? ampVowel : ampCons);
      const desired = Math.min(CAPS[key] ?? 0.6, base * scalar);
      lerpMorphTarget(key, desired, RISE_ACTIVE);
    }

    // Decai os demais
    for (const key of MOUTH_KEYS) {
      if (activeKeys.has(key)) continue;
      lerpMorphTarget(key, 0, DECAY_OTHERS);
    }
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

  // cleanup blobs
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