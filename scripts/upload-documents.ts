import { CloudflareVectorizeStore } from '@langchain/cloudflare';
import { CloudflareWorkersAIEmbeddings } from '@langchain/cloudflare';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import * as fs from 'fs/promises';
import * as path from 'path';

interface UploadConfig {
  vectorizeIndex: any;
  aiBinding: any;
  documentsPath: string;
}

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '。', '、', ' ', ''],
});

async function loadDocumentsFromDirectory(dirPath: string): Promise<Document[]> {
  const documents: Document[] = [];
  const files = await fs.readdir(dirPath);

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = await fs.stat(filePath);

    if (stat.isFile() && (file.endsWith('.txt') || file.endsWith('.md'))) {
      const content = await fs.readFile(filePath, 'utf-8');
      const metadata = {
        source: filePath,
        fileName: file,
        timestamp: new Date().toISOString(),
      };

      documents.push(new Document({ pageContent: content, metadata }));
    }
  }

  return documents;
}

export async function uploadDocuments(config: UploadConfig) {
  console.log('Loading documents from:', config.documentsPath);
  const rawDocuments = await loadDocumentsFromDirectory(config.documentsPath);
  
  console.log(`Found ${rawDocuments.length} documents`);
  
  const splitDocuments = await textSplitter.splitDocuments(rawDocuments);
  console.log(`Split into ${splitDocuments.length} chunks`);

  const embeddings = new CloudflareWorkersAIEmbeddings({
    binding: config.aiBinding,
    model: '@cf/baai/bge-base-en-v1.5',
  });

  const vectorStore = new CloudflareVectorizeStore(embeddings, {
    index: config.vectorizeIndex,
  });

  console.log('Uploading to Vectorize...');
  await vectorStore.addDocuments(splitDocuments);
  
  console.log('Upload complete!');
}

async function saveDocumentsToDB(db: D1Database, documents: Document[]) {
  for (const doc of documents) {
    await db
      .prepare(`
        INSERT INTO documents (doc_id, title, content, metadata, vector_indexed)
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(
        crypto.randomUUID(),
        doc.metadata.fileName || 'Untitled',
        doc.pageContent,
        JSON.stringify(doc.metadata),
        true
      )
      .run();
  }
}