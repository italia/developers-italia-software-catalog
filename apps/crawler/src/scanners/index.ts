import type { Driver, Scanner } from "../types.ts";
import { bitbucket } from "./bitbucket.ts";
import { gitea } from "./gitea.ts";
import { github } from "./github.ts";
import { gitlab } from "./gitlab.ts";

export const scanners: Record<Driver, Scanner> = { github, gitlab, bitbucket, gitea };
