#!/usr/bin/env bun

import { isAbsolute, resolve } from "node:path";
import { verifyStandaloneManifest } from "./standalone-manifest";

const [installedRoot, expectedAppVersion] = process.argv.slice(2);

if (!installedRoot || !isAbsolute(installedRoot)) {
  throw new Error("Installed standalone verification requires an absolute root");
}
if (!expectedAppVersion) {
  throw new Error("Installed standalone verification requires an app version");
}

const root = resolve(installedRoot);
const manifest = verifyStandaloneManifest(root, expectedAppVersion);

process.stdout.write(
  `${JSON.stringify({
    verified: true,
    root,
    ...manifest,
  })}\n`,
);
