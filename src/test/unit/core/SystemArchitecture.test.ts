import {
  SystemEvidence, SystemNodeSpec,
  systemNodesFromEvidence, systemNodesFromSpecText,
  composeServiceNodes, mergeSystemNodes, epicNodeType, architectureSummary
} from '../../../core/context/SystemArchitecture';

const ev = (partial: Partial<SystemEvidence>): SystemEvidence => ({
  deps: [], manifestTexts: [], composeServices: [], dirNames: [], ...partial
});

const names = (ns: SystemNodeSpec[]) => ns.map(n => n.name);

describe('SystemArchitecture — arquitectura del sistema (no solo épicas)', () => {
  describe('systemNodesFromEvidence (workspace actual)', () => {
    it('detecta stack Node full-stack: React + Express + PostgreSQL + Redis + JWT', () => {
      const nodes = systemNodesFromEvidence(ev({
        deps: ['react', 'react-dom', 'express', 'pg', 'ioredis', 'jsonwebtoken']
      }));
      const map = new Map(nodes.map(n => [n.type, n.name]));
      expect(map.get('client')).toBe('React SPA');
      expect(map.get('api')).toBe('Node/Express API');
      expect(map.get('db')).toBe('PostgreSQL');
      expect(map.get('cache')).toBe('Redis');
      expect(map.get('auth')).toBe('Auth (JWT)');
    });

    it('prioriza Next.js sobre React (next incluye react como dependencia)', () => {
      const nodes = systemNodesFromEvidence(ev({ deps: ['next', 'react', 'react-dom'] }));
      expect(names(nodes)).toContain('Next.js App');
      expect(names(nodes)).not.toContain('React SPA');
    });

    it('ORM sin driver concreto → nodo de base de datos genérico concretado por el ORM', () => {
      const nodes = systemNodesFromEvidence(ev({ deps: ['prisma', 'express'] }));
      expect(names(nodes)).toContain('Database (Prisma)');
    });

    it('detecta Spring Boot + PostgreSQL vía pom.xml (texto de manifiesto)', () => {
      const nodes = systemNodesFromEvidence(ev({
        manifestTexts: ['<dependency>org.springframework.boot</dependency><artifactId>postgresql</artifactId>']
      }));
      expect(names(nodes)).toContain('Spring Boot API');
      expect(names(nodes)).toContain('PostgreSQL');
    });

    it('detecta Django + Celery vía requirements.txt', () => {
      const nodes = systemNodesFromEvidence(ev({
        manifestTexts: ['django==5.0\ncelery==5.3\nredis==5.0']
      }));
      expect(names(nodes)).toContain('Django App');
      expect(names(nodes)).toContain('Celery');
      expect(names(nodes)).toContain('Redis');
    });

    it('detecta IaC por carpetas y workers por estructura', () => {
      const nodes = systemNodesFromEvidence(ev({ dirNames: ['infra', 'workers'] }));
      expect(names(nodes)).toContain('Infrastructure as Code');
      expect(names(nodes)).toContain('Background Workers');
    });

    it('detecta Go API vía go.mod y colas RabbitMQ vía amqplib', () => {
      const nodes = systemNodesFromEvidence(ev({
        deps: ['amqplib'],
        manifestTexts: ['require github.com/gin-gonic/gin']
      }));
      expect(names(nodes)).toContain('Go API');
      expect(names(nodes)).toContain('RabbitMQ');
    });

    it('fusiona partes de auth en un solo nodo', () => {
      const nodes = systemNodesFromEvidence(ev({ deps: ['passport', 'jsonwebtoken', '@auth0/nextjs-auth0'] }));
      const auth = nodes.filter(n => n.type === 'auth');
      expect(auth).toHaveLength(1);
      expect(auth[0].name).toContain('JWT');
      expect(auth[0].name).toContain('OAuth');
    });
  });

  describe('composeServiceNodes (infraestructura existente)', () => {
    it('mapea servicios de docker-compose a componentes del sistema', () => {
      const nodes = composeServiceNodes(['db', 'postgres', 'backend', 'redis', 'kafka', 'nginx', 'minio']);
      const map = new Map(nodes.map(n => [n.type, n.name]));
      expect(map.get('db')).toBe('PostgreSQL');
      expect(names(nodes)).not.toContain('Database'); // 'db' genérico cede ante la imagen concreta
      expect(map.get('api')).toBe('Backend');
      expect(map.get('cache')).toBe('Redis');
      expect(map.get('queue')).toBe('Kafka');
      expect(map.get('cdn')).toBe('Reverse Proxy');
      expect(map.get('storage')).toBe('Object Storage (S3)');
    });

    it('resuelve imágenes con registro y tag (bitnami/postgresql:16)', () => {
      const nodes = composeServiceNodes(['bitnami/postgresql:16']);
      expect(names(nodes)).toContain('PostgreSQL');
    });
  });

  describe('systemNodesFromSpecText (sistema a crear)', () => {
    it('detecta tecnologías del texto completo del spec, con acentos normalizados', () => {
      const spec = [
        '## Epic: Autenticación',
        '- [ ] Implementar OAuth con JWT',
        '## Epic: Persistencia',
        '- [ ] Modelo de datos en PostgreSQL con caché Redis',
        '## Epic: Tiempo real',
        '- [ ] Notificaciones por WebSocket y correo email'
      ].join('\n');
      const nodes = systemNodesFromSpecText(spec);
      const map = new Map(nodes.map(n => [n.type, n.name]));
      expect(map.get('auth')).toBe('Auth (JWT/OAuth)');
      expect(map.get('db')).toBe('PostgreSQL');
      expect(map.get('cache')).toBe('Redis');
      expect(names(nodes)).toContain('WebSocket Server');
      expect(names(nodes)).toContain('Notifications Service');
    });

    it('detecta frontend y API REST declarados en el spec', () => {
      const nodes = systemNodesFromSpecText('SPA en React con backend REST y despliegue en docker');
      expect(names(nodes)).toContain('React SPA');
      expect(names(nodes)).toContain('REST API');
      expect(names(nodes)).toContain('Infrastructure (IaC)');
    });

    it('devuelve vacío con texto sin tecnologías', () => {
      expect(systemNodesFromSpecText('# Proyecto\n- [ ] Tarea genérica')).toEqual([]);
    });
  });

  describe('mergeSystemNodes', () => {
    it('deduplica por nombre y hace ceder los nodos genéricos del spec', () => {
      const merged = mergeSystemNodes(
        [{ type: 'db', name: 'PostgreSQL', source: 'workspace' }],
        [
          { type: 'db', name: 'PostgreSQL', source: 'spec' },
          { type: 'db', name: 'Database', source: 'spec' },
          { type: 'cache', name: 'Redis', source: 'spec' }
        ]
      );
      expect(names(merged)).toEqual(['PostgreSQL', 'Redis']);
    });
  });

  describe('epicNodeType (módulos de épica)', () => {
    it('mapea épicas a tipos de componente', () => {
      expect(epicNodeType('Autenticación y usuarios')).toBe('auth');
      expect(epicNodeType('API de pagos')).toBe('api');
      expect(epicNodeType('Base de datos')).toBe('db');
      expect(epicNodeType('Notificaciones push')).toBe('service');
    });
  });

  describe('architectureSummary', () => {
    it('resume el sistema detectado para la UI', () => {
      const s = architectureSummary(
        [{ type: 'client', name: 'React SPA', source: 'workspace' },
         { type: 'api', name: 'Node/Express API', source: 'workspace' },
         { type: 'db', name: 'PostgreSQL', source: 'workspace' }],
        2
      );
      expect(s).toContain('System: React SPA · Node/Express API · PostgreSQL');
      expect(s).toContain('2 epic modules');
    });

    it('cadena vacía cuando no hay sistema detectado', () => {
      expect(architectureSummary([], 0)).toBe('');
    });
  });
});
