import { createHash } from 'node:crypto';
import { dirname, relative } from 'node:path';

// Build-time evidence, not a runtime dependency or a hand-maintained chunk-name allowlist.
export function workbenchLandingProvenance() {
  let repository;
  return {
    name: 'workbench-landing-provenance',
    apply: 'build',
    enforce: 'post',
    configResolved(config) { repository = dirname(config.root); },
    generateBundle: { order: 'post', handler(_options, bundle) {
      const chunks = {};
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const modules = Object.keys(chunk.modules).map(id => {
          const normalized = id.replaceAll('\\', '/');
          const packageIndex = normalized.lastIndexOf('/node_modules/');
          if (packageIndex >= 0) return normalized.slice(packageIndex + 1);
          if (normalized.startsWith('\0')) return `virtual:${normalized.slice(1)}`;
          return relative(repository, id).replaceAll('\\', '/');
        }).sort();
        chunks[file] = {
          modules,
          sha256: createHash('sha256').update(chunk.code).digest('hex'),
          imports: [...chunk.imports].sort(),
          dynamicImports: [...chunk.dynamicImports].sort(),
          isEntry: chunk.isEntry,
        };
      }
      this.emitFile({ type: 'asset', fileName: 'workbench-provenance.json', source: JSON.stringify({ schemaVersion: 1, chunks }, null, 2) });
    } },
  };
}
