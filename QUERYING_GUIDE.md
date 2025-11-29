# Querying the Knowledge Graph: A Comprehensive Guide

This document covers everything you need to know about querying the Arke Institute's entity linking system, including:
1. Semantic search in Pinecone
2. Getting entity relationships from Neo4j
3. Multi-hop graph traversal patterns

---

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. Semantic Search (Pinecone)](#2-semantic-search-pinecone)
  - [2.1 What's Stored in the Index](#21-whats-stored-in-the-index)
  - [2.2 Metadata Fields](#22-metadata-fields)
  - [2.3 Available Filters](#23-available-filters)
  - [2.4 Query Examples](#24-query-examples)
- [3. Entity Structure](#3-entity-structure)
  - [3.1 Core Entity Properties](#31-core-entity-properties)
  - [3.2 Entity Types](#32-entity-types)
  - [3.3 Date Entities](#33-date-entities)
  - [3.4 PI Entities (Collections)](#34-pi-entities-collections)
  - [3.5 File Entities](#35-file-entities)
  - [3.6 Entity Type Summary](#36-entity-type-summary)
  - [3.7 Canonical IDs](#37-canonical-ids)
- [4. Relationships](#4-relationships)
  - [4.1 Relationship Types](#41-relationship-types)
  - [4.2 Getting Entity Relationships](#42-getting-entity-relationships)
  - [4.3 Relationship Structure](#43-relationship-structure)
- [5. Multi-Hop Traversal](#5-multi-hop-traversal)
  - [5.1 Basic Pattern](#51-basic-pattern)
  - [5.2 Traversal by Semantic Similarity](#52-traversal-by-semantic-similarity)
  - [5.3 Traversal to Files](#53-traversal-to-files)
  - [5.4 Traversal to Source PI](#54-traversal-to-source-pi)
  - [5.5 Date-Based Traversal](#55-date-based-traversal)
  - [5.6 Recursive Multi-Hop Example](#56-recursive-multi-hop-example)
- [6. API Reference Quick Guide](#6-api-reference-quick-guide)

---

## 1. Architecture Overview

The knowledge graph is stored across two systems:

```
┌─────────────────────────────────────────────────────────────────┐
│                     QUERY ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐         ┌─────────────────┐               │
│  │   PINECONE      │         │    NEO4J        │               │
│  │  (Vector DB)    │         │  (Graph DB)     │               │
│  ├─────────────────┤         ├─────────────────┤               │
│  │ - Embeddings    │         │ - Entities      │               │
│  │ - Semantic      │         │ - Relationships │               │
│  │   similarity    │         │ - PI hierarchy  │               │
│  │ - Metadata      │         │ - EXTRACTED_FROM│               │
│  │   filtering     │         │ - MENTIONED_IN  │               │
│  └────────┬────────┘         └────────┬────────┘               │
│           │                           │                         │
│           │   ┌───────────────────┐   │                         │
│           └──►│  YOUR APPLICATION │◄──┘                         │
│               └───────────────────┘                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Use Pinecone for:**
- Finding semantically similar entities
- Full-text semantic search
- Filtering by metadata (type, source_pi)

**Use Neo4j for:**
- Getting entity relationships
- Graph traversal
- Finding entities by exact match
- PI hierarchy queries
- EXTRACTED_FROM / MENTIONED_IN queries

---

## 2. Semantic Search (Pinecone)

### 2.1 What's Stored in the Index

Each entity in the knowledge graph has a corresponding vector in Pinecone:

- **Vector ID**: The entity's `canonical_id`
- **Vector Values**: 768-dimensional embedding from OpenAI `text-embedding-3-small`
- **Text Used for Embedding**: Formatted as `"type: label | prop1: val1, prop2: val2"`

Example text representation:
```
"person: Dr Gillingham | role: Faculty member, department: Research"
"place: Mount Vernon | country: United States, state: Virginia"
"date: December 15, 2017"
```

### 2.2 Metadata Fields

Every vector includes these metadata fields:

| Field | Type | Description |
|-------|------|-------------|
| `canonical_id` | string | Unique entity identifier (same as vector ID) |
| `label` | string | Human-readable entity name |
| `type` | string | Entity type: `person`, `place`, `organization`, `date`, `file`, `unknown` |
| `source_pi` | string | PI that contributed this entity (comma-separated if multiple) |

### 2.3 Available Filters

Pinecone supports metadata filters using these operators:

| Operator | Description | Example |
|----------|-------------|---------|
| `$eq` | Equals | `{"type": {"$eq": "person"}}` |
| `$ne` | Not equals | `{"type": {"$ne": "file"}}` |
| `$in` | In list | `{"type": {"$in": ["person", "organization"]}}` |
| `$nin` | Not in list | `{"type": {"$nin": ["file", "date"]}}` |

**Combine filters:**
```json
{
  "filter": {
    "type": {"$eq": "person"},
    "source_pi": {"$eq": "arke:01ABC123"}
  }
}
```

### 2.4 Query Examples

#### Semantic Search (Find Similar Entities)

```bash
# Step 1: Get embedding for your query
curl -X POST https://embedding-gateway.arke.institute/embed \
  -H "Content-Type: application/json" \
  -d '{
    "texts": ["George Washington American president"],
    "dimensions": 768
  }'

# Step 2: Query Pinecone with the embedding
curl -X POST https://pinecone-gateway.arke.institute/query \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.123, -0.456, ...],
    "top_k": 10,
    "include_metadata": true
  }'
```

**Response:**
```json
{
  "matches": [
    {
      "id": "george_washington",
      "score": 0.95,
      "metadata": {
        "canonical_id": "george_washington",
        "label": "George Washington",
        "type": "person",
        "source_pi": "arke:01ABC123"
      }
    }
  ]
}
```

#### Filter by Type

```bash
curl -X POST https://pinecone-gateway.arke.institute/query \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.123, -0.456, ...],
    "filter": {
      "type": {"$eq": "person"}
    },
    "top_k": 10,
    "include_metadata": true
  }'
```

#### Filter by Canonical ID (Exact Match)

```bash
curl -X POST https://pinecone-gateway.arke.institute/query \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "canonical_id": {"$eq": "george_washington"}
    },
    "top_k": 1,
    "include_metadata": true
  }'
```

#### Filter by Source PI

```bash
curl -X POST https://pinecone-gateway.arke.institute/query \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.123, -0.456, ...],
    "filter": {
      "source_pi": {"$eq": "arke:01ABC123"}
    },
    "top_k": 10,
    "include_metadata": true
  }'
```

#### Metadata-Only Query (No Vector)

You can query by metadata alone without a vector:

```bash
curl -X POST https://pinecone-gateway.arke.institute/query \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "type": {"$eq": "date"}
    },
    "top_k": 100,
    "include_metadata": true
  }'
```

---

## 3. Entity Structure

### 3.1 Core Entity Properties

```typescript
interface Entity {
  canonical_id: string;    // Unique global identifier
  code: string;            // Original code from source PI
  label: string;           // Human-readable name
  type: string;            // Entity type
  properties: Record<string, any>;  // Additional properties
  source_pis: string[];    // All PIs that mention this entity
}
```

### 3.2 Entity Types

| Type | Description | Canonical ID Format |
|------|-------------|---------------------|
| `person` | People, historical figures | `code` (e.g., `george_washington`) |
| `place` | Locations, buildings | `code` (e.g., `mount_vernon`) |
| `organization` | Companies, institutions | `code` (e.g., `continental_congress`) |
| `date` | Dates, time periods | `date_YYYY_MM_DD` (e.g., `date_2017_12_15`) |
| `file` | Source documents | `{pi}:{code}` (e.g., `arke:01ABC:file_001`) |
| `unknown` | Placeholder entities | `code` or `{pi}:{code}` |

### 3.3 Date Entities

Date entities have **deterministic canonical IDs** based on the date value:

- **Canonical ID Format**: `date_YYYY_MM_DD` (e.g., `date_2017_12_15`)
- **Label**: Human-readable date (e.g., `"December 15, 2017"`)
- **Properties**: May include `iso_date`, `year`, `month`, `day`

**Date entities are merged globally** - if multiple PIs reference the same date, they all point to the same entity.

#### Finding Entities Related to a Date

```bash
# Step 1: Get the date entity
curl -X GET https://graphdb-gateway.arke.institute/entity/date_2017_12_15

# Step 2: Get all relationships for that date
curl -X GET https://graphdb-gateway.arke.institute/relationships/date_2017_12_15
```

**Response:**
```json
{
  "incoming": [
    {
      "subject_id": "meeting_123",
      "predicate": "OCCURRED_ON",
      "object_id": "date_2017_12_15",
      "properties": {},
      "source_pi": "arke:01ABC123"
    }
  ],
  "outgoing": []
}
```

#### Filtering Pinecone by Date Type

```bash
curl -X POST https://pinecone-gateway.arke.institute/query \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {
      "type": {"$eq": "date"}
    },
    "top_k": 100,
    "include_metadata": true
  }'
```

### 3.4 PI Entities (Collections)

PI entities represent archival collections (IIIF-based Pinax packages). They are the top-level organizational units in the knowledge graph.

#### PI Entity Structure

**In Neo4j:**
```cypher
(:Entity {
  canonical_id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",  // Random UUID (looked up by code)
  code: "pi_IIKB6Y1SQZDGXDNK0BXGVRW4FJ",                 // pi_{PI_IDENTIFIER}
  label: "Test Historical Collection",                    // From pinax.title or fallback
  type: "pi",
  properties: "{...}",                                    // JSON string with metadata
  created_by_pi: "IIKB6Y1SQZDGXDNK0BXGVRW4FJ",          // Self-referential
  first_seen: datetime(),
  last_updated: datetime()
})
```

**Properties JSON may include:**
```json
{
  "pi": "IIKB6Y1SQZDGXDNK0BXGVRW4FJ",
  "parent_pi": "IIKB5X...",              // If has parent
  "description": "# About\n\nThis is...", // From description.md
  "creator": "Test Archive Institute",    // From pinax.json
  "date_range": "1900-1950",
  "subjects": ["history", "archives"],
  "language": "en",
  "rights": "Public Domain"
}
```

**In Pinecone:**
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "values": [0.123, -0.456, ...],
  "metadata": {
    "canonical_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "label": "Test Historical Collection",
    "type": "pi",
    "source_pi": "IIKB6Y1SQZDGXDNK0BXGVRW4FJ"  // Self-referential
  }
}
```

#### Key Characteristics

- **Code Pattern**: `pi_{PI_IDENTIFIER}`
- **Self-referential source_pi**: PI entities are their own source
- **Random UUID**: Canonical ID is a random UUID (looked up by code first, reused if exists)
- **Two nodes exist**: Both `:PI {id}` node and `:Entity {type: 'pi'}` node

#### Querying PI Entities

**Find all PI entities (Neo4j):**
```cypher
MATCH (e:Entity {type: 'pi'})
RETURN e.canonical_id, e.code, e.label, e.properties
```

**Find PI entity by identifier (Neo4j):**
```cypher
MATCH (e:Entity {code: 'pi_IIKB6Y1SQZDGXDNK0BXGVRW4FJ'})
RETURN e
```

**Semantic search for PIs about a topic (Pinecone):**
```json
{
  "vector": [0.123, ...],
  "filter": { "type": { "$eq": "pi" } },
  "top_k": 10,
  "include_metadata": true
}
```

**Argo Query DSL:**
```
"civil war correspondence military" type:pi
"medical research clinical studies" -[*]-> type:pi
```

---

### 3.5 File Entities

File entities represent actual files within collections (notes, images, PDFs, etc.). They use deterministic canonical IDs for efficient deduplication.

#### File Entity Structure

**In Neo4j:**
```cypher
(:Entity:File {
  canonical_id: "24fa5e2f-d110-42d0-6f1b-1e134c57dc2d",  // Deterministic UUID
  code: "file_notes.md",                                  // file_{filename}
  label: "Notes",                                         // Human-readable
  type: "file",
  properties: "{...}",                                    // JSON string
  created_by_pi: "IIKB6Y1SQZDGXDNK0BXGVRW4FJ",
  first_seen: datetime(),
  last_updated: datetime()
})
```

Note: File entities have a `:File` sublabel in addition to `:Entity`.

**Properties JSON:**
```json
{
  "filename": "notes.md",
  "file_cid": "bafkrei...",           // IPFS CID
  "content_type": "text"              // "text", "ref_ocr", or "ref_description"
}
```

**In Pinecone:**
```json
{
  "id": "24fa5e2f-d110-42d0-6f1b-1e134c57dc2d",
  "values": [0.123, -0.456, ...],
  "metadata": {
    "canonical_id": "24fa5e2f-d110-42d0-6f1b-1e134c57dc2d",
    "label": "Notes",
    "type": "file",
    "source_pi": "IIKB6Y1SQZDGXDNK0BXGVRW4FJ"
  }
}
```

#### Key Characteristics

- **Code Pattern**: `file_{filename}`
- **Deterministic Canonical ID**: SHA256 hash of `file:{pi}:{filename}` - no lookup needed
- **Sublabel**: Has `:File` sublabel in Neo4j for efficient filtering
- **EXTRACTED_FROM relationship**: Links file to its parent PI
- **Content Types**:
  - `text` - Direct text content
  - `ref_ocr` - OCR-processed scanned documents
  - `ref_description` - Image descriptions

#### File Relationships

```cypher
// File to PI
(file:Entity:File)-[:EXTRACTED_FROM]->(pi:PI)

// PI to Files (reverse)
(pi:Entity {type:'pi'})-[:CONTAINS_FILE]->(file:Entity:File)
```

#### Querying File Entities

**Find all files (Neo4j):**
```cypher
MATCH (f:Entity:File)
RETURN f.canonical_id, f.code, f.label, f.properties
```

**Find files for a specific PI (Neo4j):**
```cypher
MATCH (f:Entity:File)-[:EXTRACTED_FROM]->(pi:PI {id: $pi})
RETURN f.canonical_id, f.code, f.label, f.properties
```

**Find by filename (Neo4j):**
```cypher
MATCH (f:Entity:File {code: 'file_notes.md'})
RETURN f
```

**Semantic search for files (Pinecone):**
```json
{
  "vector": [0.123, ...],
  "filter": { "type": { "$eq": "file" } },
  "top_k": 10,
  "include_metadata": true
}
```

**Files from a specific PI (Pinecone):**
```json
{
  "filter": {
    "type": { "$eq": "file" },
    "source_pi": { "$eq": "IIKB6Y1SQZDGXDNK0BXGVRW4FJ" }
  }
}
```

**Argo Query DSL:**
```
"patient records medical documents" type:file
@pi_entity_id -[contains_file]-> type:file
@file_entity_id -[extracted_from]-> type:pi
```

#### Getting Files from a PI

```bash
curl -X POST https://graphdb-gateway.arke.institute/entities/list \
  -H "Content-Type: application/json" \
  -d '{
    "pi": "arke:01ABC123",
    "type": "file"
  }'
```

---

### 3.6 Entity Type Summary

| Type   | Code Pattern      | Label Source       | Canonical ID       | source_pi        |
|--------|-------------------|--------------------|--------------------|------------------|
| person | `john_doe`        | cheimarros.json    | Random UUID        | PI where extracted |
| event  | `seneca_falls`    | cheimarros.json    | Random UUID        | PI where extracted |
| org    | `acme_corp`       | cheimarros.json    | Random UUID        | PI where extracted |
| date   | `date_YYYY_MM_DD` | Human-readable     | Deterministic      | PI where extracted |
| pi     | `pi_{PI}`         | pinax.title        | Random UUID*       | Self (same PI)   |
| file   | `file_{filename}` | Filename converted | Deterministic hash | PI containing file |

*PI canonical IDs are looked up by code first; if exists, reused.

**Canonical ID Generation:**
- **Random UUID**: Looked up by code, created if not exists (person, event, org, pi)
- **Deterministic**: Generated from content, no lookup needed (date: from date value, file: from `file:{pi}:{filename}`)

### 3.7 Canonical IDs

The `canonical_id` is the globally unique identifier for an entity. Understanding its format helps with querying:

| Entity Type | Canonical ID Format | Example |
|-------------|---------------------|---------|
| Regular entity (first occurrence) | `{code}` | `george_washington` |
| Date entity | `{code}` | `date_2017_12_15` |
| File entity | `{pi}:{code}` | `arke:01ABC:file_001` |
| Disambiguated entity | `{pi}:{code}` | `arke:01ABC:george_washington` |

**Disambiguated entities** are created when AI determines that two entities with the same label are actually different people/things. They're linked via `DISAMBIGUATES` relationships.

---

## 4. Relationships

### 4.1 Relationship Types

| Relationship | Direction | Description |
|--------------|-----------|-------------|
| `EXTRACTED_FROM` | Entity → PI | Links entity to the PI that created it |
| `MENTIONED_IN` | Entity → PI | Links entity to all PIs that reference it |
| `PARENT_OF` | PI → PI | PI hierarchy (parent to child) |
| `CHILD_OF` | PI → PI | PI hierarchy (child to parent) |
| `DISAMBIGUATES` | Entity → Entity | Links disambiguated entities |
| Custom predicates | Entity → Entity | Domain-specific relationships |

Common custom predicates from source data:
- `AFFILIATED_WITH` - Person/organization affiliation
- `LOCATED_IN` - Place containment
- `OCCURRED_ON` - Event/date connection
- `AUTHORED_BY` - Document authorship
- `MENTIONED` - General mention

### 4.2 Getting Entity Relationships

#### Get All Relationships for an Entity

```bash
curl -X GET https://graphdb-gateway.arke.institute/relationships/{canonical_id}
```

**Response:**
```json
{
  "outgoing": [
    {
      "subject_id": "george_washington",
      "predicate": "AFFILIATED_WITH",
      "object_id": "continental_congress",
      "properties": {"role": "Commander"},
      "source_pi": "arke:01ABC123"
    },
    {
      "subject_id": "george_washington",
      "predicate": "MENTIONED_IN",
      "object_id": "arke:01ABC123",
      "properties": {},
      "source_pi": "arke:01ABC123"
    }
  ],
  "incoming": [
    {
      "subject_id": "biography_001",
      "predicate": "ABOUT",
      "object_id": "george_washington",
      "properties": {},
      "source_pi": "arke:01DEF456"
    }
  ]
}
```

#### Get All Relationships (Global)

```bash
curl -X GET https://graphdb-gateway.arke.institute/relationships
```

### 4.3 Relationship Structure

```typescript
interface Relationship {
  subject_id: string;    // Source entity canonical_id
  predicate: string;     // Relationship type (uppercase)
  object_id: string;     // Target entity canonical_id or PI
  properties: Record<string, any>;  // Additional properties
  source_pi: string;     // PI that created this relationship
}
```

---

## 5. Multi-Hop Traversal

Multi-hop traversal lets you navigate the graph from one entity to another through relationships. Here are common patterns:

### 5.1 Basic Pattern

```
START → [Relationship 1] → Entity A → [Relationship 2] → Entity B → ...
```

**Algorithm:**
1. Start with an entity (from search or known ID)
2. Get its relationships
3. Pick relevant relationship(s)
4. Fetch the target entity
5. Repeat until destination reached

### 5.2 Traversal by Semantic Similarity

**Goal**: Find a path to an entity that semantically matches a target description.

```javascript
async function traverseToSemanticallyMatchingEntity(
  startEntityId,
  targetDescription,
  similarityThreshold = 0.85,
  maxHops = 5
) {
  // Get embedding for target description
  const targetEmbedding = await getEmbedding(targetDescription);

  let currentEntity = await getEntity(startEntityId);
  let path = [currentEntity];
  let visited = new Set([currentEntity.canonical_id]);

  for (let hop = 0; hop < maxHops; hop++) {
    // Check if current entity matches target
    const similarity = await checkSimilarity(currentEntity, targetEmbedding);
    if (similarity >= similarityThreshold) {
      return { found: true, entity: currentEntity, path, similarity };
    }

    // Get relationships
    const { outgoing, incoming } = await getRelationships(currentEntity.canonical_id);
    const allRelated = [...outgoing, ...incoming];

    // Score each related entity by semantic similarity to target
    const candidates = [];
    for (const rel of allRelated) {
      const relatedId = rel.subject_id === currentEntity.canonical_id
        ? rel.object_id
        : rel.subject_id;

      if (visited.has(relatedId)) continue;

      // Skip PI nodes
      if (relatedId.startsWith('arke:')) continue;

      const relatedEntity = await getEntity(relatedId);
      const score = await checkSimilarity(relatedEntity, targetEmbedding);
      candidates.push({ entity: relatedEntity, score, relationship: rel });
    }

    if (candidates.length === 0) break;

    // Follow the most promising path
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    visited.add(best.entity.canonical_id);
    path.push({ relationship: best.relationship, entity: best.entity });
    currentEntity = best.entity;
  }

  return { found: false, path };
}
```

### 5.3 Traversal to Files

**Goal**: From any entity, find the source files (documents) it was extracted from.

```javascript
async function findSourceFiles(entityId) {
  const files = [];
  const { outgoing } = await getRelationships(entityId);

  // Find MENTIONED_IN relationships to get PIs
  const mentionedInRels = outgoing.filter(r => r.predicate === 'MENTIONED_IN');

  for (const rel of mentionedInRels) {
    const pi = rel.object_id;

    // Get all file entities from this PI
    const piFiles = await getEntities({ pi, type: 'file' });
    files.push(...piFiles.map(f => ({ ...f, source_pi: pi })));
  }

  return files;
}
```

### 5.4 Traversal to Source PI

**Goal**: Find which PI(s) an entity came from.

```javascript
async function getSourcePIs(entityId) {
  const { outgoing } = await getRelationships(entityId);

  // MENTIONED_IN tells us all PIs that reference this entity
  const mentionedIn = outgoing
    .filter(r => r.predicate === 'MENTIONED_IN')
    .map(r => r.object_id);

  return mentionedIn;
}

// Or use the entity's source_pis array directly
async function getSourcePIsFromEntity(entityId) {
  const entity = await getEntity(entityId);
  return entity.source_pis;
}
```

### 5.5 Date-Based Traversal

**Goal**: Find all entities related to a specific date.

```javascript
async function getEntitiesOnDate(dateString) {
  // Convert date to canonical ID format
  const [year, month, day] = dateString.split('-');
  const dateCanonicalId = `date_${year}_${month}_${day}`;

  // Get all incoming relationships to this date
  const { incoming } = await getRelationships(dateCanonicalId);

  // Extract the entities
  const entities = [];
  for (const rel of incoming) {
    const entity = await getEntity(rel.subject_id);
    entities.push({
      entity,
      relationship: rel.predicate,
      properties: rel.properties
    });
  }

  return entities;
}

// Example: Find all events on December 15, 2017
const events = await getEntitiesOnDate('2017-12-15');

// This could work for dates are only months or years (e.g. '2017-12' or '2017'):
```



### 5.6 Recursive Multi-Hop Example

**Goal**: Build a complete traversal from start entity to a target, following semantic relevance.

```javascript
async function multiHopSearch({
  startQuery,           // Natural language query to find start entity
  targetQuery,          // Natural language description of destination
  maxHops = 10,
  minSimilarity = 0.75, // Minimum similarity to consider a match
  entityTypeFilter = null,  // Optional: only follow certain entity types
  predicateFilter = null    // Optional: only follow certain predicates
}) {
  // Step 1: Find starting entity via semantic search
  const startEmbedding = await getEmbedding(startQuery);
  const startResults = await pineconeQuery({
    vector: startEmbedding,
    top_k: 1,
    include_metadata: true
  });

  if (startResults.matches.length === 0) {
    return { found: false, error: 'No starting entity found' };
  }

  const startEntity = await getEntity(startResults.matches[0].id);

  // Step 2: Get target embedding for comparison
  const targetEmbedding = await getEmbedding(targetQuery);

  // Step 3: BFS/DFS traversal
  const queue = [{
    entity: startEntity,
    path: [startEntity],
    depth: 0
  }];
  const visited = new Set([startEntity.canonical_id]);

  while (queue.length > 0) {
    const { entity, path, depth } = queue.shift();

    // Check if we've reached the target
    const similarity = cosineSimilarity(
      await getEmbedding(`${entity.type}: ${entity.label}`),
      targetEmbedding
    );

    if (similarity >= minSimilarity) {
      return {
        found: true,
        destination: entity,
        path,
        similarity,
        hops: depth
      };
    }

    if (depth >= maxHops) continue;

    // Get neighbors
    const { outgoing, incoming } = await getRelationships(entity.canonical_id);
    const allRels = [...outgoing, ...incoming];

    for (const rel of allRels) {
      // Apply predicate filter
      if (predicateFilter && !predicateFilter.includes(rel.predicate)) {
        continue;
      }

      const neighborId = rel.subject_id === entity.canonical_id
        ? rel.object_id
        : rel.subject_id;

      // Skip already visited
      if (visited.has(neighborId)) continue;

      // Skip PI nodes (unless specifically looking for them)
      if (neighborId.startsWith('arke:') && !targetQuery.includes('PI')) {
        continue;
      }

      const neighbor = await getEntity(neighborId);
      if (!neighbor) continue;

      // Apply type filter
      if (entityTypeFilter && !entityTypeFilter.includes(neighbor.type)) {
        continue;
      }

      visited.add(neighborId);
      queue.push({
        entity: neighbor,
        path: [...path, { relationship: rel, entity: neighbor }],
        depth: depth + 1
      });
    }
  }

  return { found: false, error: 'No path found within hop limit' };
}

// Example usage:
const result = await multiHopSearch({
  startQuery: 'George Washington',
  targetQuery: 'Original signed document',
  maxHops: 5,
  entityTypeFilter: ['person', 'organization', 'file'],
  predicateFilter: ['AUTHORED_BY', 'SIGNED_BY', 'MENTIONED_IN', 'EXTRACTED_FROM']
});
```

---

## 6. API Reference Quick Guide

### Pinecone Gateway

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/query` | POST | Semantic search with optional filters |
| `/upsert` | POST | Insert/update vectors |
| `/fetch` | POST | Get vectors by ID |
| `/update` | POST | Update vector metadata |

**Base URL**: `https://pinecone-gateway.arke.institute`

### GraphDB Gateway

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/entity/{canonical_id}` | GET | Get entity by ID |
| `/entity/create` | POST | Create new entity |
| `/entity/merge` | POST | Merge/update entity |
| `/entity/lookup/code` | POST | Find by code |
| `/entity/lookup/label` | POST | Find by label + type |
| `/entities/list` | POST | List entities by PI/type |
| `/relationships` | GET | List all relationships |
| `/relationships/{canonical_id}` | GET | Get entity's relationships |
| `/relationships/create` | POST | Create relationships |
| `/relationships/merge` | POST | Merge relationships (idempotent) |
| `/entity/find-in-hierarchy` | POST | Find in PI hierarchy |
| `/entities/hierarchy` | POST | Get hierarchy entities |
| `/query` | POST | Execute custom Cypher query |

**Base URL**: `https://graphdb-gateway.arke.institute`

### Embedding Gateway

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/embed` | POST | Generate embeddings |

**Base URL**: `https://embedding-gateway.arke.institute`

---

## Appendix: Common Cypher Queries

For advanced use cases, you can execute custom Cypher queries via the GraphDB Gateway:

### Find All Entities Related to a Date

```cypher
MATCH (e:Entity)-[r]->(d:Entity:Date {canonical_id: 'date_2017_12_15'})
RETURN e, type(r) as relationship
```

### Find Path Between Two Entities

```cypher
MATCH path = shortestPath(
  (start:Entity {canonical_id: 'george_washington'})-[*..5]-
  (end:Entity {canonical_id: 'mount_vernon'})
)
RETURN path
```

### Get All Entities from a PI and Its Children

```cypher
MATCH (pi:PI {id: 'arke:01ABC123'})-[:PARENT_OF*0..]->(child:PI)
MATCH (e:Entity)-[:MENTIONED_IN]->(child)
RETURN DISTINCT e
```

### Find Entities with Common Relationships

```cypher
MATCH (e1:Entity)-[r1]->(common)-[r2]-(e2:Entity)
WHERE e1.canonical_id = 'george_washington'
  AND e2.canonical_id <> e1.canonical_id
RETURN e2, common, type(r1), type(r2)
LIMIT 50
```

---

## Summary

1. **For semantic search**: Use Pinecone with filters on `type`, `canonical_id`, `source_pi`
2. **For exact lookups**: Use GraphDB's `/entity/lookup/*` endpoints
3. **For relationships**: Use `/relationships/{canonical_id}` to get all connections
4. **For multi-hop**: Combine relationship queries with semantic scoring
5. **For dates**: Use deterministic IDs (`date_YYYY_MM_DD`) and query incoming relationships
6. **For files**: Filter by `type: "file"` and use `EXTRACTED_FROM`/`MENTIONED_IN`
7. **For PI traversal**: Use hierarchy endpoints or `MENTIONED_IN` relationships
