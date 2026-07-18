import "server-only";

import { isAbsolute, resolve } from "node:path";

export function dataRoot(): string {
  const configured = process.env.SF_DATA_DIR;
  if (configured) {
    if (!isAbsolute(configured)) {
      throw new Error("SF_DATA_DIR must be an absolute path");
    }
    return resolve(configured);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("SF_DATA_DIR is required in production");
  }
  return resolve(process.cwd(), "data");
}
