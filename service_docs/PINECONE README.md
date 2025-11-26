# Pinecone Gateway Worker

Deployed at: https://pinecone-gateway.arke.institute
Name: pinecone-gateway

## Purpose
Cloudflare Worker gateway to Pinecone vector database.

## Responsibilities
- Query by metadata (exact label + type match)
- Query by vector (semantic similarity search)
- Upsert entity embeddings with metadata
- Update metadata (append source PIs for merged entities)
- Fetch vectors by ID for similarity calculations

## Architecture Flow
```
Orchestrator
     ↓
[Pinecone Gateway]
     ↓
Pinecone Vector DB (768-dim, cosine similarity)
```

## API Endpoints

### POST /query
Query vectors by metadata filter or semantic similarity.

**Request (metadata filter)**:
```json
{
  "filter": {
    "label": { "$eq": "Dr Gillingham" },
    "type": { "$eq": "person" }
  },
  "top_k": 10,
  "include_metadata": true
}
```

**Request (vector search)**:
```json
{
  "vector": [0.123, -0.456, ...],
  "filter": {
    "type": { "$eq": "person" }
  },
  "top_k": 10,
  "include_metadata": true
}
```

**Response**:
```json
{
  "matches": [
    {
      "id": "uuid_123",
      "score": 0.95,
      "metadata": {
        "canonical_id": "uuid_123",
        "label": "Dr Gillingham",
        "type": "person",
        "source_pi": "01KA1H53CP..."
      }
    }
  ]
}
```

### POST /upsert
Insert or update entity vectors.

**Request**:
```json
{
  "vectors": [
    {
      "id": "uuid_123",
      "values": [0.123, -0.456, ...],
      "metadata": {
        "canonical_id": "uuid_123",
        "label": "Dr Gillingham",
        "type": "person",
        "source_pi": "01KA1H53CP..."
      }
    }
  ]
}
```

### POST /update
Update metadata for existing vector (used when merging entities).

**Request**:
```json
{
  "id": "uuid_123",
  "set_metadata": {
    "source_pi": "01KA1H53CP...,01KA1H5VGR..."
  }
}
```

### POST /fetch
Fetch vectors by ID for similarity calculation.

**Request**:
```json
{
  "ids": ["uuid_123", "uuid_456"]
}
```

### POST /query-by-ids
Rank a set of candidate vectors by similarity to a query. Useful for filtering results to a specific set of IDs.

**Request (text query)**:
```json
{
  "ids": ["uuid_123", "uuid_456", "uuid_789"],
  "text": "Dr Gillingham",
  "top_k": 10,
  "include_metadata": true
}
```

**Request (vector query)**:
```json
{
  "ids": ["uuid_123", "uuid_456", "uuid_789"],
  "vector": [0.123, -0.456, ...],
  "top_k": 10,
  "include_metadata": true
}
```

**Response**:
```json
{
  "matches": [
    {
      "id": "uuid_456",
      "score": 0.95,
      "metadata": {
        "canonical_id": "uuid_456",
        "label": "Dr Gillingham",
        "type": "person",
        "source_pi": "01KA1H53CP..."
      }
    }
  ]
}
```

**Notes**:
- Fetches candidate vectors and computes cosine similarity client-side
- Automatically batches fetches for large ID lists (>1000)
- Results sorted by similarity score (descending)

## Configuration
- **Memory**: 128 MB
- **Timeout**: 30 seconds
- **Index**: 768 dimensions, cosine similarity

## Environment Variables
- `PINECONE_API_KEY`: Pinecone API key
- `PINECONE_ENVIRONMENT`: Pinecone environment (e.g., `us-west1-gcp`)
- `PINECONE_INDEX_NAME`: Name of Pinecone index

## Development
```bash
npm install
npm run dev           # Local development
npm run deploy        # Deploy to Cloudflare
npm run create-index  # Create Pinecone index
npm run clear-index   # Clear all vectors from index
```


