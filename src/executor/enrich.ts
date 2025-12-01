/**
 * Enrichment - Fetch content for PI and File entities
 */

import type { Services } from '../services';
import type { Entity, EnrichedContent, PathResult } from '../types';

const DEFAULT_ENRICH_LIMIT = 2000;

/**
 * Enrich query results with fetched content for PI and File entities
 */
export async function enrichResults(
  results: PathResult[],
  services: Services,
  limit: number = DEFAULT_ENRICH_LIMIT
): Promise<PathResult[]> {
  // Enrich all entities in parallel
  const enrichedResults = await Promise.all(
    results.map(async (result) => {
      const content = await enrichEntity(result.entity, services, limit);
      if (content) {
        return {
          ...result,
          entity: {
            ...result.entity,
            content,
          },
        };
      }
      return result;
    })
  );

  return enrichedResults;
}

/**
 * Enrich a single entity based on its type
 */
async function enrichEntity(
  entity: Entity,
  services: Services,
  limit: number
): Promise<EnrichedContent | null> {
  if (entity.type === 'file') {
    return enrichFileEntity(entity, services, limit);
  }

  if (entity.type === 'pi') {
    return enrichPiEntity(entity, services, limit);
  }

  // Other entity types don't get enriched
  return null;
}

/**
 * Enrich a file entity by fetching its content
 */
async function enrichFileEntity(
  entity: Entity,
  services: Services,
  limit: number
): Promise<EnrichedContent> {
  const fileCid = entity.properties.file_cid as string | undefined;
  const contentType = entity.properties.content_type as string | undefined;

  if (!fileCid) {
    return { fetch_error: 'no file_cid in properties' };
  }

  try {
    const { content, truncated } = await services.ipfs.cat(fileCid, limit);

    // Plain text content
    if (contentType === 'text' || !contentType) {
      return {
        text: content,
        format: 'text',
        truncated,
      };
    }

    // ref_* types (ref_ocr, ref_description, etc.) - try to parse as JSON
    if (contentType.startsWith('ref_')) {
      try {
        const data = JSON.parse(content) as Record<string, unknown>;
        return {
          data,
          format: 'json',
          truncated,
        };
      } catch {
        // JSON parse failed - return as raw text
        return {
          raw: content,
          format: 'raw',
          parse_error: true,
          truncated,
        };
      }
    }

    // Unknown content type - return as text
    return {
      text: content,
      format: 'text',
      truncated,
    };
  } catch (error) {
    return { fetch_error: String(error) };
  }
}

/**
 * Find a component CID by checking multiple possible keys
 */
function findComponentCid(
  components: Record<string, string>,
  possibleKeys: string[]
): string | undefined {
  for (const key of possibleKeys) {
    if (components[key]) {
      return components[key];
    }
  }
  return undefined;
}

/**
 * Enrich a PI entity by fetching its manifest and component content
 */
async function enrichPiEntity(
  entity: Entity,
  services: Services,
  limit: number
): Promise<EnrichedContent> {
  // Get PI from properties or derive from canonical_id
  const pi = (entity.properties.pi as string) || entity.canonical_id.replace(/^pi_/, '');

  if (!pi) {
    return { fetch_error: 'no pi identifier' };
  }

  try {
    // Fetch manifest
    const manifest = await services.ipfs.getManifest(pi);
    const components = manifest.components || {};

    // Find pinax and description components (may have different names)
    const pinaxCid = findComponentCid(components, [
      'pinax.json',
      'pinax.xml',
      'pinax',
      'pinx',
      'pinx.json',
    ]);
    const descCid = findComponentCid(components, [
      'description',
      'description.md',
      'description.txt',
      'readme.md',
      'README.md',
    ]);

    // Fetch pinax and description in parallel
    const fetched = await services.ipfs.catMany(
      [
        { key: 'pinax', cid: pinaxCid },
        { key: 'description', cid: descCid },
      ],
      limit
    );

    const pinaxResult = fetched.pinax;
    const descResult = fetched.description;

    // Determine if any content was truncated
    const truncated = pinaxResult?.truncated || descResult?.truncated || false;

    // Try to parse pinax as JSON if present
    let pinaxContent: string | Record<string, unknown> | null = pinaxResult?.content ?? null;
    let pinaxFormat: 'text' | 'json' = 'text';
    if (pinaxContent && typeof pinaxContent === 'string') {
      try {
        pinaxContent = JSON.parse(pinaxContent) as Record<string, unknown>;
        pinaxFormat = 'json';
      } catch {
        // Keep as text if not valid JSON
      }
    }

    return {
      pinx: pinaxFormat === 'json' ? null : (pinaxContent as string | null),
      data: pinaxFormat === 'json' ? (pinaxContent as Record<string, unknown>) : undefined,
      description: descResult?.content ?? null,
      manifest: {
        version: manifest.ver,
      },
      format: pinaxFormat,
      truncated,
      ...(pinaxResult?.error && { fetch_error: `pinax: ${pinaxResult.error}` }),
      ...(descResult?.error && { fetch_error: `description: ${descResult.error}` }),
    };
  } catch (error) {
    return { fetch_error: String(error) };
  }
}
