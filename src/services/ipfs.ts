/**
 * IPFS API Client
 *
 * Fetches content from the Arke IPFS API for enrichment.
 */

const API_BASE = 'https://api.arke.institute';

export interface ManifestResponse {
  pi: string;
  ver: number;
  ts: string;
  manifest_cid: string;
  prev_cid: string | null;
  components?: Record<string, string>;
  note?: string;
}

/**
 * Determine if a PI belongs to test network (starts with "II")
 */
function isTestNetwork(pi: string): boolean {
  return pi.startsWith('II');
}

export class IpfsClient {
  /**
   * Fetch content by CID with character limit
   */
  async cat(cid: string, limit: number): Promise<{ content: string; truncated: boolean }> {
    try {
      const response = await fetch(`${API_BASE}/cat/${cid}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch CID ${cid}: ${response.status}`);
      }

      const text = await response.text();

      if (text.length > limit) {
        return { content: text.slice(0, limit), truncated: true };
      }

      return { content: text, truncated: false };
    } catch (error) {
      throw new Error(`IPFS cat failed: ${error}`);
    }
  }

  /**
   * Fetch entity manifest by PI
   */
  async getManifest(pi: string): Promise<ManifestResponse> {
    try {
      const headers: Record<string, string> = {};
      if (isTestNetwork(pi)) {
        headers['X-Arke-Network'] = 'test';
      }

      const response = await fetch(`${API_BASE}/entities/${pi}`, { headers });

      if (!response.ok) {
        throw new Error(`Failed to fetch manifest for PI ${pi}: ${response.status}`);
      }

      return (await response.json()) as ManifestResponse;
    } catch (error) {
      throw new Error(`IPFS manifest fetch failed: ${error}`);
    }
  }

  /**
   * Fetch multiple CIDs in parallel with character limit
   */
  async catMany(
    cids: { key: string; cid: string | undefined }[],
    limit: number
  ): Promise<Record<string, { content: string | null; truncated: boolean; error?: string }>> {
    const results: Record<string, { content: string | null; truncated: boolean; error?: string }> =
      {};

    await Promise.all(
      cids.map(async ({ key, cid }) => {
        if (!cid) {
          results[key] = { content: null, truncated: false };
          return;
        }

        try {
          const { content, truncated } = await this.cat(cid, limit);
          results[key] = { content, truncated };
        } catch (error) {
          results[key] = { content: null, truncated: false, error: String(error) };
        }
      })
    );

    return results;
  }
}
