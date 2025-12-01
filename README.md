# Argo - Path Query Engine

A graph traversal engine for the Thalassa knowledge graph with semantic flexibility. Argo enables natural language-like queries over the knowledge graph using fuzzy edge matching and semantic search.

Deployed link-search worker
https://link-search.nick-chimicles-professional.workers.dev
argo.arke.institute (custom domain)

## Quick Start

```bash
# Install dependencies
npm install

# Run locally (connects to live services)
npm run dev

# Run tests (requires test data)
npm run test:setup  # Set up test data
npm run test        # Run tests
npm run test:teardown  # Clean up test data
```

## API Endpoints

### Health Check

```
GET /health
GET /
```

Returns service status:
```json
{
  "status": "ok",
  "service": "argo",
  "version": "0.1.0"
}
```

### Parse Query

```
GET /parse?path=<query>
```

Parses a path query and returns the AST without executing. Useful for validation.

**Example:**
```bash
curl 'http://localhost:8787/parse?path=@washington%20-[born]->%20type:date'
```

### Execute Query

```
POST /query
Content-Type: application/json
```

**Request Body:**
```json
{
  "path": "@george_washington -[born]-> type:date",
  "k": 5,
  "k_explore": 15,
  "lineage": {
    "sourcePi": "arke:my_collection",
    "direction": "descendants"
  },
  "enrich": true,
  "enrich_limit": 2000
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | string | required | The path query to execute |
| `k` | int | 5 | Number of final results to return |
| `k_explore` | int | `k * 3` | Beam width for exploration (candidates per hop) |
| `lineage` | object | null | Scope query to a PI hierarchy (see Lineage Filtering) |
| `enrich` | bool | false | Fetch content for PI and File entities |
| `enrich_limit` | int | 2000 | Max characters per entity when enriching |

**Response:**
```json
{
  "results": [
    {
      "entity": {
        "canonical_id": "date_1732_02_22",
        "label": "February 22, 1732",
        "type": "date",
        "properties": {},
        "source_pis": ["arke:my_collection"],
        "content": {
          "text": "Document content here...",
          "format": "text",
          "truncated": false
        }
      },
      "path": [
        { "entity": "george_washington", "label": "George Washington", "type": "person" },
        { "edge": "BORN_ON", "direction": "outgoing", "score": 0.92 },
        { "entity": "date_1732_02_22", "label": "February 22, 1732", "type": "date" }
      ],
      "score": 0.92
    }
  ],
  "metadata": {
    "query": "@george_washington -[born]-> type:date",
    "hops": 1,
    "k": 5,
    "k_explore": 15,
    "total_candidates_explored": 1,
    "execution_time_ms": 245,
    "lineage": {
      "sourcePi": "arke:my_collection",
      "direction": "descendants",
      "piCount": 15,
      "truncated": false
    }
  }
}
```

## Query Syntax

### Entry Points

| Syntax | Description | Example |
|--------|-------------|---------|
| `"text"` | Semantic search | `"George Washington"` |
| `@id` | Exact entity lookup | `@george_washington` |

### Edge Traversal

| Syntax | Description |
|--------|-------------|
| `-[term]->` | Outgoing edge with fuzzy match |
| `<-[term]-` | Incoming edge with fuzzy match |
| `<-[term]->` | Bidirectional (both directions) |
| `-[term1, term2]->` | Match ANY of the terms |
| `-[*]->` | Wildcard (any relation) |
| `<-[*]->` | Bidirectional wildcard |

### Variable-Depth Traversal

| Syntax | Description |
|--------|-------------|
| `-[*]{1,4}->` | 1 to 4 hops |
| `-[*]{,4}->` | Up to 4 hops (shorthand for {1,4}) |
| `-[*]{2,}->` | 2+ hops (capped by default max) |
| `-[*]{3}->` | Exactly 3 hops |
| `-[term]{1,3}->` | Variable depth with fuzzy relation |

### Node Filters

| Syntax | Description | Example |
|--------|-------------|---------|
| `type:typename` | Filter by type | `type:person` |
| `type:typename ~ "text"` | Type + semantic ranking | `type:event ~ "military battle"` |
| `@id` | Exact entity match | `@mount_vernon` |
| `"text"` | Semantic filter | `"historical event"` |

### Zero-Hop Queries (Direct Entity Search)

Zero-hop queries find entities without traversing edges. Use these when you want to find entities directly by semantic similarity and type, without any relationship traversal.

| Syntax | Description | Example |
|--------|-------------|---------|
| `"text" type:typename` | Semantic search filtered by type | `"physician doctor" type:person` |
| `"text" type:typename ~ "text"` | Semantic search + type + re-ranking | `"medical" type:person ~ "author"` |

**When to use zero-hop queries:**
- Finding entities by description without knowing their connections
- "Who are the physicians?" → `"physician doctor author" type:person`
- "What documents mention diplomacy?" → `"diplomacy treaty" type:document`

**When to use edge traversal instead:**
- Finding things connected to a known entity: `@spigelia <-[treated_with]- type:document`
- Multi-hop exploration: `@academy <-[affiliated]- type:person -[authored]-> type:document`

### Example Queries

```bash
# When was George Washington born?
"George Washington" -[born, birth]-> type:date

# Who signed the Declaration?
@declaration -[signed, signer]-> type:person

# Find events similar to "military battle"
@george_washington -[*]-> type:event ~ "military battle war"

# Two-hop: find people in the same organization
@george_washington -[affiliated]-> type:organization <-[affiliated]- type:person

# Open-ended exploration with semantic filter
"Thomas Jefferson" -[*]-> "significant historical"

# Variable-depth: find files within 4 hops
@george_washington -[*]{1,4}-> type:file

# Variable-depth: find people through organizations
@declaration -[*]{,3}-> type:person

# Variable-depth with semantic filter
@george_washington -[*]{1,3}-> type:event ~ "military battle"

# Stacked variable-depth: find orgs through people
@declaration -[*]{1,2}-> type:person -[*]{,3}-> type:organization

# Zero-hop: find physicians directly
"physician doctor author" type:person

# Zero-hop with re-ranking
"medical professional" type:person ~ "researcher author"
```

## Lineage Filtering

Scope queries to entities within a PI (Processing Instance) hierarchy. This restricts results to a specific data source or collection.

```json
{
  "path": "\"physician\" type:person",
  "lineage": {
    "sourcePi": "arke:drexel_collection",
    "direction": "descendants"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `sourcePi` | string | The PI to start lineage resolution from |
| `direction` | string | `"ancestors"`, `"descendants"`, or `"both"` |

**How it works:**
1. Before query execution, the lineage API resolves all PIs in the specified direction
2. Entry point resolution filters Pinecone by `source_pi $in [allowed_pis]`
3. Each hop filters relationships and entities by source PI
4. Results only include data from the allowed PI hierarchy

**Use cases:**
- Scope to a collection: `"direction": "descendants"` from a collection PI
- Find provenance: `"direction": "ancestors"` to trace data sources
- Full context: `"direction": "both"` for complete lineage

## Content Enrichment

Fetch actual content for File and PI entities in results.

```json
{
  "path": "@some_document",
  "enrich": true,
  "enrich_limit": 5000
}
```

**For File entities** (based on `content_type`):
- `text`: Raw text content from IPFS
- `ref_json`, `ref_*`: Parsed JSON blob with structured data

```json
{
  "content": {
    "text": "Document content here...",
    "format": "text",
    "truncated": false
  }
}
```

**For PI entities**:
- Fetches manifest metadata from IPFS

```json
{
  "content": {
    "pinx": "drexel",
    "description": "Historical documents from Drexel University",
    "manifest": {
      "version": 1,
      "children_count": 15
    }
  }
}
```

## Bidirectional Traversal

Follow edges in both directions simultaneously using `<-[...]->` syntax:

```bash
# Find all entities connected to Spigelia in any direction
@drexel_test_spigelia <-[*]->

# Find family connections in both directions
@george_washington <-[family, relative]-> type:person

# Variable depth bidirectional
@entity <-[*]{1,3}-> type:document
```

## Architecture

Argo is a Cloudflare Worker that connects to:
- **GraphDB Gateway** - Neo4j graph database for entity/relationship storage
- **Pinecone Gateway** - Vector database for semantic search
- **Embedding Gateway** - Text embedding service

## Documentation

- [PATH_QUERY_SPEC.md](./PATH_QUERY_SPEC.md) - Full query language specification
- [QUERYING_GUIDE.md](./QUERYING_GUIDE.md) - Guide for querying the knowledge graph

## Development

```bash
# Type check
npm run check

# Deploy to production
npm run deploy
```

## License

Private - Arke Institute
