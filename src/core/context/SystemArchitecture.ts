import { ArchNodeType } from '../interfaces';

// ── System architecture inference ────────────────────────────────────────────
// El lienzo de arquitectura debe mostrar la arquitectura del SISTEMA (lo que el
// workspace ya tiene y lo que el spec va a construir), no solo los títulos de
// las épicas. Lógica pura y testeable: MainPanel aporta el IO (list/read MCP).

export interface SystemNodeSpec {
  type: ArchNodeType;
  name: string;
  /** Origen de la evidencia: workspace actual, spec (sistema a crear) o épica. */
  source: 'workspace' | 'spec' | 'epic';
}

export interface SystemEvidence {
  /** Nombres de dependencias de package.json (raíz y subpaquetes). */
  deps: string[];
  /** Contenido de manifiestos no-JSON (pom.xml, requirements.txt, go.mod, *.csproj...). */
  manifestTexts: string[];
  /** Servicios declarados en docker-compose (claves + imágenes, en minúscula). */
  composeServices: string[];
  /** Nombres de carpetas (raíz y segundo nivel), en minúscula. */
  dirNames: string[];
}

export const MAX_SYSTEM_NODES = 14;
export const MAX_EPIC_MODULES = 8;

const hasDep = (deps: string[], re: RegExp): boolean => deps.some(d => re.test(d));
const norm = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function dedupe(specs: SystemNodeSpec[], cap: number): SystemNodeSpec[] {
  const seen = new Set<string>();
  const out: SystemNodeSpec[] = [];
  for (const n of specs) {
    const key = `${n.type}::${n.name.toLowerCase()}`;
    if (seen.has(key)) { continue; }
    seen.add(key);
    out.push(n);
    if (out.length >= cap) { break; }
  }
  return out;
}

// ── 1. Sistema EXISTENTE: dependencias y manifiestos del workspace ───────────

const CLIENT_DEPS: Array<[RegExp, string]> = [
  [/^next$/,                                  'Next.js App'],
  [/^nuxt$/,                                  'Nuxt App'],
  [/^react-native$|^expo$/,                   'React Native App'],
  [/^@angular\/core$|^@angular\/animations$/, 'Angular App'],
  [/^vue$|^vue-router$|^pinia$/,              'Vue 3 SPA'],
  [/^svelte$|^svelte-kit$/,                   'Svelte App'],
  [/^react$|^react-dom$/,                     'React SPA'],
];

const API_DEPS: Array<[RegExp, string]> = [
  [/^@nestjs\/core$/,                         'NestJS API'],
  [/^apollo-server|^@apollo\/server$|^graphql-yoga$/, 'GraphQL Server'],
  [/^express$|^fastify$|^koa$|^@hapi\/hapi$/, 'Node/Express API'],
];

const DB_DEPS: Array<[RegExp, string]> = [
  [/^pg$|^pg-promise$|^postgres$|^pgvector$/, 'PostgreSQL'],
  [/^mysql2?$|^pymysql$/,                     'MySQL'],
  [/^mongoose$|^mongodb$|^mongoid$/,          'MongoDB'],
  [/^sqlite3?$|^better-sqlite3$/,             'SQLite'],
  [/^mariadb$/,                               'MariaDB'],
];

const ORM_DEPS: Array<[RegExp, string]> = [
  [/^prisma$|^@prisma\/client$/,              'Database (Prisma)'],
  [/^typeorm$|^sequelize$|^knex$|^mikro-orm$|^drizzle-orm$/, 'SQL Database'],
];

const QUEUE_DEPS: Array<[RegExp, string]> = [
  [/^kafkajs$|^kafka$/,                       'Kafka'],
  [/^amqplib$|^rabbitmq|^rhea$/,              'RabbitMQ'],
  [/^bullmq?$|^bree$/,                        'Job Queue (Redis)'],
  [/^celery$/,                                'Celery'],
  [/^@google-cloud\/pubsub$/,                 'Pub/Sub'],
  [/^@aws-sdk\/client-sqs$/,                  'SQS'],
  [/^nats$/,                                  'NATS'],
];

const CACHE_DEPS: Array<[RegExp, string]> = [
  [/^redis$|^ioredis$|^node-redis$/,          'Redis'],
  [/^memcached$/,                             'Memcached'],
];

const AUTH_PARTS: Array<[RegExp, string]> = [
  [/^jsonwebtoken$|^jose$/,                   'JWT'],
  [/^passport$|^@nestjs\/passport$/,          'Passport'],
  [/^next-auth$/,                             'NextAuth'],
  [/oauth|@auth0|keycloak|^openid|@node-saml/, 'OAuth'],
];

const STORAGE_DEPS: Array<[RegExp, string]> = [
  [/^@aws-sdk\/client-s3$|aws-sdk\/clients\/s3$|^minio$|^@google-cloud\/storage$|^azure-storage$/, 'Object Storage (S3)'],
];

const SERVICE_DEPS: Array<[RegExp, string]> = [
  [/^@elastic\/elasticsearch$|^meilisearch$|^algoliasearch$/, 'Search Engine'],
  [/^socket\.io$/,                            'WebSocket (Socket.IO)'],
  [/^ws$/,                                    'WebSocket Server'],
  [/^nodemailer$|^@sendgrid\/mail$|^twilio$/, 'Notifications Service'],
];

const IAC_DIRS = ['infra', 'infrastructure', 'terraform', 'k8s', 'kubernetes', 'helm', 'cdk', 'pulumi'];

/** Texto de manifiestos no-JSON → nodos por ecosistema (Python/Java/Go/PHP/Ruby/.NET/serverless). */
function systemNodesFromManifests(manifestTexts: string[]): SystemNodeSpec[] {
  const out: SystemNodeSpec[] = [];
  const push = (type: ArchNodeType, name: string) => out.push({ type, name, source: 'workspace' });
  const text = norm(manifestTexts.join('\n').toLowerCase());

  if (/serverless\.ya?ml|functions:\s*\n/.test(text) || /provider:\s*\n\s*name:\s*(aws|azure|gcp)/.test(text)) {
    push('lambda', 'Serverless Functions');
  }
  if (/django/.test(text))            { push('api', 'Django App'); }
  else if (/fastapi/.test(text))      { push('api', 'FastAPI API'); }
  else if (/flask/.test(text))        { push('api', 'Flask API'); }
  if (/spring-boot|spring-web|org\.springframework/.test(text)) { push('api', 'Spring Boot API'); }
  if (/gin-gonic|labstack\/echo|gofiber|go-chi/.test(text))     { push('api', 'Go API'); }
  if (/laravel/.test(text))           { push('api', 'Laravel API'); }
  else if (/symfony/.test(text))      { push('api', 'Symfony API'); }
  if (/rails/.test(text))             { push('api', 'Rails API'); }
  if (/microsoft\.net\.sdk\.web|aspnetcore|asp\.net/.test(text)) { push('api', 'ASP.NET Core API'); }

  if (/postgres|psycopg|pgx|lib\/pq|jdbc:postgresql/.test(text)) { push('db', 'PostgreSQL'); }
  else if (/mysql|jdbc:mysql/.test(text))                        { push('db', 'MySQL'); }
  else if (/pymongo|mongo/.test(text))                           { push('db', 'MongoDB'); }
  else if (/sqlalchemy|hibernate|jakarta\.persistence|javax\.persistence|entityframeworkcore|gorm|activerecord/.test(text)) { push('db', 'SQL Database'); }

  if (/redis|stackexchangeredis|go-redis|predis|sidekiq/.test(text)) { push('cache', 'Redis'); }
  if (/memcached/.test(text)) { push('cache', 'Memcached'); }

  if (/\bkafka\b|kafkajs|redpanda/.test(text)) { push('queue', 'Kafka'); }
  else if (/celery|sidekiq/.test(text))        { push('queue', text.includes('celery') ? 'Celery' : 'Sidekiq (Redis)'); }
  else if (/amqplib|rabbitmq/.test(text))      { push('queue', 'RabbitMQ'); }
  else if (/cloudtasks|pubsub|sqs/.test(text)) { push('queue', 'Managed Queue'); }

  return dedupe(out, MAX_SYSTEM_NODES);
}

/** Nodo(s) de autenticación desde dependencias: una sola etiqueta con las partes detectadas. */
function authNodes(deps: string[]): SystemNodeSpec[] {
  const parts: string[] = [];
  for (const [re, label] of AUTH_PARTS) {
    if (hasDep(deps, re) && !parts.includes(label)) { parts.push(label); }
  }
  if (parts.length === 0) { return []; }
  return [{ type: 'auth', name: `Auth (${parts.join(' + ')})`, source: 'workspace' }];
}

export function systemNodesFromEvidence(ev: SystemEvidence): SystemNodeSpec[] {
  const out: SystemNodeSpec[] = [];
  const push = (type: ArchNodeType, name: string) => out.push({ type, name, source: 'workspace' });
  const deps = ev.deps;

  for (const [re, name] of CLIENT_DEPS) { if (hasDep(deps, re)) { push('client', name); break; } }
  for (const [re, name] of API_DEPS)    { if (hasDep(deps, re)) { push('api', name); break; } }
  for (const [re, name] of DB_DEPS)     { if (hasDep(deps, re)) { push('db', name); break; } }
  if (!out.some(n => n.type === 'db')) {
    for (const [re, name] of ORM_DEPS)  { if (hasDep(deps, re)) { push('db', name); break; } }
  }
  for (const [re, name] of QUEUE_DEPS)  { if (hasDep(deps, re)) { push('queue', name); break; } }
  for (const [re, name] of CACHE_DEPS)  { if (hasDep(deps, re)) { push('cache', name); break; } }
  for (const [re, name] of STORAGE_DEPS) { if (hasDep(deps, re)) { push('storage', name); break; } }
  for (const [re, name] of SERVICE_DEPS) { if (hasDep(deps, re)) { push('service', name); break; } }
  for (const n of authNodes(deps)) { out.push(n); }

  if (hasDep(deps, /^serverless$|^@vendia\/serverless-express$|^aws-lambda$/)) { push('lambda', 'AWS Lambda'); }
  if (ev.dirNames.some(d => IAC_DIRS.includes(d))) { push('container', 'Infrastructure as Code'); }
  if (ev.dirNames.some(d => ['workers', 'jobs', 'tasks', 'queues'].includes(d)) && !out.some(n => n.type === 'queue')) {
    push('queue', 'Background Workers');
  }

  return dedupe([...out, ...systemNodesFromManifests(ev.manifestTexts)], MAX_SYSTEM_NODES);
}

// ── 2. Infraestructura EXISTENTE: servicios de docker-compose ────────────────

const COMPOSE_MAP: Array<[RegExp, ArchNodeType, string]> = [
  [/^db$|^database$/,                   'db',      'Database'],
  [/postgres|pgvector|timescale/,       'db',      'PostgreSQL'],
  [/mysql/,                             'db',      'MySQL'],
  [/maria/,                             'db',      'MariaDB'],
  [/mongo/,                             'db',      'MongoDB'],
  [/redis|valkey/,                      'cache',   'Redis'],
  [/memcached/,                         'cache',   'Memcached'],
  [/kafka|redpanda/,                    'queue',   'Kafka'],
  [/rabbitmq/,                          'queue',   'RabbitMQ'],
  [/nats/,                              'queue',   'NATS'],
  [/elasticsearch|opensearch|meili/,    'service', 'Search Engine'],
  [/minio/,                             'storage', 'Object Storage (S3)'],
  [/nginx|caddy|traefik|haproxy|envoy/, 'cdn',     'Reverse Proxy'],
  [/kong|apisix|gateway/,               'api',     'API Gateway'],
  [/keycloak|authentik|authelia/,       'auth',    'Identity Provider'],
  [/vault/,                             'service', 'Secrets Manager'],
  [/prometheus|grafana|datadog/,        'service', 'Monitoring'],
  [/jaeger|zipkin|otel/,                'service', 'Tracing'],
  [/mailhog|mailpit|smtp/,              'service', 'Mail Server'],
];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function composeServiceNodes(services: string[]): SystemNodeSpec[] {
  const out: SystemNodeSpec[] = [];
  for (const raw of services) {
    const svc = norm(raw.toLowerCase());
    const base = svc.split('/').pop() ?? svc;
    const mapped = COMPOSE_MAP.find(([re]) => re.test(base));
    if (mapped) { out.push({ type: mapped[1], name: mapped[2], source: 'workspace' }); continue; }
    if (/front|client|web/.test(base))           { out.push({ type: 'client', name: cap(raw), source: 'workspace' }); continue; }
    if (/api|app|backend|server|svc/.test(base)) { out.push({ type: 'api', name: cap(raw), source: 'workspace' }); continue; }
    if (/worker|consumer/.test(base))            { out.push({ type: 'queue', name: cap(raw), source: 'workspace' }); }
  }
  // Un servicio genérico ('db', 'cache') cede cuando una imagen concreta ya lo representa.
  const GENERIC = new Set(['Database', 'Cache', 'Message Queue']);
  const concreteTypes = new Set(out.filter(n => !GENERIC.has(n.name)).map(n => n.type));
  return dedupe(out.filter(n => !(GENERIC.has(n.name) && concreteTypes.has(n.type))), MAX_SYSTEM_NODES);
}

// ── 3. Sistema A CREAR: tecnologías citadas en el spec (texto completo) ──────

const SPEC_RULES: Array<[RegExp, ArchNodeType, string]> = [
  [/postgresql|\bpostgres\b|pgvector/,   'db',       'PostgreSQL'],
  [/\bmysql\b/,                          'db',       'MySQL'],
  [/mariadb/,                            'db',       'MariaDB'],
  [/mongodb|\bmongo\b/,                  'db',       'MongoDB'],
  [/sqlite/,                             'db',       'SQLite'],
  [/redis|valkey/,                       'cache',    'Redis'],
  [/memcached/,                          'cache',    'Memcached'],
  [/\bkafka\b|redpanda/,                 'queue',    'Kafka'],
  [/\brabbitmq\b|\brabbit\b/,            'queue',    'RabbitMQ'],
  [/\bcelery\b/,                         'queue',    'Celery'],
  [/\bsqs\b|simple queue service/,       'queue',    'SQS'],
  [/elasticsearch|opensearch|meilisearch/, 'service', 'Search Engine'],
  [/websocket|socket\.io/,               'service',  'WebSocket Server'],
  [/graphql/,                            'api',      'GraphQL API'],
  [/oauth|\bjwt\b|\bsso\b|tokens? de acceso|autenticacion|inicio de sesion|\blogin\b/, 'auth', 'Auth (JWT/OAuth)'],
  [/\bs3\b|\bbuckets?\b|object storage|almacenamiento de objetos|minio/,               'storage', 'Object Storage (S3)'],
  [/stripe|pasarela de pago|procesamiento de pagos/,                                   'service', 'Payments'],
  [/\bemail\b|correo electronico|notificaciones|smtp|sendgrid/,                        'service', 'Notifications Service'],
  [/next\.?js|nextjs/,                   'client',   'Next.js App'],
  [/\bangular\b/,                        'client',   'Angular App'],
  [/\breact\b/,                          'client',   'React SPA'],
  [/\bvue\b/,                            'client',   'Vue 3 SPA'],
  [/\bdjango\b/,                         'api',      'Django App'],
  [/\bfastapi\b/,                        'api',      'FastAPI API'],
  [/\bflask\b/,                          'api',      'Flask API'],
  [/\bspring\b/,                         'api',      'Spring Boot API'],
  [/\blaravel\b/,                        'api',      'Laravel API'],
  [/\bexpress\b|node\.?js/,              'api',      'Node/Express API'],
  [/api rest|\brest\b|endpoints?|backend/, 'api',    'REST API'],
  [/\bserverless\b|\blambda\b/,          'lambda',   'Serverless Functions'],
  [/\bdocker\b|\bkubernetes\b|\bk8s\b|contenedores/, 'container', 'Infrastructure (IaC)'],
  [/\bcdn\b/,                            'cdn',      'CDN'],
  [/microfrontends?|\bspa\b|single page app|interfaz de usuario|\bfrontend\b|\bui\b/, 'client', 'Web Client'],
  [/base de datos|\bbd\b|capa de datos/, 'db',       'Database'],
  [/\bcach[er]\b|\bcache\b/,             'cache',    'Cache'],
  [/cola de mensajes|\bcolas?\b|\bqueue\b/, 'queue', 'Message Queue'],
  [/\barchivos?\b|uploads?|adjuntos/,    'storage',  'File Storage'],
];

export function systemNodesFromSpecText(text: string): SystemNodeSpec[] {
  const t = norm(text.toLowerCase());
  const out: SystemNodeSpec[] = [];
  const types = new Set<ArchNodeType>();
  for (const [re, type, name] of SPEC_RULES) {
    if (!re.test(t)) { continue; }
    // Las reglas concretas van primero: el genérico ('Cache', 'Database'...) cede.
    if (GENERIC_NAMES.has(name.toLowerCase()) && types.has(type)) { continue; }
    types.add(type);
    out.push({ type, name, source: 'spec' });
  }
  return dedupe(out, MAX_SYSTEM_NODES);
}

// ── 4. Fusión: lo concreto del workspace manda, lo genérico del spec cede ────

const GENERIC_NAMES = new Set([
  'database', 'sql database', 'cache', 'message queue', 'auth', 'auth (jwt/oauth)',
  'file storage', 'rest api', 'api gateway', 'web client'
]);

/** primary (workspace) gana; secondary (spec/compose) aporta solo componentes nuevos. */
export function mergeSystemNodes(
  primary: SystemNodeSpec[],
  secondary: SystemNodeSpec[]
): SystemNodeSpec[] {
  const out = [...primary];
  const names = new Set(primary.map(n => n.name.toLowerCase()));
  const types = new Set(primary.map(n => n.type));
  for (const n of secondary) {
    const lname = n.name.toLowerCase();
    if (names.has(lname)) { continue; }
    if (GENERIC_NAMES.has(lname) && types.has(n.type)) { continue; }
    names.add(lname);
    out.push(n);
    if (out.length >= MAX_SYSTEM_NODES) { break; }
  }
  return out;
}

// ── 5. Épicas → tipo de componente (módulos funcionales del sistema) ─────────

const EPIC_KEYWORDS: Array<[RegExp, ArchNodeType]> = [
  [/auth|login|user|session|oauth|jwt|autenticacion|sesion|usuario/, 'auth'],
  [/api|endpoint|route|rest|graphql/,              'api'],
  [/database|db|postgres|mysql|mongo|sqlite|persist|datos/, 'db'],
  [/cache|redis|memcach/,                          'cache'],
  [/queue|event|message|kafka|rabbit|pubsub|cola/, 'queue'],
  [/storage|file|upload|s3|blob|archivo/,          'storage'],
  [/frontend|ui|web|view|spa|react|vue|angular|interfaz/, 'client'],
  [/cdn|static|asset|media/,                       'cdn'],
  [/lambda|serverless|function/,                   'lambda'],
  [/container|docker|kubernetes|k8s|infra/,        'container'],
];

export function epicNodeType(title: string): ArchNodeType {
  const t = norm(title.toLowerCase());
  for (const [re, type] of EPIC_KEYWORDS) {
    if (re.test(t)) { return type; }
  }
  return 'service';
}

// ── 6. Resumen para la UI ("System: React SPA · Node/Express API · ...") ─────

export function architectureSummary(system: SystemNodeSpec[], moduleCount: number): string {
  if (system.length === 0) { return ''; }
  const names = system.map(n => n.name);
  const head = names.slice(0, 4).join(' · ');
  const more = names.length > 4 ? ` +${names.length - 4} more` : '';
  const modules = moduleCount > 0 ? ` · ${moduleCount} epic module${moduleCount === 1 ? '' : 's'}` : '';
  return `System: ${head}${more}${modules}`.slice(0, 140);
}

