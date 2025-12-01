/**
 * Service Client Factory
 */

import type { Env } from '../types';
import { EmbeddingClient } from './embedding';
import { GraphDBClient } from './graphdb';
import { PineconeClient } from './pinecone';

export interface Services {
  embedding: EmbeddingClient;
  graphdb: GraphDBClient;
  pinecone: PineconeClient;
}

export function createServices(env: Env): Services {
  return {
    embedding: new EmbeddingClient(env.EMBEDDING_GATEWAY),
    graphdb: new GraphDBClient(env.GRAPHDB_GATEWAY),
    pinecone: new PineconeClient(env.PINECONE_GATEWAY),
  };
}

export { EmbeddingClient } from './embedding';
export { GraphDBClient } from './graphdb';
export { PineconeClient } from './pinecone';
export { LineageClient } from './lineage';
