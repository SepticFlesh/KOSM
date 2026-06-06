/**
 * Simple in-memory chat system.
 */
export interface ChatMessage {
  playerName: string;
  text: string;
  timestamp: number;
}

export class ChatSystem {
  private messages: ChatMessage[] = [];
  private maxMessages = 100;

  /** Add a message and return the broadcast payload */
  addMessage(playerName: string, text: string): ChatMessage {
    const msg: ChatMessage = {
      playerName,
      text: text.slice(0, 200), // limit to 200 chars
      timestamp: Date.now(),
    };
    this.messages.push(msg);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
    return msg;
  }

  /** Get recent messages */
  getRecent(count: number = 50): ChatMessage[] {
    return this.messages.slice(-count);
  }
}
