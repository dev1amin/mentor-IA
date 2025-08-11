import { createContext, useContext, useEffect, useState } from "react";

const backendUrl = "https://1st-backend-mentor-duvidas.pycie2.easypanel.host";

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState();
  const [loading, setLoading] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(true);
  const [buttonsDisabled, setButtonsDisabled] = useState(false);

  useEffect(() => {
    const handleAvatarMessage = (event) => {
      const { detail: avatarMessage } = event;
      setMessages([avatarMessage]);
    };

    window.addEventListener('avatarMessage', handleAvatarMessage);

    return () => {
      window.removeEventListener('avatarMessage', handleAvatarMessage);
    };
  }, []);

  const onMessagePlayed = () => {
    setMessages([]);
    setLoading(false); // Desativa o estado de carregamento
  };

  useEffect(() => {
    if (messages.length > 0) {
      setMessage(messages[0]);
    } else {
      setMessage(null);
    }
  }, [messages]);

  return (
    <ChatContext.Provider
    value={{
      message,
      onMessagePlayed,
      loading,
      cameraZoomed,
      setCameraZoomed,
      setLoading,
      setMessages,
      setButtonsDisabled,
      buttonsDisabled,
    }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};