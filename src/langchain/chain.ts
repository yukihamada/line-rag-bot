import { loadQAStuffChain } from 'langchain/chains';
import { CloudflareWorkersAI } from '@langchain/cloudflare';
import { PromptTemplate } from '@langchain/core/prompts';
import { createVectorStore } from './vectorstore';
import { createUserMemory, saveMessageToD1 } from './memory';
import { Env } from '../types';
import { MCPClient, createMCPTools } from '../mcp/client';

const QA_PROMPT = PromptTemplate.fromTemplate(`
以下のコンテキストを使用して質問に答えてください。
答えがわからない場合は、「わかりません」と言ってください。

コンテキスト:
{context}

質問: {question}
回答:`);

export async function createRAGChain(env: Env) {
  const model = new CloudflareWorkersAI({
    cloudflareAccountId: env.CF_ACCOUNT_ID,
    cloudflareApiToken: env.CF_API_TOKEN,
    model: '@cf/meta/llama-3-70b-instruct',
  });

  const vectorStore = createVectorStore(env);
  
  return {
    model,
    vectorStore,
    chain: loadQAStuffChain(model, { prompt: QA_PROMPT }),
  };
}

export async function processUserMessage(
  env: Env,
  userId: string,
  message: string,
  executionCtx: ExecutionContext,
  useMCP: boolean = false
): Promise<string> {
  executionCtx.waitUntil(saveMessageToD1(env.DB, userId, 'user', message));

  // 会話履歴を取得
  const memory = await createUserMemory(env.DB, userId);
  const history = await memory.chatHistory.getMessages();
  
  // 履歴を含めたプロンプトを構築
  let contextualMessage = message;
  if (history.length > 0) {
    const historyText = history
      .map((msg: any) => `${msg._getType() === 'human' ? 'ユーザー' : 'アシスタント'}: ${msg.content}`)
      .join('\n');
    contextualMessage = `会話履歴:
${historyText}

現在の質問: ${message}`;
  }

  const { vectorStore, chain } = await createRAGChain(env);
  
  // MCPを使用する場合
  let relevantDocs;
  if (useMCP && env.MCP_SERVER_URL) {
    const mcpClient = new MCPClient(env.MCP_SERVER_URL);
    await mcpClient.connectHTTP();
    
    try {
      // MCP経由で検索
      const searchResults = await mcpClient.searchKnowledge(contextualMessage, 4);
      relevantDocs = searchResults.map((result: any) => ({
        pageContent: result.content,
        metadata: result.metadata || {},
      }));
      
      // 感情分析も実行
      const sentiment = await mcpClient.analyzeSentiment(message);
      console.log('Sentiment analysis:', sentiment);
    } finally {
      mcpClient.disconnect();
    }
  } else {
    // 通常の検索
    relevantDocs = await vectorStore.similaritySearch(contextualMessage, 4);
  }
  
  // チェーンを実行
  const response = await chain.call({
    input_documents: relevantDocs,
    question: contextualMessage,
  });

  const answer = response.text;
  executionCtx.waitUntil(saveMessageToD1(env.DB, userId, 'assistant', answer));

  return answer;
}