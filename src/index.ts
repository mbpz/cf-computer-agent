import { DurableObject } from "cloudflare:workers";
import { getWorkspace, type DurableObjectStorageLike, withWorkspace } from "@cloudflare/computer";
import { createApp } from "./app";
import { KnowledgeService, type CreateNoteResult } from "./knowledge/service";
import { WorkspaceRepository } from "./knowledge/workspace-repository";

export class KnowledgeBase extends withWorkspace(
  class extends DurableObject<Env> {},
  (self) => ({
    storage: (self as unknown as { ctx: DurableObjectState }).ctx.storage as unknown as DurableObjectStorageLike,
  }),
) {
  async commitNote(input: unknown): Promise<CreateNoteResult> {
    let result: CreateNoteResult | undefined;
    let failure: unknown;

    await this.ctx.blockConcurrencyWhile(async () => {
      try {
        const workspace = await getWorkspace(this);
        const repository = WorkspaceRepository.forLocalWorkspace(workspace);
        try {
          result = await new KnowledgeService(repository).createNoteWithOutcome(input);
        } finally {
          repository.dispose();
        }
      } catch (error) {
        failure = error;
      }
    });

    if (failure !== undefined) throw failure;
    if (!result) throw new Error("Note commit did not return a result");
    return result;
  }
}

export default createApp();
