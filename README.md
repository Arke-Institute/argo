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
  "k_explore": 15
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `path` | string | required | The path query to execute |
| `k` | int | 5 | Number of final results to return |
| `k_explore` | int | `k * 3` | Beam width for exploration (candidates per hop) |

**Response:**
```json
{
  "results": [
    {
      "entity": {
        "canonical_id": "date_1732_02_22",
        "label": "February 22, 1732",
        "type": "date"
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
    "execution_time_ms": 245
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
| `-[term1, term2]->` | Match ANY of the terms |
| `-[*]->` | Wildcard (any relation) |

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
