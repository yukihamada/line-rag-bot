import { Env } from '../types';

const LINE_API_BASE = 'https://api.line.me/v2/bot';

export interface LineMessage {
  type: string;
  text?: string;
  originalContentUrl?: string;
  previewImageUrl?: string;
}

export async function sendReplyMessage(
  env: Env,
  replyToken: string,
  messages: LineMessage[]
): Promise<void> {
  const response = await fetch(`${LINE_API_BASE}/message/reply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LINE_CHANNEL_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE API error: ${response.status} - ${error}`);
  }
}

export async function sendPushMessage(
  env: Env,
  userId: string,
  messages: LineMessage[]
): Promise<void> {
  const response = await fetch(`${LINE_API_BASE}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LINE_CHANNEL_TOKEN}`,
    },
    body: JSON.stringify({
      to: userId,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LINE API error: ${response.status} - ${error}`);
  }
}