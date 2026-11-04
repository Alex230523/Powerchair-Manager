/**
 * 19: the project's GitHub issues, reached by the server only. The token
 * (limited to the repository's issues) and the repository come from the
 * environment and never reach a browser or a log.
 */
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
let impl: Fetch = (url, init) => fetch(url, init);
/** Tests stand in for GitHub. */
export function setGithubFetch(f: Fetch | null) {
  impl = f ?? ((url, init) => fetch(url, init));
  privacy = null;
}
export type GithubConfig = { token: string; repo: string };
export function githubConfig(): GithubConfig | null {
  const token = process.env.PFM_FEEDBACK_GITHUB_TOKEN ?? "";
  const repo = process.env.PFM_FEEDBACK_GITHUB_REPO ?? "";
  return token && /^[\w.-]+\/[\w.-]+$/.test(repo) ? { token, repo } : null;
}
async function call(cfg: GithubConfig, path: string, init: RequestInit = {}) {
  const r = await impl(`https://api.github.com/repos/${cfg.repo}${path}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${cfg.token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "powerchair-manager" },
  });
  if (!r.ok) throw new Error(`GITHUB_${r.status}`);
  return r.json();
}
/** The screenshots go only to a private repository (checked, then kept ten minutes). */
let privacy: { private: boolean; at: number } | null = null;
export async function repoIsPrivate(cfg: GithubConfig) {
  if (privacy && Date.now() - privacy.at < 600000) return privacy.private;
  const v = (await call(cfg, "")) as { private?: boolean };
  privacy = { private: v.private === true, at: Date.now() };
  return privacy.private;
}
export async function createIssue(cfg: GithubConfig, issue: { title: string; body: string; labels: string[] }) {
  const v = (await call(cfg, "/issues", { method: "POST", body: JSON.stringify(issue) })) as { number: number; html_url: string };
  return { number: v.number, url: v.html_url };
}
export async function issueState(cfg: GithubConfig, n: number) {
  const v = (await call(cfg, `/issues/${n}`)) as { state: string; labels: ({ name: string } | string)[] };
  return { closed: v.state === "closed", labels: v.labels.map((l) => (typeof l === "string" ? l : l.name).toLowerCase()) };
}
