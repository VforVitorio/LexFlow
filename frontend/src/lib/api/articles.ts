/**
 * `liveApi.articles` — fetch a single article by `(lawId, num)`.
 *
 * Backend returns `{ law_id, law_title, article }`; we discard
 * `law_title` (the SPA already has it from the law context) and
 * forward the article payload through the shared transformer.
 */

import type { BackendArticleResponse } from '../../api';
import type { ApiClient } from '../types';
import { http } from './http';
import { transformArticle } from './transformers';

export const liveArticlesApi: ApiClient['articles'] = {
  get: async (lawId, num) => {
    const raw = await http<BackendArticleResponse>(
      `/laws/${encodeURIComponent(lawId)}/articles/${encodeURIComponent(num)}`,
    );
    return transformArticle(raw.law_id, raw.article);
  },
};
