import React, { useState, useEffect, useRef } from "react";
import { useChat } from "../hooks/useChat";

export const UI = ({ hidden, isAvatarSelected, setIsAvatarSelected, ...props }) => {
  const { setMessages, setLoading } = useChat();

  const [selectedAvatar, setSelectedAvatar] = useState(
    localStorage.getItem("selectedAvatar") || "carol"
  );
  const [sessionID, setSessionID] = useState(null);
  const [customerZone, setcustomerZone] = useState(null);
  const [videoExternalId, setvideoExternalId] = useState(null);
  const [vUrl, setvUrl] = useState(null);

  // evita mensagens duplicadas (alguns flows podem reenviar)
  const lastUuidRef = useRef(null);

  const handleAvatarSelection = (avatar) => {
    console.log("[UI] Avatar selecionado:", avatar);
    setSelectedAvatar(avatar);
    setIsAvatarSelected(true);
    localStorage.setItem("selectedAvatar", avatar);
    localStorage.setItem("isAvatarSelected", true);

    // Desbloqueio de áudio no iOS (primeiro toque do usuário)
    const dummyAudio = new Audio();
    const playDummy = () => {
      dummyAudio.play().catch(() => {});
      document.removeEventListener("click", playDummy);
    };
    document.addEventListener("click", playDummy, { once: true });

    // Recarrega para garantir que o canvas e o avatar reiniciem certinho com o novo avatar
    window.location.reload();
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const _sessionID = params.get("id");
    const _vUrl = params.get("vUrl");
    const _customerZone = params.get("customerZone");
    const _videoExternalId = params.get("videoExternalId");

    console.log("[UI] Query params ->", {
      id: _sessionID,
      vUrl: _vUrl,
      customerZone: _customerZone,
      videoExternalId: _videoExternalId,
    });

    if (_sessionID) setSessionID(_sessionID);
    if (_vUrl) setvUrl(_vUrl);
    if (_customerZone) setcustomerZone(_customerZone);
    if (_videoExternalId) setvideoExternalId(_videoExternalId);
  }, []);

  useEffect(() => {
    const handleTypebotMessage = (event) => {
      try {
        console.log("[UI] postMessage recebido:", {
          origin: event.origin,
          dataType: typeof event.data,
          data: event.data,
        });

        const data = event?.data;
        if (!data) {
          console.warn("[UI] postMessage sem data. Ignorando.");
          return;
        }
        if (data.type !== "avatarMessage") {
          // Muita coisa pode mandar postMessage; filtramos pelo nosso tipo
          // console.log("[UI] postMessage ignorado (type != avatarMessage):", data.type);
          return;
        }
        if (!data.data) {
          console.warn("[UI] avatarMessage sem payload (data.data).");
          return;
        }

        const incoming = data.data;
        console.log("[UI] Payload bruto do Typebot:", incoming);

        // Gera uuid local se não veio um
        const uuid =
          incoming.uuid ||
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

        // Evita processar a mesma mensagem duas vezes
        if (lastUuidRef.current === uuid) {
          console.log("[UI] Mensagem duplicada detectada (uuid já processado):", uuid);
          return;
        }
        lastUuidRef.current = uuid;

        // Extrai o áudio: pode vir como audioUrl (Data URL) ou audio (já normalizado)
        const audioUrlRaw = incoming.audio || incoming.audioUrl || "";
        console.log("[UI] audioUrl recebido:", {
          isString: typeof audioUrlRaw === "string",
          length: audioUrlRaw ? audioUrlRaw.length : 0,
          prefix: audioUrlRaw ? audioUrlRaw.slice(0, 32) + "..." : "(vazio)",
          startsWithData: audioUrlRaw ? audioUrlRaw.startsWith("data:") : false,
          startsWithHttp: audioUrlRaw ? audioUrlRaw.startsWith("http") : false,
        });

        if (!audioUrlRaw) {
          console.warn("[UI] Nenhum áudio no payload (audio/audioUrl está vazio).");
        }

        const text = incoming.text || incoming.output || "";
        console.log("[UI] Texto recebido:", text);

        const avatarFromMsg = incoming.avatar || selectedAvatar || "carol";
        console.log("[UI] Avatar (payload -> usado):", incoming.avatar, "->", avatarFromMsg);

        const messageForAvatar = {
          uuid,
          text,
          audio: audioUrlRaw,       // Avatar.jsx usa 'audio' para tocar
          audioUrl: audioUrlRaw,    // redundante, mas útil pra debug
          animation: incoming.animation || "Talking_1",
          facialExpression: incoming.facialExpression || "smile",
          avatar: avatarFromMsg,
        };

        console.log("[UI] Mensagem normalizada pro Avatar.jsx:", messageForAvatar);

        setLoading(false);
        setMessages((prev) => {
          const next = [...prev, messageForAvatar];
          console.log("[UI] setMessages -> tamanho anterior/novo:", prev.length, "/", next.length);
          return next;
        });
      } catch (err) {
        console.error("[UI] Erro no handleTypebotMessage:", err);
      }
    };

    console.log("[UI] Registrando listener de postMessage (avatarMessage)...");
    window.addEventListener("message", handleTypebotMessage);
    return () => {
      console.log("[UI] Removendo listener de postMessage.");
      window.removeEventListener("message", handleTypebotMessage);
    };
  }, [setLoading, setMessages, selectedAvatar]);

  if (hidden) return null;

  if (!isAvatarSelected) {
    return (
      <div className="fixed top-0 left-0 right-0 bottom-0 z-10 flex justify-center items-center flex-col pointer-events-none avatar-selection-container">
        <div className="p-8 rounded-lg shadow-lg pointer-events-auto init">
          <div id="heading">
            <h1>
              Escolha o seu <br /> <span className="highlight">Mentor</span>
            </h1>
          </div>
          <div className="flex justify-between avatar-selection">
            <div
              className="avatar-option"
              onClick={() => handleAvatarSelection("carol")}
              style={{ cursor: "pointer" }}
            >
              <img
                src="https://i.imgur.com/Ke9U2NC.png"
                alt="Carol"
                className="avatar-image"
                id="carol-avatar"
              />
            </div>
            <div
              className="avatar-option"
              onClick={() => handleAvatarSelection("david")}
              style={{ cursor: "pointer" }}
            >
              <img
                src="https://i.imgur.com/XfzFh5t.png"
                alt="David"
                className="avatar-image"
                id="david-avatar"
              />
            </div>
            <div
              className="avatar-option"
              onClick={() => handleAvatarSelection("ryan")}
              style={{ cursor: "pointer" }}
            >
              <img
                src="https://i.imgur.com/Lt8FxMk.png"
                alt="Ryan"
                className="avatar-image"
                id="ryan-avatar"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed top-0 left-0 right-0 bottom-0 z-10 flex justify-between p-4 flex-col pointer-events-none">
        <div className="w-full h-full flex flex-col items-center justify-center gap-4"></div>
      </div>

      <div style={{ position: "relative", width: "100%", height: "90%" }}>
        {sessionID && vUrl && selectedAvatar && customerZone && videoExternalId && (
          <iframe
            src={
              window.location.pathname === "/empreendedorismo"
                ? `https://chat.iatom.site/setup-funnel-empreendedorismo-sb53knb#sessionID=${sessionID}&avatar=${selectedAvatar}`
                : window.location.pathname === "/gestao"
                ? `https://chat.iatom.site/setup-funnel-gest-o-2-kvgj6ja#sessionID=${sessionID}&avatar=${selectedAvatar}`
                : window.location.pathname === "/marketing"
                ? `https://chat.iatom.site/setup-funnel-marketing-fk3xon2#sessionID=${sessionID}&avatar=${selectedAvatar}`
                : window.location.pathname === "/vendas"
                ? `https://chat.iatom.site/my-typebot-nc45ub2#sessionID=${sessionID}&avatar=${selectedAvatar}`
                : window.location.pathname === "/financas"
                ? `https://chat.iatom.site/setup-funnel-capital-inicial-xhg5gbd#sessionID=${sessionID}&avatar=${selectedAvatar}`
                : window.location.pathname === "/ia"
                ? `https://chat.iatom.site/setup-funnel-ia-q7brg28#sessionID=${sessionID}&avatar=${selectedAvatar}`
                : window.location.pathname === "/setup"
                ? `https://chat.iatom.site/setup-funnel-of6i94e#sessionID=${sessionID}&avatar=${selectedAvatar}`
                : window.location.pathname === "/aprendizado"
                ? `https://chat.iatom.site/my-typebot-cikqd96#sessionID=${sessionID}&avatar=${selectedAvatar}`
                : `https://chat.iatom.site/my-typebot-36hu58q?sessionID=${sessionID}?vUrl${vUrl}?avatar${selectedAvatar}?customerZone${customerZone}?videoExternalId${videoExternalId}`
            }
            title="Typebot"
            className="w-full h-full border-none"
            style={{ maxWidth: "100%", width: "100%", height: "100%" }}
            allow="microphone"
            onLoad={() => console.log("[UI] Iframe Typebot carregado.")}
          ></iframe>
        )}

        <div
          style={{
            position: "absolute",
            top: "-90px",
            left: 0,
            width: "100%",
            height: "100px",
            background: "linear-gradient(transparent 9%, black 80%)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        ></div>
      </div>
    </>
  );
};