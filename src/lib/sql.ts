/**
 * Security (06/11/2026): a search typed by someone is matched as text. In a
 * LIKE pattern, % and _ are wildcards and \ escapes them (PostgreSQL's default
 * escape character): they are escaped, so « 50% » looks for « 50% ». The value
 * always goes to the database as a parameter, never inside the SQL text.
 */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);
