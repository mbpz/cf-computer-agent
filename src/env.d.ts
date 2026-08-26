declare global {
  interface Env {
    /** Optional paid capability; absent in the Cloudflare-free text-only deployment. */
    ORIGINALS?: R2Bucket;
    APP_TOKEN?: string;
    BOOTSTRAP_ADMIN_EMAIL?: string;
    GITHUB_OAUTH_CLIENT_ID?: string;
    GITHUB_OAUTH_CLIENT_SECRET?: string;
    WECHAT_APP_ID?: string;
    WECHAT_APP_SECRET?: string;
    ALLOWED_WECHAT_SUBJECTS?: string;
    BOOTSTRAP_WECHAT_SUBJECT?: string;
    ALLOWED_MEMBER_EMAILS?: string;
    AUTOMATION_CLIENT_ID?: string;
    AUTOMATION_SECRET?: string;
  }
}

export {};
