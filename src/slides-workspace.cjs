const fs = require("fs");
const path = require("path");

const {
  getResolutionSize,
  normalizeResolutionPreset,
} = require("./export-resolution.cjs");

const WORKSPACE_CONFIG_FILE = ".slides-grab.json";

function getWorkspaceConfigPath(slidesDir) {
  return path.resolve(slidesDir, WORKSPACE_CONFIG_FILE);
}

function normalizeWorkspaceConfig(rawConfig = {}) {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new Error("Workspace config must be a JSON object.");
  }

  const resolution = normalizeResolutionPreset(rawConfig.resolution);
  return resolution ? { resolution } : {};
}

function readSlidesWorkspaceConfig(slidesDir) {
  const configPath = getWorkspaceConfigPath(slidesDir);

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return normalizeWorkspaceConfig(JSON.parse(raw));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {};
    }

    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to read workspace config at ${configPath}: ${reason}`,
    );
  }
}

function writeSlidesWorkspaceConfig(slidesDir, rawConfig = {}) {
  const config = normalizeWorkspaceConfig(rawConfig);
  const configPath = getWorkspaceConfigPath(slidesDir);

  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  return {
    config,
    configPath,
  };
}

function resolveWorkspaceResolution(slidesDir, cliResolution = "", workspaceConfig = null) {
  const override = normalizeResolutionPreset(cliResolution);
  if (override) {
    return {
      resolution: override,
      resolutionSource: "cli",
    };
  }

  const config = workspaceConfig || readSlidesWorkspaceConfig(slidesDir);
  if (config.resolution) {
    return {
      resolution: config.resolution,
      resolutionSource: "workspace",
    };
  }

  return {
    resolution: "",
    resolutionSource: "default",
  };
}

function getSlidesWorkspaceInfo(slidesDir, cliResolution = "") {
  const resolvedSlidesDir = path.resolve(slidesDir);
  const configPath = getWorkspaceConfigPath(resolvedSlidesDir);
  const config = readSlidesWorkspaceConfig(resolvedSlidesDir);
  const resolved = resolveWorkspaceResolution(resolvedSlidesDir, cliResolution, config);

  return {
    slidesDir: resolvedSlidesDir,
    configPath,
    config,
    resolution: resolved.resolution,
    resolutionSource: resolved.resolutionSource,
    size: getResolutionSize(resolved.resolution),
  };
}

module.exports = {
  WORKSPACE_CONFIG_FILE,
  getSlidesWorkspaceInfo,
  getWorkspaceConfigPath,
  readSlidesWorkspaceConfig,
  resolveWorkspaceResolution,
  writeSlidesWorkspaceConfig,
};
