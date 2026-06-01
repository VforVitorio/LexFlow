/**
 * `liveApi.chat` — threads list/load + SSE send.
 *
 * The HTTP transport is not wired here yet (issues #83 + #84 + #195
 * track that work). All three methods throw `ApiError(501)` so the
 * SPA fails loudly under `VITE_USE_MOCK=false`. Switch back to mock
 * mode to keep ChatPage exercisable until the backend lands.
 */

import type { ApiClient } from '../types';
import { ApiError } from './http';

export const liveChatApi: ApiClient['chat'] = {
  threads: () => Promise.reject(new ApiError(501, null, 'chat.threads not implemented (issue #83)')),
  thread: () => Promise.reject(new ApiError(501, null, 'chat.thread not implemented (issue #83)')),
  async *send() {
    throw new ApiError(501, null, 'chat.send not implemented (issue #84)');
  },
};
