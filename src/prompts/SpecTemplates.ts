export type SpecTemplateType = 'openapi' | 'bdd' | 'database' | 'microservice' | 'react-component';

export interface SpecTemplate {
  id: SpecTemplateType;
  label: string;
  description: string;
  extension: string;
  content: (name: string) => string;
}

export const SPEC_TEMPLATES: SpecTemplate[] = [
  {
    id: 'openapi',
    label: 'REST API (OpenAPI 3.0)',
    description: 'OpenAPI 3.0 specification for REST APIs',
    extension: '.spec.yaml',
    content: (name: string) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const pascal = name.replace(/(?:^|\s)(\w)/g, (_, c) => c.toUpperCase()).replace(/\s/g, '');
      return `openapi: 3.0.0
info:
  title: ${name}
  version: 1.0.0
  description: API specification for ${name}

paths:
  /${slug}s:
    get:
      summary: List all ${name}s
      responses:
        '200':
          description: List of ${name}s
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/${pascal}'
    post:
      summary: Create a new ${name}
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/${pascal}Create'
      responses:
        '201':
          description: Created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/${pascal}'
        '400':
          description: Invalid input
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /${slug}s/{id}:
    get:
      summary: Get ${name} by ID
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: ${name} found
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/${pascal}'
        '404':
          description: Not found
    put:
      summary: Update ${name}
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/${pascal}Create'
      responses:
        '200':
          description: Updated successfully
    delete:
      summary: Delete ${name}
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '204':
          description: Deleted

components:
  schemas:
    ${pascal}Create:
      type: object
      required: [name]
      properties:
        name:
          type: string
          maxLength: 255
        description:
          type: string
        status:
          type: string
          enum: [active, inactive]
          default: active
    ${pascal}:
      allOf:
        - $ref: '#/components/schemas/${pascal}Create'
        - type: object
          required: [id, createdAt]
          properties:
            id:
              type: string
              format: uuid
            createdAt:
              type: string
              format: date-time
            updatedAt:
              type: string
              format: date-time
    Error:
      type: object
      properties:
        error:
          type: string
        message:
          type: string
`;
    }
  },

  {
    id: 'bdd',
    label: 'BDD Feature (Gherkin)',
    description: 'Behavior-driven specification using Gherkin syntax',
    extension: '.feature',
    content: (name: string) => `Feature: ${name}
  As a user
  I want to ${name.toLowerCase()}
  So that I can achieve my goal

  Background:
    Given I am authenticated
    And the system is in a clean state

  Scenario: Happy path - ${name} succeeds
    Given the required data is available
    When I perform the ${name.toLowerCase()} action
    Then the operation completes successfully
    And the expected outcome is visible

  Scenario: Validation - invalid input rejected
    Given I provide invalid input
    When I attempt ${name.toLowerCase()}
    Then I see an appropriate error message
    And no data is modified

  Scenario: Authorization - unauthorized access denied
    Given I am not authorized
    When I attempt ${name.toLowerCase()}
    Then I receive a 403 Forbidden response

  Scenario: Edge case - empty state
    Given there is no existing data
    When I request the ${name.toLowerCase()} list
    Then I receive an empty response with status 200
`
  },

  {
    id: 'database',
    label: 'Database Schema',
    description: 'Database schema specification in YAML format',
    extension: '.schema.yaml',
    content: (name: string) => {
      const table = name.toLowerCase().replace(/\s+/g, '_');
      return `database: postgresql
version: 1.0
description: Schema specification for ${name}

tables:
  ${table}s:
    columns:
      id: uuid primary key default gen_random_uuid()
      name: varchar(255) not null
      description: text
      status: varchar(50) not null default 'active'
      created_at: timestamp not null default now()
      updated_at: timestamp not null default now()

    indexes:
      - columns: [name]
        unique: false
      - columns: [status]
      - columns: [created_at]

    constraints:
      - check: status IN ('active', 'inactive', 'deleted')
      - check: length(name) > 0

migrations:
  - version: 1
    description: Create ${table}s table
    up: |
      CREATE TABLE ${table}s (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_${table}_status CHECK (status IN ('active', 'inactive', 'deleted'))
      );
      CREATE INDEX idx_${table}_status ON ${table}s(status);
    down: DROP TABLE IF EXISTS ${table}s;

acceptance_criteria:
  - UUID primary key auto-generated on insert
  - name cannot be null or empty
  - status defaults to 'active' when not provided
  - updated_at is refreshed on every UPDATE
  - Indexes on status and created_at for query performance
`;
    }
  },

  {
    id: 'microservice',
    label: 'Microservice (Spring Boot)',
    description: 'Microservice specification with API, events, and database',
    extension: '.service.yaml',
    content: (name: string) => {
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const pascal = name.replace(/(?:^|\s)(\w)/g, (_, c) => c.toUpperCase()).replace(/\s/g, '');
      return `service:
  name: ${slug}-service
  type: microservice
  port: 8080
  description: ${name} microservice

requirements:
  - Handle ${name} CRUD operations
  - Publish domain events on state changes
  - Subscribe to related service events
  - Persist data to PostgreSQL
  - Expose REST API with OpenAPI documentation

dependencies:
  - user-service
  - notification-service

events:
  publishes:
    - ${pascal}Created
    - ${pascal}Updated
    - ${pascal}Deleted
  subscribes:
    - UserDeactivated

api:
  - GET /${slug}s
  - GET /${slug}s/{id}
  - POST /${slug}s
  - PUT /${slug}s/{id}
  - DELETE /${slug}s/{id}

database:
  type: postgresql
  tables:
    - ${slug.replace(/-/g, '_')}s
    - ${slug.replace(/-/g, '_')}_audit_log

messaging:
  type: kafka
  topics:
    - ${slug}-events

stack:
  backend: Spring Boot 3.2
  database: PostgreSQL 15
  messaging: Kafka
  cache: Redis
  docs: SpringDoc OpenAPI

acceptance_criteria:
  - All CRUD endpoints respond within 200ms (p99)
  - Domain events published within 1s of state change
  - API documented via OpenAPI at /api-docs
  - Health endpoint at /actuator/health
  - 80% unit test coverage minimum
`;
    }
  },

  {
    id: 'react-component',
    label: 'React Component',
    description: 'React component specification with props, state, and behaviors',
    extension: '.component.yaml',
    content: (name: string) => {
      const pascal = name.replace(/(?:^|\s)(\w)/g, (_, c) => c.toUpperCase()).replace(/\s/g, '');
      return `component:
  name: ${pascal}
  type: react-functional
  description: ${name} React component

props:
  - name: id
    type: string
    required: false
    description: Unique identifier for the item
  - name: onSuccess
    type: (result: ${pascal}Result) => void
    required: false
    description: Callback invoked on successful action
  - name: onError
    type: (error: Error) => void
    required: false
    description: Callback invoked on error
  - name: className
    type: string
    required: false
    description: Additional CSS classes
  - name: disabled
    type: boolean
    required: false
    default: false
    description: Disable all interactions

state:
  - name: loading
    type: boolean
    initial: false
  - name: data
    type: ${pascal}Data | null
    initial: null
  - name: error
    type: string | null
    initial: null

behaviors:
  - On mount: fetch initial data from API if id is provided
  - On submit: validate form, call API, invoke onSuccess or onError callback
  - On error: display inline error message, do NOT throw
  - On loading: show skeleton/spinner, disable interactive elements

accessibility:
  - aria-label on all icon-only buttons
  - role="alert" on error messages
  - Keyboard navigable (Tab, Enter, Escape)
  - Focus restored to trigger after modal closes

tests:
  - renders without crashing (smoke test)
  - shows loading spinner while fetching
  - displays error message on fetch failure
  - displays data correctly when loaded
  - handles empty/null data gracefully
  - calls onSuccess after successful submit
  - calls onError after failed submit
  - disabled prop prevents all interactions
`;
    }
  }
];

export function getSpecTemplate(id: SpecTemplateType): SpecTemplate | undefined {
  return SPEC_TEMPLATES.find(t => t.id === id);
}
