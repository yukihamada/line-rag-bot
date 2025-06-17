#!/usr/bin/env node

import { config } from 'dotenv';
import { uploadDocuments } from './upload-documents';

config();

async function main() {
  if (!process.env.VECTORIZE_INDEX || !process.env.CF_API_TOKEN) {
    console.error('Missing required environment variables');
    process.exit(1);
  }

  const documentsPath = process.argv[2] || './documents';
  
  console.log('Starting document upload...');
  console.log('Documents path:', documentsPath);

  try {
    await uploadDocuments({
      vectorizeIndex: process.env.VECTORIZE_INDEX,
      aiBinding: {
        apiToken: process.env.CF_API_TOKEN,
      },
      documentsPath,
    });
  } catch (error) {
    console.error('Upload failed:', error);
    process.exit(1);
  }
}

main();