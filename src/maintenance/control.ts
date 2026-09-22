import { AppError } from "../http";
import type { CapacitySnapshot, MaintenanceControlClient, Snapshot } from "./contracts";

const TOKEN_MIN_LENGTH = 16;

export class MaintenanceControlService {
  constructor(
    private readonly client: Pick<MaintenanceControlClient, "status" | "capacity" | "beginDrain" | "resume"> | undefined,
    private readonly controlToken: string | undefined,
  ) {}

  async status(): Promise<Snapshot> {
    return await this.withCapability(() => this.client?.status());
  }

  async capacity(): Promise<CapacitySnapshot> {
    return await this.withCapability(() => this.client?.capacity());
  }

  async beginDrain(window: string, epoch: number): Promise<Snapshot> {
    return await this.withCapability((capability) => this.client?.beginDrain(window, epoch, capability));
  }

  async resume(window: string, epoch: number): Promise<Snapshot> {
    return await this.withCapability((capability) => this.client?.resume(window, epoch, capability));
  }

  private async withCapability<T>(operation: (capability: string) => Promise<T> | undefined): Promise<T> {
    const capability = this.controlToken;
    if (!this.client || !isValidToken(capability)) {
      throw new AppError("MAINTENANCE_CONTROL_UNAVAILABLE", "Maintenance control is not enabled", 503, true);
    }
    try {
      const result = await operation(capability);
      if (result === undefined) throw new AppError("MAINTENANCE_CONTROL_UNAVAILABLE", "Maintenance control is not enabled", 503, true);
      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw mapMaintenanceError(error);
    }
  }
}

export function isValidToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= TOKEN_MIN_LENGTH;
}

function mapMaintenanceError(error: unknown): AppError {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "CONTROL_UNAUTHORIZED":
      return new AppError("MAINTENANCE_CONTROL_UNAVAILABLE", "Maintenance control is not enabled", 503, true);
    case "INVALID_ID":
    case "INVALID_EPOCH":
      return new AppError("MAINTENANCE_REQUEST_INVALID", "Maintenance control request is invalid", 400);
    case "STALE_CONTROL":
    case "WINDOW_CONFLICT":
    case "ACTIVE_WORK":
      return new AppError("MAINTENANCE_STATE_CONFLICT", "Maintenance state changed; refresh and retry", 409, true);
    case "CAPACITY_EXCEEDED":
      return new AppError("MAINTENANCE_CAPACITY_EXCEEDED", "Maintenance capacity requires manual review", 503, true);
    default:
      return new AppError("MAINTENANCE_CONTROL_FAILED", "Maintenance control failed", 503, true);
  }
}
