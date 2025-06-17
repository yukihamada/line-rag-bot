import { LineWebhookBody, LineEvent, Env } from '../types';
import { processUserMessage } from '../langchain/chain';
import { sendReplyMessage } from './api';

export async function handleLineWebhook(
  body: LineWebhookBody,
  env: Env,
  executionCtx: ExecutionContext
): Promise<void> {
  const promises = body.events.map(async (event) => {
    if (event.type === 'message' && event.message?.type === 'text') {
      await handleTextMessage(event, env, executionCtx);
    }
  });

  await Promise.all(promises);
}

async function handleTextMessage(
  event: LineEvent,
  env: Env,
  executionCtx: ExecutionContext
): Promise<void> {
  const userId = event.source.userId;
  const userMessage = event.message?.text;

  if (!userMessage) return;

  try {
    const response = await processUserMessage(env, userId, userMessage, executionCtx);
    
    await sendReplyMessage(env, event.replyToken, [
      {
        type: 'text',
        text: response,
      },
    ]);
  } catch (error) {
    console.error('Error processing message:', error);
    
    await sendReplyMessage(env, event.replyToken, [
      {
        type: 'text',
        text: '申し訳ございません。エラーが発生しました。しばらくしてからもう一度お試しください。',
      },
    ]);
  }
}