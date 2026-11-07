export type Installed = { name: string; version: string; dev: boolean };
export type Finding = { id: string; name: string; version: string; dev: boolean; severity?: string; summary?: string };
export type Review = { id: string; package: string; versions: string[]; reason: string; reviewed: string; expires: string };
export function lockPackages(lock: { packages?: Record<string, { version?: string; dev?: boolean; link?: boolean }> }): Installed[];
export function judge(findings: Finding[], reviewed: Review[], today: string): { failures: string[]; warnings: string[] };
