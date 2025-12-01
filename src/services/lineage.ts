/**
 * PI Lineage Client
 */

import type { LineageResponse } from '../types';

export interface LineageResult {
  pis: string[];
  truncated: boolean;
}

export class LineageClient {
  constructor(private service: Fetcher) {}

  /**
   * Get PI lineage (ancestors, descendants, or both)
   * Returns flat array of PI IDs including the source PI
   */
  async getLineage(
    sourcePi: string,
    direction: 'ancestors' | 'descendants' | 'both',
    maxHops: number = 50
  ): Promise<LineageResult> {
    const response = await this.service.fetch('http://graphdb/pi/lineage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePi,
        direction,
        maxHops,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Lineage query failed: ${response.status} ${error}`);
    }

    const result = (await response.json()) as LineageResponse;

    // Collect all PI IDs into a flat array
    const pis = new Set<string>([sourcePi]);
    let truncated = false;

    if (result.ancestors) {
      for (const pi of result.ancestors.pis) {
        pis.add(pi.id);
      }
      if (result.ancestors.truncated) {
        truncated = true;
      }
    }

    if (result.descendants) {
      for (const pi of result.descendants.pis) {
        pis.add(pi.id);
      }
      if (result.descendants.truncated) {
        truncated = true;
      }
    }

    return {
      pis: Array.from(pis),
      truncated,
    };
  }
}
