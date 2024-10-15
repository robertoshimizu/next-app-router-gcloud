"use client";

import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import MessageList from "./MessageList";
import InputArea from "./InputArea";
import HomeComponent from "./HomeComponent";
import Settings from "./Settings";
import { Message, Model } from "../types";
import { handleStreamEvent } from "../utils/streamHandler";
import {
  createAssistant,
  createThread,
  getThreadState,
  MessageParams,
  sendMessage,
} from "../utils/chatApi";
import { ASSISTANT_ID_COOKIE } from "@/constants";
import { getCookie, setCookie } from "@/utils/cookies";
import { ThreadState } from "@langchain/langgraph-sdk";
import { GraphInterrupt } from "./Interrupted";

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [model, setModel] = useState<Model>("gpt-4o-mini" as Model);
  const [userId, setUserId] = useState<string>("");
  const [systemInstructions, setSystemInstructions] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadState, setThreadState] =
    useState<ThreadState<Record<string, any>>>();
  const [graphInterrupted, setGraphInterrupted] = useState(false);
  const [allowNullMessage, setAllowNullMessage] = useState(false);

  const messageListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const initializeChat = async () => {
      let assistantId = getCookie(ASSISTANT_ID_COOKIE);

      if (!assistantId) {
        const assistant = await createAssistant(
          process.env.NEXT_PUBLIC_LANGGRAPH_GRAPH_ID as string
        );
        assistantId = assistant.assistant_id as string;
        setCookie(ASSISTANT_ID_COOKIE, assistantId);
        setAssistantId(assistantId);
        // Use the assistant ID as the user ID.
        setUserId(assistantId);
      } else {
        setUserId(assistantId);
      }

      const { thread_id } = await createThread();
      setThreadId(thread_id);
      setAssistantId(assistantId);
      console.log("Thread ID:", thread_id);
      console.log("Assistant ID:", assistantId);
    };

    initializeChat();
  }, []);

  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (message: string | null) => {
    if (message !== null) {
      setMessages([
        ...messages,
        { text: message, sender: "user", id: uuidv4() },
      ]);
    }

    if (!threadId) {
      console.error("Thread ID is not available");
      return;
    }
    if (!assistantId) {
      console.error("Assistant ID is not available");
      return;
    }

    try {
      setIsLoading(true);
      setThreadState(undefined);
      setGraphInterrupted(false);
      setAllowNullMessage(false);

      const params: MessageParams = {
        threadId,
        assistantId,
        message,
        model,
        userId,
        systemInstructions,
      };
      console.log("Sending message:", params);
      const response = await sendMessage(params);

      for await (const chunk of response) {
        handleStreamEvent(chunk, setMessages);
      }

      // Fetch the current state of the thread
      const currentState = await getThreadState(threadId);
      console.log("Current state:", currentState);
      setThreadState(currentState);
      if (currentState.next.length) {
        setGraphInterrupted(true);
      }
      setIsLoading(false);
    } catch (error) {
      console.error("Error streaming messages:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-screen bg-[#212121] overflow-hidden rounded-lg shadow-md">
      <Settings
        onModelChange={setModel}
        onSystemInstructionsChange={setSystemInstructions}
        currentModel={model as any}
        currentSystemInstructions={systemInstructions}
      />
      {messages.length === 0 ? (
        <HomeComponent onMessageSelect={handleSendMessage} />
      ) : (
        <div ref={messageListRef} className="overflow-y-auto h-screen">
          <MessageList messages={messages} isLoading={false} />
          {!!graphInterrupted && !!threadState && !!threadId ? (
            <div className="flex items-center justify-start w-2/3 mx-auto">
              <GraphInterrupt
                setAllowNullMessage={setAllowNullMessage}
                threadId={threadId}
                state={threadState}
              />
            </div>
          ) : null}
          {allowNullMessage && (
            <div className="flex flex-col w-2/3 mx-auto overflow-y-scroll pb-[100px]">
              <button
                onClick={async () => handleSendMessage(null)}
                disabled={isLoading}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg mt-2 max-w-[400px] mx-auto"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      )}
      <InputArea
        disabled={!!graphInterrupted && !!threadState && !!threadId}
        onSendMessage={handleSendMessage}
      />
    </div>
  );
}
