import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const releaseDir = path.join(root, "release");
const webArtifactDir = path.join(releaseDir, "web");

await assertBuiltDist();
await mkdir(releaseDir, { recursive: true });
await rm(webArtifactDir, { recursive: true, force: true });
await cp(distDir, webArtifactDir, { recursive: true });
await writeFile(
  path.join(webArtifactDir, "RELEASE-NOTES.txt"),
  [
    "Edinburgh Gardens 2030 web build",
    "",
    "Serve this directory over HTTP for browser play.",
    "For LAN multiplayer, the Electron app is the preferred host/client.",
    "Browser LAN clients should open the host machine's HTTP URL rather than a public HTTPS deployment."
  ].join("\n")
);
console.log(`Web artifact staged at ${path.relative(root, webArtifactDir)}`);

async function assertBuiltDist() {
  try {
    const index = await stat(path.join(distDir, "index.html"));
    if (index.isFile()) {
      return;
    }
  } catch {
    // Fall through to the explicit error below.
  }
  throw new Error("Missing dist/index.html. Run npm run build before packaging the web artifact.");
}
