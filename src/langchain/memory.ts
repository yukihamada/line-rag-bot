import { HumanMessage, AIMessage, BaseMessage } from '@langchain/core/messages';
import { BufferMemory } from 'langchain/memory';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { Env, MemoryRecord } from '../types';

export async function loadHistoryFromD1(db: D1Database, userId: string, limit: number = 10): Promise<BaseMessage[]> {
  const results = await db
    .prepare('SELECT role, content FROM memory WHERE user_id = ? ORDER BY ts DESC LIMIT ?')
    .bind(userId, limit)
    .all<MemoryRecord>();

  const messages: BaseMessage[] = [];
  
  for (const record of results.results.reverse()) {
    if (record.role === 'user') {
      messages.push(new HumanMessage(record.content));
    } else if (record.role === 'assistant') {
      messages.push(new AIMessage(record.content));
    }
  }

  return messages;
}

export async function saveMessageToD1(
  db: D1Database, 
  userId: string, 
  role: 'user' | 'assistant', 
  content: string
): Promise<void> {
  await db
    .prepare('INSERT INTO memory (user_id, ts, role, content) VALUES (?, ?, ?, ?)')
    .bind(userId, Date.now(), role, content)
    .run();
}

export async function createUserMemory(db: D1Database, userId: string): Promise<BufferMemory> {
  const messages = await loadHistoryFromD1(db, userId);
  const chatHistory = new InMemoryChatMessageHistory(messages);
  
  return new BufferMemory({
    memoryKey: 'history',
    chatHistory,
    returnMessages: true,
  });
}