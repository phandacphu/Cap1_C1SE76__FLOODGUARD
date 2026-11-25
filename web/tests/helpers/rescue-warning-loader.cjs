const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const root = path.resolve(__dirname, "../../src");
function loader(stubs = {}, globals = {}) {
  const cache = new Map();
  function load(file) {
    if (file.endsWith(".css")) return {};
    if (file.endsWith(".json")) return JSON.parse(readFileSync(file));
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts
      .transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replaceAll("import.meta.env", "({})");
    const customRequire = (name) => {
      if (name.endsWith(".css")) return {};
      if (name.endsWith("/WarningSessionAction") && !Object.hasOwn(stubs, name))
        return { WarningSessionAction: "SessionAction" };
      if (Object.hasOwn(stubs, name)) return stubs[name];
      if (name.endsWith("/api/authApi"))
        return { API_URL: "https://must-not-call.test/api" };
      if (name.endsWith("/api/http"))
        return {
          ApiError: class ApiError extends Error {
            constructor(message, status) {
              super(message);
              this.status = status;
            }
          },
        };
      if (!name.startsWith(".")) return require(name);
      let resolved = path.resolve(path.dirname(file), name);
      if (!existsSync(resolved))
        resolved = [".ts", ".tsx", ".json"]
          .map((ext) => resolved + ext)
          .find(existsSync);
      assert.ok(resolved, `module ${name}`);
      return load(resolved);
    };
    vm.runInNewContext(
      code,
      {
        exports,
        require: customRequire,
        console,
        Date,
        Intl,
        Error,
        DOMException,
        AbortController,
        URLSearchParams,
        structuredClone,
        setTimeout,
        clearTimeout,
        ...globals,
        fetch() {
          throw new Error("Rescue fixture must not fetch any API");
        },
      },
      { filename: file },
    );
    return exports;
  }
  return (relative) => load(path.join(root, relative));
}

module.exports = { loader };
