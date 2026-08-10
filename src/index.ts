import { DurableObject } from "cloudflare:workers";
import { type DurableObjectStorageLike, withWorkspace } from "@cloudflare/computer";
import { createApp } from "./app";

export class KnowledgeBase extends withWorkspace(
  class extends DurableObject<Env> {},
  (self) => ({
    storage: (self as unknown as { ctx: DurableObjectState }).ctx.storage as unknown as DurableObjectStorageLike,
  }),
) {}

export default createApp();
