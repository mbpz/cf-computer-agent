declare global {
  interface Env {
    /** Optional paid capability; absent in the Cloudflare-free text-only deployment. */
    ORIGINALS?: R2Bucket;
    APP_TOKEN?: string;
    BOOTSTRAP_ADMIN_EMAIL?: string;
    GITHUB_OAUTH_CLIENT_ID?: string;
    GITHUB_OAUTH_CLIENT_SECRET?: string;
    ALLOWED_MEMBER_EMAILS?: string;
    AUTOMATION_CLIENT_ID?: string;
    AUTOMATION_SECRET?: string;
  }
}

export {};
