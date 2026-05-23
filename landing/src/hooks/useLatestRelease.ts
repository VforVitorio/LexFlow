import { useQuery } from '@tanstack/react-query';

interface Release {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
}

interface UseLatestReleaseResult {
  /** Tag name without the leading "v" (eg. "0.2.0"). `null` while loading or on error. */
  version: string | null;
  /** Raw tag (eg. "v0.2.0"). */
  tag: string | null;
  /** Direct link to the release page on GitHub. */
  url: string | null;
  /** ISO date string. */
  publishedAt: string | null;
}

/**
 * Fetches the most recent published release from the LexFlow repository.
 *
 * GitHub's anonymous REST API allows 60 requests / hour / IP — plenty for
 * a landing page since TanStack Query caches the result for the whole
 * session (staleTime: Infinity). Same pattern docs.f1stratlab.com uses for
 * its "v1.5.2" badge.
 *
 * Returns `null` for every field while loading or if the request fails so
 * consumers can render a graceful placeholder ("pre-alpha") without a
 * runtime error.
 */
export function useLatestRelease(): UseLatestReleaseResult {
  const { data } = useQuery<Release>({
    queryKey: ['latest-release', 'VforVitorio/LexFlow'],
    queryFn: async () => {
      const res = await fetch(
        'https://api.github.com/repos/VforVitorio/LexFlow/releases/latest',
        { headers: { Accept: 'application/vnd.github+json' } },
      );
      if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
      return res.json();
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (!data?.tag_name) {
    return { version: null, tag: null, url: null, publishedAt: null };
  }
  return {
    version: data.tag_name.replace(/^v/, ''),
    tag: data.tag_name,
    url: data.html_url,
    publishedAt: data.published_at,
  };
}
