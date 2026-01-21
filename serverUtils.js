import fs from "fs";
import path from "path";
import archiver from "archiver";
import unzipper from "unzipper";

const ROOT = process.cwd();
export const SCORES_DIR = path.join(ROOT, "public/scores");
export const TEMPLATE_DIR = path.join(SCORES_DIR, "template");


export function assertSafeProjectName(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(
      "Invalid project name. Use only letters, numbers, hyphens, and underscores."
    );
  }
}

function projectPath(name) {
  return path.join(SCORES_DIR, name);
}



export function createNewProject(projectName) {
  assertSafeProjectName(projectName);

  const targetDir = projectPath(projectName);

  if (fs.existsSync(targetDir)) {
    throw new Error("Project already exists");
  }

  fs.cpSync(TEMPLATE_DIR, targetDir, {
    recursive: true,
    errorOnExist: true
  });

  // Optional: update preferences.json
  const prefsPath = path.join(targetDir, "preferences.json");
  if (fs.existsSync(prefsPath)) {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    prefs.projectName = projectName;
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
  }

  return projectName;
}




export function saveProjectAs(sourceProject, newProjectName) {
  assertSafeProjectName(newProjectName);

  const sourceDir = projectPath(sourceProject);
  const targetDir = projectPath(newProjectName);

  if (!fs.existsSync(sourceDir)) {
    throw new Error("Source project not found");
  }

  if (fs.existsSync(targetDir)) {
    throw new Error("Target project already exists");
  }

  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    errorOnExist: true
  });

  // Optional: update preferences.json
  const prefsPath = path.join(targetDir, "preferences.json");
  if (fs.existsSync(prefsPath)) {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf8"));
    prefs.projectName = newProjectName;
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
  }

  return newProjectName;
}

export function exportProject(projectName, res, oscillaVersion) {
  const dir = projectPath(projectName);

  if (!fs.existsSync(dir)) {
    throw new Error("Project not found");
  }

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${projectName}.oscilla"`
  );

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  // Manifest
  archive.append(
    JSON.stringify({
      format: "oscilla-project",
      oscillaVersion,
      entry: "score.svg",
      created: new Date().toISOString()
    }, null, 2),
    { name: "oscilla.manifest.json" }
  );

  archive.directory(dir, false);
  archive.finalize();
}


export async function importProject(buffer, projectName) {
  assertSafeProjectName(projectName);

  const targetDir = projectPath(projectName);

  if (fs.existsSync(targetDir)) {
    throw new Error("Project already exists");
  }

  fs.mkdirSync(targetDir, { recursive: true });

  const directory = await unzipper.Open.buffer(buffer);

  await directory.extract({ path: targetDir });

  // Validate manifest
  const manifestPath = path.join(targetDir, "oscilla.manifest.json");
  if (!fs.existsSync(manifestPath)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw new Error("Invalid .oscilla file (no manifest)");
  }

  // Validate score
  const scorePath = path.join(targetDir, "score.svg");
  if (!fs.existsSync(scorePath)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw new Error("Invalid project (missing score.svg)");
  }

  return projectName;
}