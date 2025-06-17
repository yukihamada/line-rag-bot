import { CloudflareVectorizeStore } from '@langchain/cloudflare';
import { CloudflareWorkersAIEmbeddings } from '@langchain/cloudflare';
import { Document } from '@langchain/core/documents';
import { Env } from '../types';

export function createVectorStore(env: Env) {
  const embeddings = new CloudflareWorkersAIEmbeddings({
    binding: env.AI,
    model: '@cf/baai/bge-base-en-v1.5',
  });

  return new CloudflareVectorizeStore(embeddings, {
    index: env.VECTORIZE_INDEX,
  });
}

export async function searchDocuments(
  env: Env,
  query: string,
  k: number = 4
): Promise<Document[]> {
  const vectorStore = createVectorStore(env);
  return await vectorStore.similaritySearch(query, k);
}

export async function addDocumentsToVectorStore(
  env: Env,
  documents: Document[]
): Promise<void> {
  const vectorStore = createVectorStore(env);
  await vectorStore.addDocuments(documents);
}