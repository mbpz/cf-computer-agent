import type { CreateEmailLoginChallenge, EmailLoginChallenge } from "./types";

export interface EmailLoginRepositoryPort {
  /** The newest challenge for an email, consumed or not; older rows are history. */
  findLatest(email: string): Promise<EmailLoginChallenge | null>;
  /**
   * Conditional insert: false when a challenge was created within the resend
   * interval, the hourly ceiling is reached, or a racing request won first.
   * The same batch prunes this email's day-old history.
   */
  insert(
    challenge: CreateEmailLoginChallenge,
    limits: { notBefore: string; hourlySince: string; hourlyLimit: number },
  ): Promise<boolean>;
  /** Conditional counter bump: false once consumed or at the ceiling. */
  recordFailedAttempt(id: string, ceiling: number): Promise<boolean>;
  /** Conditional single use within expiry and under the ceiling. */
  consume(id: string, now: string, ceiling: number): Promise<boolean>;
}

type ChallengeRow = {
  id: string;
  email: string;
  code_hash: string;
  attempt_count: number;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
};

export class EmailLoginRepository implements EmailLoginRepositoryPort {
  constructor(private readonly db: D1Database) {}

  async findLatest(email: string): Promise<EmailLoginChallenge | null> {
    const row = await this.db.prepare(
      `${challengeSelect} WHERE email = ? ORDER BY created_at DESC, id DESC LIMIT 1`,
    ).bind(email).first<ChallengeRow>();
    return row === null ? null : mapChallengeRow(row);
  }

  async insert(
    challenge: CreateEmailLoginChallenge,
    limits: { notBefore: string; hourlySince: string; hourlyLimit: number },
  ): Promise<boolean> {
    const results = await this.db.batch([
      // Codes expire in ten minutes and rate limiting only looks at the last
      // hour, so older rows are pruned globally instead of growing forever.
      this.db.prepare("DELETE FROM email_login_codes WHERE created_at < ?")
        .bind(limits.hourlySince),
      this.db.prepare(
        `INSERT INTO email_login_codes (id, email, code_hash, attempt_count, created_at, expires_at)
         SELECT ?, ?, ?, 0, ?, ?
         WHERE NOT EXISTS (
           SELECT 1 FROM email_login_codes WHERE email = ? AND created_at > ?
         )
         AND (
           SELECT COUNT(*) FROM email_login_codes WHERE email = ? AND created_at > ?
         ) < ?`,
      ).bind(
        challenge.id,
        challenge.email,
        challenge.codeHash,
        challenge.createdAt,
        challenge.expiresAt,
        challenge.email,
        limits.notBefore,
        challenge.email,
        limits.hourlySince,
        limits.hourlyLimit,
      ),
    ]);
    return results[1]?.meta.changes === 1;
  }

  async recordFailedAttempt(id: string, ceiling: number): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE email_login_codes SET attempt_count = attempt_count + 1
       WHERE id = ? AND consumed_at IS NULL AND attempt_count < ?`,
    ).bind(id, ceiling).run();
    return result.meta.changes === 1;
  }

  async consume(id: string, now: string, ceiling: number): Promise<boolean> {
    const result = await this.db.prepare(
      `UPDATE email_login_codes SET consumed_at = ?
       WHERE id = ? AND consumed_at IS NULL AND expires_at > ? AND attempt_count < ?`,
    ).bind(now, id, now, ceiling).run();
    return result.meta.changes === 1;
  }
}

const challengeSelect = "SELECT id, email, code_hash, attempt_count, created_at, expires_at, consumed_at FROM email_login_codes";

function mapChallengeRow(row: ChallengeRow): EmailLoginChallenge {
  return {
    id: row.id,
    email: row.email,
    codeHash: row.code_hash,
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  };
}
