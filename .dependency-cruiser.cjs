/**
 * Orbit — module boundary enforcement.
 *
 * Phase 4 §5.1 fixed a dependency rule: dependencies point inward, always.
 *
 *   presentation ──┐
 *                  ├──> application ──> domain
 *   infrastructure ┘                      ^
 *                  └──────────────────────┘
 *
 * This file is that rule made executable. `pnpm boundaries` fails the build on
 * a violation, so the architecture cannot erode through ordinary edits.
 *
 * Layer → directory mapping:
 *   domain          src/domain
 *   application     src/application
 *   infrastructure  src/infrastructure
 *   presentation    src/app, src/features, src/components, src/hooks, src/offline
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // -----------------------------------------------------------------------
    // The dependency rule
    // -----------------------------------------------------------------------
    {
      name: 'domain-is-pure',
      severity: 'error',
      comment:
        'domain must not depend on any other layer. It is the one place where ' +
        'financial correctness is proved, and it stays testable only if it has ' +
        'no knowledge of Prisma, React, HTTP, or the filesystem. (PRD E-13)',
      from: { path: '^src/domain/' },
      to: {
        path: '^src/(application|infrastructure|app|features|components|hooks|offline|lib)/',
      },
    },
    {
      name: 'domain-has-no-runtime-deps',
      severity: 'error',
      comment:
        'domain must not import any npm package. Zero runtime dependencies is ' +
        'what lets the interest engine run unchanged on server and client, and ' +
        'what makes "pure and deterministic" a structural fact rather than a ' +
        'promise. (Phase 4 §6.1)',
      from: { path: '^src/domain/' },
      to: {
        dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled'],
        pathNot: ['^(node:)?(assert|util)$'],
      },
    },
    {
      name: 'application-does-not-know-infrastructure',
      severity: 'error',
      comment:
        'application defines ports; infrastructure provides adapters. If a ' +
        'service imports a repository directly, the port is decorative and the ' +
        'seams PRD §12 depends on stop existing.',
      from: { path: '^src/application/' },
      to: { path: '^src/(infrastructure|app|features|components|hooks|offline)/' },
    },
    {
      name: 'application-imports-no-react',
      severity: 'error',
      comment: 'application is framework-agnostic. React belongs to presentation.',
      from: { path: '^src/application/' },
      to: { path: 'node_modules/(react|react-dom|next)/', dependencyTypes: ['npm'] },
    },
    {
      name: 'infrastructure-is-not-presentation',
      severity: 'error',
      comment: 'infrastructure serves the application layer; it never renders.',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/(app|features|components|hooks)/' },
    },
    {
      name: 'presentation-does-not-reach-past-application',
      severity: 'error',
      comment:
        'Components and routes must not import repositories, the Prisma client, ' +
        'or storage adapters directly. Data access goes through application ' +
        'services so tenancy (Phase 4 §7) is never bypassed. The one exception ' +
        'is infrastructure/observability, which is a cross-cutting concern.',
      from: { path: '^src/(app|features|components|hooks)/' },
      to: {
        path: '^src/infrastructure/',
        pathNot: '^src/infrastructure/observability/',
      },
    },

    // -----------------------------------------------------------------------
    // Tenancy
    // -----------------------------------------------------------------------
    {
      name: 'prisma-client-is-module-private',
      severity: 'error',
      comment:
        'Only infrastructure/db may hold a Prisma client. Everything else must ' +
        'go through withTenant(), which pins app.user_id for the transaction. ' +
        'A stray import here is a cross-tenant data leak waiting to happen. ' +
        '(Phase 4 §7.2)',
      from: { pathNot: '^src/infrastructure/db/' },
      // Matches the RESOLVED path, not the specifier: dependency-cruiser
      // resolves npm imports to node_modules/... (and under pnpm, through
      // .pnpm/<pkg>@<ver>/node_modules/<pkg>). Anchoring on '^@prisma/client'
      // would never match and the rule would be silently inert.
      to: { path: 'node_modules/(@prisma/client|\\.prisma/client)', dependencyTypes: ['npm'] },
    },
    {
      name: 'db-internals-are-private',
      severity: 'error',
      comment:
        'infrastructure/db is imported through its index barrel only, so the ' +
        'unscoped client cannot be reached around the side.',
      from: { pathNot: '^src/infrastructure/db/' },
      to: {
        path: '^src/infrastructure/db/.+',
        pathNot: '^src/infrastructure/db/index\\.ts$',
      },
    },

    // -----------------------------------------------------------------------
    // Feature isolation
    // -----------------------------------------------------------------------
    {
      name: 'features-are-islands',
      severity: 'error',
      comment:
        'A feature may import another feature only through its index barrel. ' +
        'Reaching into internals couples features to each other\'s file layout ' +
        'and is how a modular codebase quietly becomes a monolith. (PRD ENG-02)',
      from: { path: '^src/features/([^/]+)/.+' },
      to: {
        path: '^src/features/([^/]+)/.+',
        pathNot: [
          '^src/features/$1/.+', // same feature: anything
          '^src/features/[^/]+/index\\.ts$', // other features: barrel only
        ],
      },
    },

    // -----------------------------------------------------------------------
    // Hygiene
    // -----------------------------------------------------------------------
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports break tree-shaking and make load order load-bearing.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Unreachable module — delete it or wire it up.',
      from: {
        orphan: true,
        pathNot: [
          '\\.(d\\.ts|css)$',
          '^src/app/', // route files are entrypoints by convention
          '(^|/)(index|layout|page|route|error|loading|not-found|template|default)\\.tsx?$',
          '^src/offline/', // service worker entrypoints
        ],
      },
      to: {},
    },
    {
      name: 'no-test-imports-in-src',
      severity: 'error',
      comment: 'Production code must not import test helpers or fixtures.',
      from: { path: '^src', pathNot: '\\.(test|spec)\\.tsx?$' },
      to: { path: '^tests/' },
    },
    {
      name: 'no-deprecated-core',
      severity: 'error',
      comment: 'Deprecated Node core module.',
      from: {},
      to: { dependencyTypes: ['core'], path: '^(punycode|domain|sys|constants)$' },
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.(test|spec)\\.tsx?$|^src/app/api/.*\\.test\\.' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
      dot: {
        theme: {
          graph: { rankdir: 'TD', splines: 'ortho', bgcolor: '#09090B' },
          node: { color: '#2A2A2A', fontcolor: '#FAFAFA', fontname: 'Inter' },
          edge: { color: '#A1A1AA' },
          modules: [
            { criteria: { source: '^src/domain' }, attributes: { fillcolor: '#10B981' } },
            { criteria: { source: '^src/application' }, attributes: { fillcolor: '#2563EB' } },
            { criteria: { source: '^src/infrastructure' }, attributes: { fillcolor: '#F59E0B' } },
            { criteria: { source: '^src/features' }, attributes: { fillcolor: '#27272A' } },
          ],
        },
      },
    },
  },
}
