/**
 * Service Client Factory
 */

import type { Env } from '../types';
import { EmbeddingClient } from './embedding';
import { GraphDBClient } from './graphdb';
import { PineconeClient } from './pinecone';
import { IpfsClient } from './ipfs';

export interface Services {
  embedding: EmbeddingClient;
  graphdb: GraphDBClient;
  pinecone: PineconeClient;
  ipfs: IpfsClient;
}

export function createServices(env: Env): Services {
  return {
    embedding: new EmbeddingClient(env.EMBEDDING_GATEWAY),
    graphdb: new GraphDBClient(env.GRAPHDB_GATEWAY),
    pinecone: new PineconeClient(env.PINECONE_GATEWAY),
    ipfs: new IpfsClient(),
  };
}

export { EmbeddingClient } from './embedding';
export { GraphDBClient } from './graphdb';
export { PineconeClient } from './pinecone';
export { IpfsClient } from './ipfs';
export { LineageClient } from './lineage';
