import type { GameBuildInfo } from '../src/build/BuildInfo';
export function resolveBuildInfo(root: string, options?: { now?: string; mode?: string; environment?: Record<string, string | undefined> }): GameBuildInfo;
