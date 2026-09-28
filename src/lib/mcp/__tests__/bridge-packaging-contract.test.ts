/**
 * FD-063 MCP-11b: the stdio bridge ships inside the installer beside the
 * WhatsApp sidecar, and the desktop shell tells the web runtime where it is
 * so the Connected agents dialog can hand the seller a ready client config.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("MCP bridge packaging", () => {
  it("is declared as a Tauri externalBin", () => {
    const config = JSON.parse(read("src-tauri/tauri.conf.json")) as {
      bundle: { externalBin: string[] };
    };
    expect(config.bundle.externalBin).toEqual(["binaries/sahelflow-whatsapp", "binaries/sahelflow-mcp"]);
  });

  it("is compiled by the sidecar build from the bridge source", () => {
    const build = read("scripts/build-sidecar.ts");
    expect(build).toContain('name: "sahelflow-mcp"');
    expect(build).toContain('source: "sidecars/mcp/index.ts"');
  });

  it("is advertised to the web runtime only when installed", () => {
    const desktop = read("src-tauri/src/lib.rs");
    expect(desktop).toContain('const MCP_BRIDGE_NAME: &str = "sahelflow-mcp";');
    expect(desktop).toContain('"SF_MCP_BRIDGE_PATH".to_string()');
    expect(desktop).toContain("candidate.is_file().then_some(candidate)");
  });

  it("has a placeholder in every Linux cargo lane", () => {
    for (const workflow of [".github/workflows/ci.yml", ".github/workflows/native-source.yml"]) {
      expect(read(workflow)).toContain("touch src-tauri/binaries/sahelflow-mcp-x86_64-unknown-linux-gnu");
    }
  });
});
