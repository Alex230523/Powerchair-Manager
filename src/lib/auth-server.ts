import "server-only";
import { createAuth } from "./auth";
import { getDb, getMailDb } from "./db";
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth(getDb(), getMailDb()));
}
