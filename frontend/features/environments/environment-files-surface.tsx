import { lazy, Suspense, useId, useMemo } from 'react';
import type { EnvironmentMetadata } from '../../../shared/environments';
import { Button } from '../../components/ui/button';
import { frontendText, type LocaleRuntime } from '../../lib/i18n';
import { useAccountNetworkOwner } from './account-network-boundary';
import { useEnvironmentVm } from './environment-vm-provider';
import { VM_SESSION_UNAVAILABLE } from './environment-vm-composition';

// `files-panel.tsx` pulls the VM file/import models, so it must never enter the
// eager graph: the emitted-module-graph gate rejects lazy-eligible VM modules on
// the initial chunk. A literal dynamic import keeps the surface in a deferred chunk.
const FilesPanel = lazy(async () => ({ default: (await import('./files/files-panel')).FilesPanel }));

/** The file surface for one selected environment. It renders only when the
 * account's runtime object exists; start is offered disabled with the reason that
 * this version deliberately ships no VM engine or guest images, so it can never
 * look like a control that merely failed this once. */
export function EnvironmentFiles({ environment, locale, onClose }: {
  environment: EnvironmentMetadata; locale: LocaleRuntime; onClose: () => void;
}) {
  const vm = useEnvironmentVm();
  const memberId = useAccountNetworkOwner().scope.memberId;
  const reasonId = useId();
  const t = (key: string) => frontendText(locale, key);
  const submission = useMemo(() => ({ memberId }), [memberId]);
  if (vm.status !== 'ready') return <section data-environment-files data-environment-files-state={vm.status} aria-busy={vm.status === 'preparing'} role={vm.status === 'unavailable' ? 'alert' : undefined} className="rounded-md border p-4"><p>{t(vm.status === 'preparing' ? 'ENV_RUNTIME_PREPARING' : 'ENV_RUNTIME_UNAVAILABLE')}</p></section>;
  return <section data-environment-files data-environment-files-for={environment.id} className="space-y-4 rounded-md border p-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="font-medium">{t('ENV_FILES')} · {environment.name}</h2>
      <Button type="button" variant="outline" data-environment-files-close onClick={onClose}>{t('ENV_FILES_CLOSE')}</Button>
    </header>
    <div className="space-y-2" data-environment-files-runtime={VM_SESSION_UNAVAILABLE}>
      <p>{t('ENV_RUNTIME_READY')}</p>
      <Button type="button" data-vm-start disabled aria-disabled="true" aria-describedby={reasonId}>{t('ENV_START_VM')}</Button>
      <p id={reasonId} className="text-sm text-muted-foreground">{t('ENV_START_VM_DISABLED')}</p>
    </div>
    <Suspense fallback={<p data-environment-files-loading aria-busy="true">{t('ENV_RUNTIME_PREPARING')}</p>}>
      <FilesPanel runtime={vm.runtime} submission={submission} locale={locale.locale} />
    </Suspense>
  </section>;
}
