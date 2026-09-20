export { MaintenanceCoordinator } from '../../src/maintenance/coordinator';
export { KnowledgeBase, AgentSession } from '../../src/index';
import { createWorkerEntry } from '../../src/worker-entry';
import { localEnvironment, type LocalResources } from './resources';

// Independent local entry only. Deliberately no HTTP maintenance control plane.
function entry(resources: LocalResources) {
  return createWorkerEntry({ mode: 'guarded', maintenance: () => resources.MAINTENANCE.getByName('local-entry') });
}
export default {
  fetch(request: Request<unknown, IncomingRequestCfProperties<unknown>>, resources: LocalResources, ctx: ExecutionContext) {
    return entry(resources).fetch(request, localEnvironment(resources), ctx);
  },
  scheduled(controller: ScheduledController, resources: LocalResources, ctx: ExecutionContext) {
    return entry(resources).scheduled(controller, localEnvironment(resources), ctx);
  },
};
