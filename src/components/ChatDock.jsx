// src/components/ChatDock.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* Util: lê querystring com fallback */
function getQP(name) {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get(name) || "";
}

/* Monta o sessionID no formato antigo */
function buildLegacySessionId(avatar) {
  const id = getQP("id");
  const vUrlRaw = getQP("vUrl");
  const customerZone = getQP("customerZone");
  const videoExternalId = getQP("videoExternalId");
  const vUrl = vUrlRaw ? decodeURIComponent(vUrlRaw) : "";

  let legacy = id || "";
  if (vUrl) legacy += `?vUrl${vUrl}`;
  if (avatar) legacy += `?avatar${avatar}`;
  if (customerZone) legacy += `?customerZone${customerZone}`;
  if (videoExternalId) legacy += `?videoExternalId${videoExternalId}`;
  return legacy;
}

/* Dispara payload para o Avatar (mesmo contrato do Typebot) */
function postToAvatar({ text, avatar, audioUrl }) {
  const uuid =
    (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const data = {
    uuid,
    text,
    avatar,
    audioUrl,
    audio: audioUrl,
    animation: "Talking_1",
    facialExpression: "smile",
  };

  window.postMessage({ type: "avatarMessage", data }, "*");
}

/** Normaliza todas as respostas possíveis do webhook */
function parseWebhookPayload(payload, fallbackAvatar) {
  // Caso a API tenha colocado tudo dentro de "data"
  let data = payload?.data !== undefined ? payload.data : payload;

  // 1) Array na raiz ou dentro de data
  if (Array.isArray(data)) {
    const first = data[0] || {};
    if (first.warning && !first.output && !first.audioUrl && !first.audio) {
      return { text: first.warning, avatar: fallbackAvatar, audioUrl: "", warningOnly: true };
    }
    return {
      text: first.output || first.resposta || first.text || first.warning || "",
      avatar: first.avatar || fallbackAvatar,
      audioUrl: first.audioUrl || first.audio || "",
      warningOnly: !!(first.warning && !first.output && !first.audioUrl && !first.audio),
    };
  }

  // 2) Objeto simples
  if (data && typeof data === "object") {
    const text = data.output ?? data.resposta ?? data.text ?? "";
    const avatar = data.avatar ?? fallbackAvatar;
    const audioUrl = data.audioUrl ?? data.audio ?? "";
    const warning = data.warning;

    // Se só veio warning, tratamos como aviso puro
    if (warning && !text && !audioUrl) {
      return { text: warning, avatar, audioUrl: "", warningOnly: true };
    }

    return { text: text || warning || "", avatar, audioUrl, warningOnly: !!(warning && !text && !audioUrl) };
  }

  // 3) String (improvável, mas fica o fallback)
  if (typeof data === "string") {
    return { text: data, avatar: fallbackAvatar, audioUrl: "", warningOnly: false };
  }

  return { text: "", avatar: fallbackAvatar, audioUrl: "", warningOnly: false };
}

export default function ChatDock() {
  const [messages, setMessages] = useState([]); // [{role:'user'|'bot'|'typing', text}]
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);
  const abortRef = useRef(null);

  const avatar = useMemo(
    () =>
      (typeof localStorage !== "undefined"
        ? localStorage.getItem("selectedAvatar")
        : "") || "carol",
    []
  );

  // auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function sendMsg(e) {
    e?.preventDefault?.();
    const text = input.trim();
    if (!text || sending) return;

    // push user
    setMessages((p) => [...p, { role: "user", text }]);
    setInput("");
    setSending(true);

    // typing
    setMessages((p) => [...p, { role: "typing", text: "..." }]);

    const sessionID = buildLegacySessionId(avatar);
    const body = { sessionID, msg: text, req: 1, avatar };

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch(
        "https://n8nsemfila.iatom.site/webhook/5054e10e-0243-4bca-bba4-4193255860fc",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        }
      );

      // remove todas as bolhas 'typing'
      setMessages((p) => p.filter((m) => m.role !== "typing"));

      if (!res.ok) {
        setMessages((p) => [
          ...p,
          { role: "bot", text: `Falha (${res.status}). Tente novamente.` },
        ]);
        setSending(false);
        return;
      }

      let payload;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      // Normaliza e trata "warning only"
      const { text: resposta, avatar: respAvatar, audioUrl, warningOnly } =
        parseWebhookPayload(payload, avatar);

      // mostra a mensagem no chat (sempre)
      setMessages((p) => [
        ...p,
        { role: "bot", text: resposta || "..." },
      ]);

      // se NÃO for apenas warning, dispara áudio/visemas
      if (!warningOnly && (audioUrl || resposta)) {
        postToAvatar({ text: resposta, avatar: respAvatar, audioUrl });
      }

      setSending(false);
    } catch (err) {
      setMessages((p) => p.filter((m) => m.role !== "typing"));
      setMessages((p) => [
        ...p,
        {
          role: "bot",
          text:
            err?.name === "AbortError"
              ? "Requisição cancelada."
              : "Não consegui enviar agora. Verifique sua conexão e tente novamente.",
        },
      ]);
      setSending(false);
    }
  }

  return (
    <div className="chat-surface">
      <div className="chat-window">
        {/* mensagens */}
        <div className="chat-scroll" ref={scrollRef}>
          {messages.map((m, idx) => {
            if (m.role === "typing") {
              return (
                <div className="bubble-row left" key={`typing-${idx}`}>
                  <div className="bubble-typing">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                  </div>
                </div>
              );
            }
            if (m.role === "user") {
              return (
                <div className="bubble-row right" key={`u-${idx}`}>
                  <div className="typebot-guest-bubble bubble-in">{m.text}</div>
                </div>
              );
            }
            return (
              <div className="bubble-row left" key={`b-${idx}`}>
                <div className="typebot-host-bubble bubble-in">{m.text}</div>
              </div>
            );
          })}
        </div>

        {/* input */}
        <form className="typebot-input-form" onSubmit={sendMsg}>
          <input
            className="typebot-input"
            type="text"
            value={input}
            placeholder="Digite sua duvida..."
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
          />
          <button
            type="submit"
            className="typebot-button"
            aria-label="Enviar"
            disabled={sending}
            title="Enviar"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 12L21 3L14 21L11 13L3 12Z"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}