/* Minimal ESM bundler for the headless tooling under src/tools.
 *
 * The game modules that this toolchain needs (physics.js, levels.js, modes.js,
 * rng.js) have no external dependencies, so a tiny resolver is enough to turn
 * the import graph into one self-contained ES module that can be run anywhere
 * that cannot resolve workspace-relative paths (e.g. an isolated Web Worker):
 *
 *   const code = bundleModules("src/tools/levelcheck.js", files);
 *   const mod = await import(URL.createObjectURL(new Blob([code], { type: "text/javascript" })));
 *
 * `files` is a plain { "src/physics.js": source } map. Unsupported syntax
 * (default exports, dynamic imports, non-relative specifiers) throws loudly
 * instead of silently producing a broken bundle.
 */
(function (global) {
  "use strict";

  function normPath(p) {
    const parts = String(p).replace(/\\/g, "/").split("/");
    const out = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return out.join("/");
  }

  function resolve(fromPath, spec) {
    if (!spec.startsWith(".")) throw new Error("bundle: external import not supported: " + spec);
    const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
    let p = normPath(dir + "/" + spec);
    if (!/\.(js|mjs)$/.test(p)) p += ".js";
    return p;
  }

  function collectExports(src) {
    const names = [];
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
      names.push([m[1], m[1]]);
    }
    for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*(?:from\s*["']([^"']+)["'])?/g)) {
      const spec = m[2];
      for (const raw of m[1].split(",")) {
        const t = raw.trim();
        if (!t) continue;
        const [a, b] = t.split(/\s+as\s+/);
        if (spec) names.push([(b ?? a).trim(), null]); /* handled by the re-export pass */
        else names.push([(b ?? a).trim(), a.trim()]);
      }
    }
    return names;
  }

  function rewrite(path, src, deps, prelude) {
    let body = src;

    body = body.replace(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']\s*;?/g, (mm, list, spec) => {
      const dep = resolve(path, spec);
      deps.push(dep);
      const pairs = list
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [a, b] = s.split(/\s+as\s+/);
          return `${JSON.stringify((b ?? a).trim())}: __req(${JSON.stringify(dep)})[${JSON.stringify(a.trim())}]`;
        });
      return `__reexport({ ${pairs.join(", ")} });`;
    });

    body = body.replace(/import\s+([\s\S]*?)\s+from\s*["']([^"']+)["']\s*;?/g, (mm, clause, spec) => {
      const dep = resolve(path, spec);
      deps.push(dep);
      prelude.push(bindClause(dep, clause));
      return "";
    });
    body = body.replace(/import\s*["']([^"']+)["']\s*;?/g, (mm, spec) => {
      const dep = resolve(path, spec);
      deps.push(dep);
      prelude.push(`__req(${JSON.stringify(dep)});`);
      return "";
    });

    if (/export\s+default/.test(body)) throw new Error("bundle: default exports unsupported (" + path + ")");
    if (/\bimport\s*\(/.test(body)) throw new Error("bundle: dynamic import unsupported (" + path + ")");

    body = body.replace(/export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\b)/g, "");
    body = body.replace(/export\s*\{[^}]*\}\s*;?/g, "");
    return body;
  }

  function bindClause(dep, clause) {
    const q = JSON.stringify(dep);
    let rest = clause.trim();
    let out = "";
    const named = rest.match(/\{([\s\S]*)\}/);
    if (named) {
      rest = rest.replace(named[0], "").replace(/,\s*$/, "").trim();
      const list = named[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          const [a, b] = s.split(/\s+as\s+/);
          return b ? `${a.trim()}: ${b.trim()}` : a.trim();
        });
      if (list.length) out += `const { ${list.join(", ")} } = __req(${q});\n`;
    }
    if (rest) {
      if (rest.startsWith("* as ")) out += `const ${rest.slice(5).trim()} = __req(${q});\n`;
      else out += `const ${rest.trim()} = __req(${q}).default;\n`;
    }
    return out;
  }

  function bundleModules(entryPath, files) {
    const entry = normPath(entryPath);
    const modules = {};
    const order = [];
    const visit = (path) => {
      if (modules[path]) return;
      const src = files[path];
      if (src == null) throw new Error("bundle: missing file: " + path);
      const deps = [];
      const prelude = [];
      const body = rewrite(path, src, deps, prelude);
      const expanded = [...collectExports(src)];
      for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
        const spec = m[2];
        for (const raw of m[1].split(",")) {
          const t = raw.trim();
          if (!t) continue;
          const [a, b] = t.split(/\s+as\s+/);
          expanded.push([(b ?? a).trim(), null]);
        }
        void spec;
      }
      const assigns = expanded
        .filter(([, local]) => local !== null)
        .map(([exp, local]) => `__exp[${JSON.stringify(exp)}] = ${local};`);
      modules[path] = {
        body,
        prelude,
        assigns,
        entry: path === entry,
      };
      order.push(path);
      for (const d of deps) visit(d);
    };
    visit(entry);

    const chunks = [];
    chunks.push("const __mods = Object.create(null);");
    chunks.push("const __cache = Object.create(null);");
    chunks.push("function __def(p, f){ __mods[p] = f; }");
    chunks.push("function __req(p){");
    chunks.push("  const c = __cache[p];");
    chunks.push("  if (c) return c;");
    chunks.push("  const f = __mods[p];");
    chunks.push('  if (!f) throw new Error("bundle: module not bundled: " + p);');
    chunks.push("  const m = {};");
    chunks.push("  __cache[p] = m;");
    chunks.push("  const r = f();");
    chunks.push("  if (r) for (const k in r) m[k] = r[k];");
    chunks.push("  return m;");
    chunks.push("}");

    for (const path of order) {
      const mod = modules[path];
      chunks.push(`__def(${JSON.stringify(path)}, function(){`);
      chunks.push("  const __exp = {};");
      chunks.push('  const __reexport = (o) => { for (const k in o) __exp[k] = o[k]; };');
      chunks.push(mod.prelude.join(""));
      chunks.push(mod.body);
      chunks.push(mod.assigns.join("\n"));
      chunks.push("  return __exp;");
      chunks.push("});");
    }

    const entryNames = collectExports(files[entry])
      .filter(([, local]) => local !== null)
      .map(([exp]) => exp);
    chunks.push(`const __entry = __req(${JSON.stringify(entry)});`);
    for (const name of entryNames) {
      chunks.push(`export const ${name} = __entry[${JSON.stringify(name)}];`);
    }
    if (!entryNames.length) chunks.push("export default __entry;");
    return chunks.join("\n");
  }

  global.bundleModules = bundleModules;

  /* Every module the headless toolchain needs, in load order for convenience. */
  global.TOOL_FILES = [
    "src/tools/bundle.js",
    "src/tools/harness.js",
    "src/tools/levelcheck.js",
    "src/tools/regression.js",
    "src/physics.js",
    "src/levels.js",
    "src/modes.js",
    "src/rng.js",
  ];

  /* Bundle + import a tool entry in one call. `files` is the preloaded
   * { "src/x.js": source } map (read it with the worker's fs API). */
  global.loadToolModule = async function (entryPath, files) {
    const code = bundleModules(entryPath, files);
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    try {
      return await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
