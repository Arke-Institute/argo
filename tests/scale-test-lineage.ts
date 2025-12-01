/**
 * Scale test for PI lineage filtering with 1000 PIs
 *
 * Tests whether Pinecone's $in operator works efficiently with large arrays.
 * Creates 1000 PIs in a lineage and tests query performance.
 */

const GRAPHDB_URL = 'https://graphdb-gateway.arke.institute';
const EMBEDDING_URL = 'https://embedding-worker.arke.institute';
const PINECONE_URL = 'https://pinecone-gateway.arke.institute';
const ARGO_URL = process.env.ARGO_URL || 'https://argo.arke.institute';

const PREFIX = 'scale_test_';
const NUM_PIS = 1000;
const ENTITIES_PER_PI = 2; // Keep small to focus on PI count test

async function createPIs(): Promise<string[]> {
  console.log(`\n🏷️  Creating ${NUM_PIS} PI nodes...`);
  const startTime = Date.now();

  const piIds: string[] = [];
  const rootPi = `${PREFIX}pi_root`;

  // Create root PI
  await fetch(`${GRAPHDB_URL}/pi/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pi: rootPi }),
  });
  piIds.push(rootPi);

  // Create child PIs in batches (all children of root for flat hierarchy)
  const BATCH_SIZE = 50;
  for (let i = 0; i < NUM_PIS - 1; i += BATCH_SIZE) {
    const promises = [];
    const batchEnd = Math.min(i + BATCH_SIZE, NUM_PIS - 1);

    for (let j = i; j < batchEnd; j++) {
      const piId = `${PREFIX}pi_${String(j).padStart(4, '0')}`;
      piIds.push(piId);

      promises.push(
        fetch(`${GRAPHDB_URL}/pi/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pi: piId, parent: rootPi }),
        })
      );
    }

    await Promise.all(promises);
    process.stdout.write(`\r   Created ${piIds.length}/${NUM_PIS} PIs...`);
  }

  console.log(`\n   ✓ Created ${piIds.length} PIs in ${Date.now() - startTime}ms`);
  return piIds;
}

async function createEntities(piIds: string[]): Promise<void> {
  console.log(`\n📦 Creating entities (${ENTITIES_PER_PI} per PI)...`);
  const startTime = Date.now();

  const entities: Array<{
    canonical_id: string;
    code: string;
    label: string;
    type: string;
    properties: Record<string, unknown>;
    source_pi: string;
  }> = [];

  // Create entities for a subset of PIs to keep it manageable
  // We'll create entities in every 10th PI to have ~100 entities
  const piSample = piIds.filter((_, i) => i % 10 === 0);

  for (const pi of piSample) {
    for (let i = 0; i < ENTITIES_PER_PI; i++) {
      const id = `${pi}_entity_${i}`;
      entities.push({
        canonical_id: id,
        code: id,
        label: `Entity ${i} in ${pi.replace(PREFIX, '')}`,
        type: i % 2 === 0 ? 'document' : 'person',
        properties: { index: i, pi: pi },
        source_pi: pi,
      });
    }
  }

  console.log(`   Creating ${entities.length} entities across ${piSample.length} PIs...`);

  // Create entities in batches
  const BATCH_SIZE = 20;
  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const batch = entities.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(entity =>
        fetch(`${GRAPHDB_URL}/entity/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entity),
        })
      )
    );
    process.stdout.write(`\r   Created ${Math.min(i + BATCH_SIZE, entities.length)}/${entities.length} entities...`);
  }

  console.log(`\n   ✓ Created ${entities.length} entities in ${Date.now() - startTime}ms`);

  // Embed and upsert
  console.log(`\n🧠 Embedding and upserting to Pinecone...`);
  const embedStartTime = Date.now();

  const texts = entities.map(e => `${e.type}: ${e.label}`);

  // Embed in batches
  const allEmbeddings: number[][] = [];
  const EMB_BATCH_SIZE = 50;

  for (let i = 0; i < texts.length; i += EMB_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMB_BATCH_SIZE);
    const response = await fetch(`${EMBEDDING_URL}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: batch,
        model: 'text-embedding-3-small',
        dimensions: 768,
      }),
    });

    const { embeddings } = await response.json() as { embeddings: number[][] };
    allEmbeddings.push(...embeddings);
    process.stdout.write(`\r   Embedded ${allEmbeddings.length}/${texts.length}...`);
  }

  // Upsert to Pinecone
  const vectors = entities.map((e, i) => ({
    id: e.canonical_id,
    values: allEmbeddings[i],
    text: texts[i],
    metadata: {
      canonical_id: e.canonical_id,
      label: e.label,
      type: e.type,
      source_pi: e.source_pi,
    },
  }));

  const UPSERT_BATCH_SIZE = 100;
  for (let i = 0; i < vectors.length; i += UPSERT_BATCH_SIZE) {
    const batch = vectors.slice(i, i + UPSERT_BATCH_SIZE);
    await fetch(`${PINECONE_URL}/upsert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vectors: batch }),
    });
  }

  console.log(`\n   ✓ Embedded and upserted in ${Date.now() - embedStartTime}ms`);
}

async function verifyLineage(): Promise<number> {
  console.log(`\n🔍 Verifying lineage returns ${NUM_PIS} PIs...`);

  const response = await fetch(`${GRAPHDB_URL}/pi/lineage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourcePi: `${PREFIX}pi_root`,
      direction: 'descendants',
      maxHops: 10,
    }),
  });

  const lineage = await response.json() as {
    descendants?: { pis: Array<{ id: string }>; count: number; truncated: boolean };
  };

  const piCount = (lineage.descendants?.count || 0) + 1; // +1 for root
  console.log(`   Lineage returned ${piCount} PIs (truncated: ${lineage.descendants?.truncated})`);

  return piCount;
}

async function runPerformanceTests(expectedPiCount: number): Promise<void> {
  console.log(`\n⚡ Running performance tests with ${expectedPiCount} PIs in lineage...\n`);

  const tests = [
    {
      name: 'Semantic search with 1000 PI lineage filter',
      query: {
        path: '"document entity" type:document',
        k: 10,
        lineage: { sourcePi: `${PREFIX}pi_root`, direction: 'descendants' },
      },
    },
    {
      name: 'Semantic search without lineage filter (baseline)',
      query: {
        path: '"document entity" type:document',
        k: 10,
      },
    },
    {
      name: 'Exact ID with lineage filter',
      query: {
        path: `@${PREFIX}pi_root_entity_0`,
        lineage: { sourcePi: `${PREFIX}pi_root`, direction: 'descendants' },
      },
    },
  ];

  for (const test of tests) {
    const times: number[] = [];
    const RUNS = 3;

    console.log(`📋 ${test.name}`);

    for (let i = 0; i < RUNS; i++) {
      const startTime = Date.now();

      const response = await fetch(`${ARGO_URL}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(test.query),
      });

      const result = await response.json() as {
        results: Array<{ entity: { canonical_id: string } }>;
        metadata: { execution_time_ms: number; lineage?: { piCount: number } };
      };

      const totalTime = Date.now() - startTime;
      const serverTime = result.metadata.execution_time_ms;
      times.push(serverTime);

      if (i === 0) {
        console.log(`   Results: ${result.results.length}`);
        if (result.metadata.lineage) {
          console.log(`   PIs in lineage: ${result.metadata.lineage.piCount}`);
        }
      }
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    console.log(`   Server execution time: avg=${avgTime.toFixed(0)}ms, min=${minTime}ms, max=${maxTime}ms`);
    console.log('');
  }
}

async function cleanup(): Promise<void> {
  console.log(`\n🧹 Cleaning up test data...`);

  const response = await fetch(`${GRAPHDB_URL}/admin/clear-test-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: PREFIX }),
  });

  const result = await response.json() as { data?: { deleted_nodes: number } };
  console.log(`   ✓ Deleted ${result.data?.deleted_nodes || 0} nodes`);
}

async function main() {
  const args = process.argv.slice(2);
  const skipSetup = args.includes('--skip-setup');
  const skipCleanup = args.includes('--skip-cleanup');
  const cleanupOnly = args.includes('--cleanup');

  console.log('='.repeat(70));
  console.log('🚀 PI Lineage Scale Test - 1000 PIs');
  console.log('='.repeat(70));
  console.log(`\nTarget: Test Pinecone $in operator with ${NUM_PIS} PIs`);
  console.log(`Argo URL: ${ARGO_URL}`);

  try {
    if (cleanupOnly) {
      await cleanup();
      return;
    }

    if (!skipSetup) {
      const piIds = await createPIs();
      await createEntities(piIds);
    }

    const piCount = await verifyLineage();
    await runPerformanceTests(piCount);

    if (!skipCleanup) {
      await cleanup();
    }

    console.log('='.repeat(70));
    console.log('✅ Scale test complete!');
    console.log('='.repeat(70));
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
