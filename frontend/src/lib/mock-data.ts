/**
 * LexFlow — seed data for the mock API.
 *
 * Real Spanish law titles and BOE identifiers; the article bodies are written
 * to feel faithful and grammatical but are NOT verbatim from the BOE.
 *
 * Wired through `src/lib/api.mock.ts`. Replace by the real FastAPI client
 * when ready — `src/lib/api.ts` is the single swap point.
 */

import type {
  Law, LawDetail, Article, LawVersion, GraphData, ChatThread, ChatMessage,
  Model, SyncStatus, DashboardData, ArticleDiff,
} from './types';

// ─── Laws ────────────────────────────────────────────────────────────────

export const LAWS: Law[] = [
  {
    id: 'CE-1978', boe: 'BOE-A-1978-31229',
    title: 'Constitución Española',
    short: 'Constitución',
    status: 'vigente', rango: 'Norma constitucional',
    publicada: '1978-12-29', ambito: 'Estatal',
    articulos: 169, referencias: 1248, versiones: 13,
    ultimaModificacion: '2011-09-27',
    tags: ['derechos-fundamentales', 'organizacion-territorial', 'corona', 'tribunal-constitucional'],
  },
  {
    id: 'BOE-A-1889-4763', boe: 'BOE-A-1889-4763',
    title: 'Real Decreto de 24 de julio de 1889, por el que se publica el Código Civil',
    short: 'Código Civil',
    status: 'vigente', rango: 'Real Decreto',
    publicada: '1889-07-25', ambito: 'Estatal',
    articulos: 1976, referencias: 4502, versiones: 87,
    ultimaModificacion: '2024-03-05',
    tags: ['civil', 'familia', 'sucesiones', 'obligaciones', 'contratos', 'propiedad'],
  },
  {
    id: 'LO-3-2018', boe: 'BOE-A-2018-16673',
    title: 'Ley Orgánica 3/2018, de 5 de diciembre, de Protección de Datos Personales y garantía de los derechos digitales',
    short: 'LOPDGDD',
    status: 'vigente', rango: 'Ley Orgánica',
    publicada: '2018-12-06', ambito: 'Estatal',
    articulos: 97, referencias: 612, versiones: 4,
    ultimaModificacion: '2023-05-11',
    tags: ['proteccion-datos', 'derechos-digitales', 'privacidad', 'rgpd', 'compliance'],
  },
  {
    id: 'L-39-2015', boe: 'BOE-A-2015-10565',
    title: 'Ley 39/2015, de 1 de octubre, del Procedimiento Administrativo Común de las Administraciones Públicas',
    short: 'LPAC',
    status: 'vigente', rango: 'Ley',
    publicada: '2015-10-02', ambito: 'Estatal',
    articulos: 133, referencias: 891, versiones: 8,
    ultimaModificacion: '2023-12-19',
    tags: ['administrativo', 'procedimiento', 'administracion-publica', 'transparencia'],
  },
  {
    id: 'RDL-1-1995', boe: 'BOE-A-1995-7730',
    title: 'Real Decreto Legislativo 1/1995, por el que se aprueba el texto refundido de la Ley del Estatuto de los Trabajadores',
    short: 'Estatuto Trabajadores',
    status: 'derogada', rango: 'RD Legislativo',
    publicada: '1995-03-29', ambito: 'Estatal',
    articulos: 92, referencias: 2104, versiones: 42,
    tags: ['laboral', 'trabajo', 'contratos', 'despido', 'historico'],
  },
  {
    id: 'RDL-2-2015', boe: 'BOE-A-2015-11430',
    title: 'Real Decreto Legislativo 2/2015, por el que se aprueba el texto refundido de la Ley del Estatuto de los Trabajadores',
    short: 'Estatuto Trabajadores (2015)',
    status: 'modificada', rango: 'RD Legislativo',
    publicada: '2015-10-24', ambito: 'Estatal',
    articulos: 95, referencias: 1837, versiones: 19,
    ultimaModificacion: '2024-09-30',
    tags: ['laboral', 'trabajo', 'contratos', 'despido', 'jornada', 'compliance'],
  },
  {
    id: 'LO-10-1995', boe: 'BOE-A-1995-25444',
    title: 'Ley Orgánica 10/1995, de 23 de noviembre, del Código Penal',
    short: 'Código Penal',
    status: 'modificada', rango: 'Ley Orgánica',
    publicada: '1995-11-24', ambito: 'Estatal',
    articulos: 639, referencias: 2912, versiones: 35,
    ultimaModificacion: '2024-06-12',
    tags: ['penal', 'delitos', 'compliance', 'corrupcion', 'ciberdelitos'],
  },
  {
    id: 'L-15-2022', boe: 'BOE-A-2022-11589',
    title: 'Ley 15/2022, de 12 de julio, integral para la igualdad de trato y la no discriminación',
    short: 'Ley Zerolo',
    status: 'vigente', rango: 'Ley',
    publicada: '2022-07-13', ambito: 'Estatal',
    articulos: 50, referencias: 138, versiones: 2,
    tags: ['derechos-fundamentales', 'igualdad', 'discriminacion', 'compliance'],
  },
];

// ─── Law detail (Constitución, partial hierarchy) ───────────────────────

export const LAW_DETAIL: Record<string, LawDetail> = {
  'CE-1978': {
    ...LAWS[0],
    hierarchy: [
      {
        id: 't-preliminar', kind: 'titulo', label: 'Título Preliminar',
        heading: 'De los principios generales',
        children: [
          { id: 'ce-1', kind: 'articulo', label: 'Art. 1', heading: 'Estado social y democrático' },
          { id: 'ce-2', kind: 'articulo', label: 'Art. 2', heading: 'Unidad de la nación' },
        ],
      },
      {
        id: 't1', kind: 'titulo', label: 'Título I',
        heading: 'De los derechos y deberes fundamentales',
        children: [
          {
            id: 't1-c2', kind: 'capitulo', label: 'Capítulo II',
            heading: 'Derechos y libertades',
            children: [
              { id: 'ce-14', kind: 'articulo', label: 'Art. 14', heading: 'Igualdad ante la ley' },
              { id: 'ce-15', kind: 'articulo', label: 'Art. 15', heading: 'Derecho a la vida' },
              { id: 'ce-18', kind: 'articulo', label: 'Art. 18', heading: 'Honor, intimidad e imagen' },
              { id: 'ce-20', kind: 'articulo', label: 'Art. 20', heading: 'Libertad de expresión' },
            ],
          },
          { id: 't1-c3', kind: 'capitulo', label: 'Capítulo III', heading: 'Principios rectores' },
        ],
      },
      { id: 't2', kind: 'titulo', label: 'Título II', heading: 'De la Corona' },
    ],
    articles: [],
  },
  'LO-3-2018': {
    ...LAWS[2],
    hierarchy: [
      { id: 't1', kind: 'titulo', label: 'Título I', heading: 'Disposiciones generales' },
      { id: 't2', kind: 'titulo', label: 'Título II', heading: 'Principios de protección de datos',
        children: [
          { id: 'a11', kind: 'articulo', label: 'Art. 11', heading: 'Transparencia e información' },
          { id: 'a13', kind: 'articulo', label: 'Art. 13', heading: 'Tratamientos en el ámbito sanitario' },
          { id: 'a17', kind: 'articulo', label: 'Art. 17', heading: 'Sistemas de información crediticia' },
        ],
      },
      { id: 't5', kind: 'titulo', label: 'Título V', heading: 'Responsable y encargado',
        children: [
          { id: 'a28', kind: 'articulo', label: 'Art. 28', heading: 'Medidas de responsabilidad activa' },
        ],
      },
    ],
    articles: [],
  },
};

// ─── Articles (sample: Constitución Título I) ───────────────────────────

export const ARTICLES: Article[] = [
  {
    id: 'CE-1978::10', lawId: 'CE-1978', num: '10',
    titulo: 'Dignidad de la persona',
    body: [
      { marker: '1', text: 'La dignidad de la persona, los derechos inviolables que le son inherentes, el libre desarrollo de la personalidad, el respeto a la ley y a los derechos de los demás son fundamento del orden político y de la paz social.', citations: [] },
      { marker: '2', text: 'Las normas relativas a los derechos fundamentales y a las libertades que la Constitución reconoce se interpretarán de conformidad con la Declaración Universal de Derechos Humanos y los tratados y acuerdos internacionales sobre las mismas materias ratificados por España.',
        citations: [
          { label: 'DUDH', kind: 'treaty' },
          { label: 'CEDH', kind: 'treaty' },
          { label: 'art. 96 CE', kind: 'article', target: { lawId: 'CE-1978', articleNum: '96' } },
        ],
      },
    ],
    refs: [
      { label: 'DUDH', kind: 'treaty' },
      { label: 'CEDH', kind: 'treaty' },
      { label: 'art. 96 CE', kind: 'article', target: { lawId: 'CE-1978', articleNum: '96' } },
    ],
  },
  {
    id: 'CE-1978::14', lawId: 'CE-1978', num: '14',
    titulo: 'Principio de igualdad',
    body: [
      { marker: null, text: 'Los españoles son iguales ante la ley, sin que pueda prevalecer discriminación alguna por razón de nacimiento, raza, sexo, religión, opinión o cualquier otra condición o circunstancia personal o social.',
        citations: [
          { label: 'Ley 15/2022', kind: 'law', target: { lawId: 'L-15-2022' } },
        ],
      },
    ],
    refs: [
      { label: 'Ley 15/2022', kind: 'law', target: { lawId: 'L-15-2022' } },
      { label: 'LO 3/2007', kind: 'law' },
      { label: 'STC 200/2001', kind: 'jurisprudence' },
    ],
  },
  {
    id: 'CE-1978::15', lawId: 'CE-1978', num: '15',
    titulo: 'Derecho a la vida e integridad',
    body: [
      { marker: null, text: 'Todos tienen derecho a la vida y a la integridad física y moral, sin que, en ningún caso, puedan ser sometidos a tortura ni a penas o tratos inhumanos o degradantes. Queda abolida la pena de muerte, salvo lo que puedan disponer las leyes penales militares para tiempos de guerra.',
        citations: [],
      },
    ],
    refs: [
      { label: 'CEDH art. 2', kind: 'treaty' },
      { label: 'CEDH art. 3', kind: 'treaty' },
      { label: 'LO 1/2015', kind: 'law' },
    ],
  },
  {
    id: 'CE-1978::18', lawId: 'CE-1978', num: '18',
    titulo: 'Derecho al honor, intimidad y propia imagen',
    body: [
      { marker: '1', text: 'Se garantiza el derecho al honor, a la intimidad personal y familiar y a la propia imagen.', citations: [] },
      { marker: '2', text: 'El domicilio es inviolable. Ninguna entrada o registro podrá hacerse en él sin consentimiento del titular o resolución judicial, salvo en caso de flagrante delito.', citations: [] },
      { marker: '3', text: 'Se garantiza el secreto de las comunicaciones y, en especial, de las postales, telegráficas y telefónicas, salvo resolución judicial.', citations: [] },
      { marker: '4', text: 'La ley limitará el uso de la informática para garantizar el honor y la intimidad personal y familiar de los ciudadanos y el pleno ejercicio de sus derechos.',
        citations: [
          { label: 'LO 3/2018', kind: 'law', target: { lawId: 'LO-3-2018' } },
        ],
      },
    ],
    refs: [
      { label: 'LO 3/2018', kind: 'law', target: { lawId: 'LO-3-2018' } },
      { label: 'LO 1/1982', kind: 'law' },
      { label: 'LECrim art. 588', kind: 'article' },
    ],
  },
];

// ─── Versions / Diff ─────────────────────────────────────────────────────

export const VERSIONS: Record<string, LawVersion[]> = {
  'LO-3-2018': [
    { tag: 'v1.0', date: '2018-12-06', label: 'Publicación original', kind: 'publish' },
    { tag: 'v1.1', date: '2020-09-15', label: 'RDL 28/2020 · arts. 22, 73', kind: 'amend', changedArticles: ['22', '73'] },
    { tag: 'v1.2', date: '2022-07-13', label: 'Ley 15/2022 · disp. final 4ª', kind: 'amend', changedArticles: ['28'] },
    { tag: 'v1.3', date: '2023-05-11', label: 'Ley 11/2023 · arts. 11–14', kind: 'amend', changedArticles: ['11', '13', '14', '17', '22', '28', '63', '73'] },
  ],
};

const ART_11_DIFF: ArticleDiff = {
  num: '11', titulo: 'Transparencia e información al afectado',
  totals: { added: 4, removed: 4 },
  left: { tag: 'v1.0', date: '2018-12-06', lines: [
    { t: 'eq', s: '1. Cuando los datos personales sean obtenidos del afectado el responsable del tratamiento podrá dar cumplimiento al deber de información establecido en el artículo 13 del Reglamento (UE) 2016/679 facilitando al afectado la información básica a la que se refiere el apartado siguiente.' },
    { t: 'eq', s: '' },
    { t: 'del', s: '2. La información básica a la que se refiere el apartado anterior deberá contener, al menos:' },
    { t: 'del', s: 'a) La identidad del responsable del tratamiento y de su representante, en su caso.' },
    { t: 'del', s: 'b) La finalidad del tratamiento.' },
    { t: 'del', s: 'c) La posibilidad de ejercer los derechos establecidos en los artículos 15 a 22 del Reglamento.' },
    { t: 'eq', s: '' },
    { t: 'eq', s: '3. Cuando los datos personales no hubieran sido obtenidos del afectado, el responsable podrá dar cumplimiento al deber de información establecido en el artículo 14 del Reglamento (UE) 2016/679.' },
  ]},
  right: { tag: 'v1.3', date: '2023-05-11', lines: [
    { t: 'eq', s: '1. Cuando los datos personales sean obtenidos del afectado el responsable del tratamiento podrá dar cumplimiento al deber de información establecido en el artículo 13 del Reglamento (UE) 2016/679 facilitando al afectado la información básica a la que se refiere el apartado siguiente.' },
    { t: 'eq', s: '' },
    { t: 'add', s: '2. La información básica a la que se refiere el apartado anterior deberá contener, al menos:' },
    { t: 'add', s: 'a) La identidad del responsable del tratamiento y, cuando proceda, de su representante.' },
    { t: 'add', s: 'b) La finalidad del tratamiento y la base jurídica del mismo.' },
    { t: 'add', s: 'c) La posibilidad de ejercer los derechos previstos en los artículos 15 a 22 del Reglamento ante el responsable o el delegado de protección de datos.' },
    { t: 'add', s: 'd) Cuando se prevea, las transferencias internacionales y las garantías aplicables.' },
    { t: 'eq', s: '' },
    { t: 'eq', s: '3. Cuando los datos personales no hubieran sido obtenidos del afectado, el responsable podrá dar cumplimiento al deber de información establecido en el artículo 14 del Reglamento (UE) 2016/679.' },
  ]},
};

export const DIFF_BY_LAW: Record<string, ArticleDiff[]> = {
  'LO-3-2018': [ART_11_DIFF, /* others stubbed */],
};

// ─── Graph (Constitución → relations) ───────────────────────────────────

export const GRAPH: GraphData = {
  nodes: [
    { id: 'CE',     kind: 'law',       label: 'Constitución', x: 460, y: 220 },
    { id: 'CE-10',  kind: 'article',   label: 'Art. 10',  x: 280, y: 110 },
    { id: 'CE-14',  kind: 'article',   label: 'Art. 14',  x: 330, y: 320 },
    { id: 'CE-18',  kind: 'article',   label: 'Art. 18',  x: 200, y: 220 },
    { id: 'CE-96',  kind: 'article',   label: 'Art. 96',  x: 420, y: 60 },
    { id: 'DUDH',   kind: 'reference', label: 'DUDH',     x: 580, y: 60 },
    { id: 'CEDH',   kind: 'reference', label: 'CEDH',     x: 690, y: 130 },
    { id: 'LO3-18', kind: 'law',       label: 'LO 3/2018', x: 720, y: 280 },
    { id: 'LO3-11', kind: 'article',   label: 'Art. 11',  x: 820, y: 360 },
    { id: 'L15-22', kind: 'law',       label: 'Ley 15/2022', x: 550, y: 400 },
    { id: 'L15-2',  kind: 'article',   label: 'Art. 2',   x: 660, y: 460 },
    { id: 'LO1-82', kind: 'law',       label: 'LO 1/1982', x: 130, y: 340, dim: true },
    { id: 'LO1-15', kind: 'amendment', label: 'LO 1/2015', x: 340, y: 460 },
    { id: 'LECRIM', kind: 'reference', label: 'LECrim',   x: 100, y: 130 },
    { id: 'STC200', kind: 'reference', label: 'STC 200/2001', x: 220, y: 420 },
  ],
  edges: [
    ['CE', 'CE-10'], ['CE', 'CE-14'], ['CE', 'CE-18'], ['CE', 'CE-96'],
    ['CE-10', 'DUDH'], ['CE-10', 'CEDH'], ['CE-96', 'CEDH'],
    ['CE-18', 'LO3-18'], ['CE-18', 'LO1-82'], ['CE-18', 'LECRIM'],
    ['LO3-18', 'LO3-11'], ['CE-14', 'L15-22'], ['L15-22', 'L15-2'],
    ['CE-14', 'STC200'], ['CE-18', 'LO1-15'], ['LO3-18', 'L15-22'],
  ].map(([s, t], i) => ({ id: `e${i}`, source: s, target: t, kind: 'cites' })),
};

// ─── Chat ────────────────────────────────────────────────────────────────

export const CHAT_THREADS: ChatThread[] = [
  { id: 'eipd', title: 'EIPD en la LOPDGDD', updatedAt: new Date().toISOString() },
  { id: 'hp', title: 'Hipoteca con tipo variable', updatedAt: new Date(Date.now() - 3600e3).toISOString() },
  { id: 'lab', title: 'Indemnización por despido', updatedAt: new Date(Date.now() - 86400e3).toISOString() },
  { id: 'sgr', title: 'Subrogación de garantía', updatedAt: new Date(Date.now() - 86400e3 * 1.5).toISOString() },
  { id: 'vid', title: 'Videovigilancia en oficinas', updatedAt: new Date(Date.now() - 86400e3 * 3).toISOString() },
  { id: 'cp', title: 'Reforma de 2024 del CP', updatedAt: new Date(Date.now() - 86400e3 * 4).toISOString() },
];

export const CHAT_MESSAGES: Record<string, ChatMessage[]> = {
  eipd: [
    { id: 'u1', role: 'user', createdAt: new Date().toISOString(),
      content: '¿Qué requisitos exige la LOPDGDD para una evaluación de impacto en protección de datos (EIPD)?' },
    { id: 't1', role: 'tool', createdAt: new Date().toISOString(),
      name: 'search_corpus',
      args: { q: 'evaluación de impacto LOPDGDD', filter: 'vigente', limit: 5 },
      result: '5 resultados (LO 3/2018 art. 28; RGPD arts. 35-36; Guía AEPD 2021)',
      collapsed: true },
    { id: 't2', role: 'tool', createdAt: new Date().toISOString(),
      name: 'get_article',
      args: { law: 'LO-3-2018', num: 28 },
      result: 'Devuelto art. 28 — Medidas de responsabilidad activa',
      collapsed: true },
    { id: 'a1', role: 'assistant', createdAt: new Date().toISOString(),
      content: [
        'La **LOPDGDD (LO 3/2018)** se apoya en el RGPD para definir la EIPD. En síntesis, debes realizarla cuando concurra al menos uno de estos supuestos:',
        '1. **Tratamientos a gran escala** de categorías especiales de datos (art. 9 RGPD), datos biométricos identificativos o datos de salud.',
        '2. **Decisiones automatizadas** con efectos jurídicos o significativos para el interesado, incluida la elaboración de perfiles.',
        '3. **Observación sistemática** de zonas de acceso público (videovigilancia masiva).',
        '4. Cualquier tratamiento incluido en la **lista pública de la AEPD** que actualmente exige EIPD.',
        'La evaluación debe incluir, como mínimo: descripción del tratamiento, valoración de necesidad y proporcionalidad, riesgos para los derechos del interesado, y medidas para mitigarlos. El DPD debe ser consultado.',
      ],
      sources: [
        { law: 'Ley Orgánica 3/2018 (LOPDGDD)', article: 'Art. 28', date: '2018-12-06',
          snippet: 'El responsable del tratamiento adoptará todas las medidas necesarias para cumplir el principio de responsabilidad activa…',
          target: { lawId: 'LO-3-2018', articleNum: '28' } },
        { law: 'RGPD (UE) 2016/679', article: 'Art. 35', date: '2016-04-27',
          snippet: 'Cuando sea probable que un tipo de tratamiento entrañe un alto riesgo para los derechos y libertades…' },
        { law: 'Constitución Española', article: 'Art. 18.4', date: '1978-12-29',
          snippet: 'La ley limitará el uso de la informática para garantizar el honor y la intimidad personal y familiar…',
          target: { lawId: 'CE-1978', articleNum: '18' } },
      ],
    },
  ],
};

// ─── Models ──────────────────────────────────────────────────────────────

export const MODELS: Model[] = [
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', vendor: 'Anthropic', kind: 'cloud', available: true },
  { id: 'gpt-4o',            label: 'GPT-4o',           vendor: 'OpenAI',    kind: 'cloud', available: true },
  { id: 'gemini-2.5-pro',    label: 'Gemini 2.5 Pro',   vendor: 'Google',    kind: 'cloud', available: false },
  { id: 'llama3.3:70b',      label: 'Llama 3.3 70B',    vendor: 'Ollama',    kind: 'local', available: true },
  { id: 'qwen2.5:32b',       label: 'Qwen 2.5 32B',     vendor: 'LM Studio', kind: 'local', available: false },
];

// ─── Sync status ────────────────────────────────────────────────────────

export const SYNC: SyncStatus = {
  lastSyncAt: new Date(Date.now() - 14 * 60_000).toISOString(),
  upstream: 'legalize-es@main',
  behind: 0,
  busy: false,
};

// ─── Dashboards ─────────────────────────────────────────────────────────

export const COMPLIANCE_DASH: DashboardData = {
  preset: 'compliance',
  cards: [
    { id: 'normas',    title: 'Normas vigentes',                 value: '24.831', delta: '+0,4%', spark: [12,14,13,16,17,16,19,21,22,23,24,25], positive: true },
    { id: 'reformas',  title: 'Reformas en 2024',                value: '1.207',  delta: '+12%',  spark: [4,5,7,8,7,9,10,11,12,12,14,15], positive: true },
    { id: 'edad',      title: 'Edad media del corpus',           value: '11,3 a.',delta: '−0,2',  spark: [16,15,15,14,14,13,13,12,12,12,11,11] },
    { id: 'cites',     title: 'Citaciones cruzadas / norma',     value: '34,2',   delta: '+1,1',  spark: [22,24,25,27,28,29,30,31,32,32,33,34], positive: true },
    { id: 'derogadas', title: 'Derogadas (12m)',                  value: '482',    delta: '−6%',   spark: [9,10,9,8,8,7,7,6,6,6,5,5] },
    { id: 'sectores',  title: 'Sectores con cambios',             value: '17/22',  delta: 'estable',spark: [14,15,16,15,16,17,17,17,17,17,17,17] },
  ],
  series: {
    labels: ['E','F','M','A','M','J','J','A','S','O','N','D','E','F','M','A','M','J','J','A','S','O','N','D'],
    values: [82, 91, 78, 88, 95, 102, 88, 64, 73, 92, 110, 124, 95, 102, 88, 99, 108, 117, 96, 71, 80, 102, 121, 134],
    recentFrom: 18,
  },
};
