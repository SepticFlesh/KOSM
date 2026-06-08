import type { PlayerSession } from '../wsServer.js';
import type { ServerMessage } from '../protocol/messages.js';
import type { ChatSystem } from '../systems/ChatSystem.js';

export interface ChatHandlerDeps {
  chat: ChatSystem;
}

export function createChatHandler(deps: ChatHandlerDeps) {
  const { chat } = deps;

  function handleChatMessage(
    session: PlayerSession,
    text: string,
    broadcast: (msg: ServerMessage) => void,
  ): void {
    const chatMsg = chat.addMessage(session.username, text);
    broadcast({ type: 'chat_broadcast', payload: chatMsg });
  }

  return { handleChatMessage };
}
