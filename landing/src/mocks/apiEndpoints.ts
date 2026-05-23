import type { Lang } from '@/i18n';

export interface ApiEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  label: string;
  json: string;
}

const LIST_JSON = `{
  "total": 1247,
  "page": 1,
  "per_page": 20,
  "results": [
    {
      "id": "BOE-A-2018-16673",
      "title": "Ley Orgánica 3/2018, LOPDGDD",
      "in_force": true,
      "articles": 97
    },
    {
      "id": "BOE-A-1978-31229",
      "title": "Constitución Española",
      "in_force": true,
      "articles": 169
    }
  ]
}`;

const DETAIL_JSON = `{
  "id": "BOE-A-2018-16673",
  "title": "Ley Orgánica 3/2018, de Protección
           de Datos Personales y garantía
           de los derechos digitales",
  "in_force": true,
  "articles": 97,
  "pagerank": 0.084,
  "neighbors": [
    "BOE-A-1978-31229",
    "DOUE-L-2016-80807"
  ]
}`;

const DIFF_JSON = `{
  "law": "BOE-A-2018-16673",
  "from": "2018-12-05",
  "to":   "2023-05-09",
  "changes": [
    { "article": "Art. 28", "type": "modified" },
    { "article": "Art. 36", "type": "added"    },
    { "article": "Art. 81", "type": "repealed" }
  ],
  "total_changes": 12
}`;

const SEARCH_JSON = `{
  "query": "protección de datos",
  "hits":  148,
  "took":  "23ms",
  "results": [
    {
      "law": "BOE-A-2018-16673",
      "article": "Art. 5",
      "score": 0.94
    },
    {
      "law": "DOUE-L-2016-80807",
      "article": "Art. 13",
      "score": 0.91
    }
  ]
}`;

export const ENDPOINTS: Record<Lang, ApiEndpoint[]> = {
  en: [
    { method: 'GET', path: '/api/v1/laws',            label: 'List laws',             json: LIST_JSON },
    { method: 'GET', path: '/api/v1/laws/{id}',       label: 'Get law',               json: DETAIL_JSON },
    { method: 'GET', path: '/api/v1/laws/{id}/diff',  label: 'Diff between versions', json: DIFF_JSON },
    { method: 'GET', path: '/api/v1/search?q=',       label: 'Full-text search',      json: SEARCH_JSON },
  ],
  es: [
    { method: 'GET', path: '/api/v1/laws',            label: 'Listar leyes',          json: LIST_JSON },
    { method: 'GET', path: '/api/v1/laws/{id}',       label: 'Detalle de una ley',    json: DETAIL_JSON },
    { method: 'GET', path: '/api/v1/laws/{id}/diff',  label: 'Diff entre versiones',  json: DIFF_JSON },
    { method: 'GET', path: '/api/v1/search?q=',       label: 'Búsqueda full-text',    json: SEARCH_JSON },
  ],
};
