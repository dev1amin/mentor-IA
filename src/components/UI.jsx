// UI.jsx – chat 50% da tela, estilo Typebot, sem mudar seu fluxo de envio
import React, { useEffect, useRef, useState } from "react";
import { useChat } from "../hooks/useChat";

export const UI = ({ isAvatarSelected }) => {
  const { messages = [], loading = false, sendMessage, setLoading } = useChat();
  const [text, setText] = useState("");
  const listRef = useRef(null);

  // scrolla até o fim sempre que chega algo novo
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    const value = text.trim();
    if (!value) return;
    // NÃO muda seu fluxo – usa a mesma função do hook que chama o n8n
    sendMessage?.(value);
    setText("");
    setLoading?.(true);
  };

  if (!isAvatarSelected) return null;

  return (
    <div className="chat-dock">
      <div className="chat-surface">
        <div className="chat-window">
          {/* lista de mensagens – altura fixa + scroll */}
          <div ref={listRef} className="chat-scroll">
            {messages.map((m, i) => {
              const isUser =
                m.role === "user" ||
                m.from === "user" ||
                m.isUser === true ||
                m.sender === "user";
              const text = m.text || m.output || m.content || "";
              return (
                <div key={m.uuid || i} className={`bubble-row ${isUser ? "right" : "left"}`}>
                  <div className={isUser ? "typebot-guest-bubble" : "typebot-host-bubble"}>
                    {text}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="bubble-row left">
                <div className="bubble-typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}
          </div>

          {/* input fixo – classes e visual do Typebot */}
          <form className="typebot-input-form" onSubmit={handleSubmit}>
            <input
              className="typebot-input"
              placeholder="Digite sua duvida..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="typebot-button" aria-label="Enviar">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};