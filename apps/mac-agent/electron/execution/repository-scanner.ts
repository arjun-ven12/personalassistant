import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  RepositoryScanResultSchema,
  type ApiRouteRecord,
  type ArchitectureEdge,
  type ArchitectureNode,
  type DatabaseModelRecord,
  type SemanticDependencyRecord,
  type SemanticReferenceRecord,
  type SemanticRelationRecord,
  type SemanticSymbolRecord,
} from "@alexa-control/shared";
import * as ts from "typescript";

import { CapabilityError } from "./errors.js";
import { resolveWorkspace } from "./path-policy.js";

const DEFAULT_IGNORES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  "vendor",
  "tmp",
  "temp",
]);

const languageFor = (fileName: string, extension: string) => {
  const lower = fileName.toLowerCase();
  if (["package.json", "pnpm-lock.yaml", "yarn.lock"].includes(lower)) return "Node.js";
  if (["ts", "tsx", "mts", "cts"].includes(extension)) return "TypeScript";
  if (["js", "jsx", "mjs", "cjs"].includes(extension)) return "JavaScript";
  if (extension === "py") return "Python";
  if (["md", "mdx"].includes(extension)) return "Markdown";
  if (extension === "sql") return "SQL";
  if (["json", "jsonc"].includes(extension)) return "JSON";
  if (["yaml", "yml"].includes(extension)) return "YAML";
  if (extension === "css") return "CSS";
  if (extension === "html") return "HTML";
  if (extension === "toml") return "TOML";
  if (extension === "dockerfile" || lower === "dockerfile") return "Docker";
  return "Unknown";
};

const classify = (relativePath: string, fileName: string, extension: string) => {
  const lower = relativePath.toLowerCase();
  if (/(\.test\.|\.spec\.|__tests__|\/tests?\/)/.test(lower)) return "test" as const;
  if (["md", "mdx", "txt", "rst"].includes(extension)) return "documentation" as const;
  if (
    ["json", "jsonc", "yaml", "yml", "toml", "lock", "config"].includes(extension) ||
    [
      "package.json",
      "tsconfig.json",
      "vite.config.ts",
      "eslint.config.js",
      "dockerfile",
      ".gitignore",
    ].includes(fileName.toLowerCase())
  )
    return "configuration" as const;
  if (["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"].includes(extension))
    return "asset" as const;
  if (/(\.generated\.|generated\/|dist\/|build\/)/.test(lower))
    return "generated" as const;
  if (["ts", "tsx", "js", "jsx", "py", "sql", "css", "html"].includes(extension))
    return "source" as const;
  return "unknown" as const;
};

const metadataFingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const parseIgnoreLines = (content: string) =>
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("!"))
    .map((line) => line.replace(/^\//, "").replace(/\/$/, ""));

const shouldIgnore = (relativePath: string, name: string, rules: Set<string>) => {
  if (rules.has(name)) return true;
  const normalized = relativePath.replaceAll("\\", "/");
  return [...rules].some((rule) => {
    if (rule.includes("*")) {
      const [prefix = "", suffix = ""] = rule.split("*");
      return name.startsWith(prefix) && name.endsWith(suffix);
    }
    return normalized === rule || normalized.startsWith(`${rule}/`);
  });
};

const matchesBlockedPattern = (relativePath: string, patterns: string[]) => {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized.split("/");
  return patterns.some((pattern) => {
    const clean = pattern.replace(/\/$/, "");
    if (clean.startsWith("*.")) {
      return segments.some((segment) => segment.endsWith(clean.slice(1)));
    }
    if (clean.includes("*")) {
      const [prefix = "", suffix = ""] = clean.split("*");
      return segments.some(
        (segment) => segment.startsWith(prefix) && segment.endsWith(suffix),
      );
    }
    return (
      normalized === clean ||
      normalized.startsWith(`${clean}/`) ||
      segments.includes(clean)
    );
  });
};

const increment = (target: Record<string, number>, key: string) => {
  target[key] = (target[key] ?? 0) + 1;
};

const SEMANTIC_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
]);
const MAX_SEMANTIC_FILE_BYTES = 512 * 1024;
const MAX_SYMBOLS = 50_000;
const MAX_REFERENCES = 100_000;
const MAX_ARCHITECTURE_EDGES = 100_000;

type ScannedSymbol = Omit<SemanticSymbolRecord, "repositoryId" | "generation">;
type ScannedDependency = Omit<SemanticDependencyRecord, "repositoryId" | "generation">;
type ScannedReference = Omit<SemanticReferenceRecord, "repositoryId" | "generation">;
type ScannedRelation = Omit<SemanticRelationRecord, "repositoryId" | "generation">;
type ScannedApiRoute = Omit<ApiRouteRecord, "repositoryId" | "generation">;
type ScannedDatabaseModel = Omit<DatabaseModelRecord, "repositoryId" | "generation">;
type ScannedArchitectureNode = Omit<ArchitectureNode, "repositoryId" | "generation">;
type ScannedArchitectureEdge = Omit<ArchitectureEdge, "repositoryId" | "generation">;

const semanticLanguageFor = (extension: string) =>
  ["ts", "tsx", "mts", "cts"].includes(extension) ? "TypeScript" : "JavaScript";

const scriptKindFor = (extension: string) => {
  if (extension === "tsx") return ts.ScriptKind.TSX;
  if (extension === "jsx") return ts.ScriptKind.JSX;
  if (["js", "mjs", "cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
};

const positionFor = (sourceFile: ts.SourceFile, node: ts.Node) => {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: position.line + 1, column: position.character + 1 };
};

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind) =>
  Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === kind),
  );

const visibilityFor = (node: ts.Node) => {
  if (hasModifier(node, ts.SyntaxKind.PrivateKeyword)) return "private" as const;
  if (hasModifier(node, ts.SyntaxKind.ProtectedKeyword)) return "protected" as const;
  if (hasModifier(node, ts.SyntaxKind.PublicKeyword)) return "public" as const;
  if (hasModifier(node, ts.SyntaxKind.ExportKeyword)) return "public" as const;
  return "internal" as const;
};

const declarationIsExported = (node: ts.Node) =>
  hasModifier(node, ts.SyntaxKind.ExportKeyword) ||
  (node.parent !== undefined && hasModifier(node.parent, ts.SyntaxKind.ExportKeyword));

const declarationName = (node: { name?: ts.PropertyName | ts.BindingName }) => {
  const name = node.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  return null;
};

const isPascalCase = (name: string) => /^[A-Z][A-Za-z0-9]*$/.test(name);
const isReactHookName = (name: string) => /^use[A-Z0-9]/.test(name);

const expressionName = (expression: ts.Expression): string | null => {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (
    ts.isElementAccessExpression(expression) &&
    ts.isStringLiteralLike(expression.argumentExpression)
  ) {
    return expression.argumentExpression.text;
  }
  return null;
};

const stringLiteralText = (node: ts.Node | undefined) =>
  node && ts.isStringLiteralLike(node) ? node.text : null;

const architectureKindFor = (
  relativePath: string,
  language: string,
  classification: string,
) => {
  const lower = relativePath.toLowerCase();
  if (
    classification === "test" ||
    /(\.test\.|\.spec\.|__tests__|\/tests?\/)/.test(lower)
  )
    return "test";
  if (
    classification === "configuration" ||
    /(^|\/)(config|eslint|vite|tsconfig|package\.json)/.test(lower)
  )
    return "configuration";
  if (/migrations\/|schema\.prisma|database|db\//.test(lower)) return "database";
  if (/deploy\/|\.github\/|systemd|launchd|docker/.test(lower)) return "infrastructure";
  if (/routes?\/|controllers?\/|\/api\//.test(lower)) return "api_layer";
  if (/middleware/.test(lower)) return "middleware";
  if (/services?\//.test(lower)) return "service";
  if (/models?\//.test(lower)) return "model";
  if (/\.(tsx|jsx)$/.test(lower) && /components?\//.test(lower)) return "component";
  if (/hooks?\//.test(lower) || /use[A-Z]/.test(relativePath)) return "hook";
  if (/utils?\//.test(lower) || /helpers?\//.test(lower)) return "utility";
  if (/apps\/web|frontend|renderer/.test(lower)) return "frontend";
  if (/apps\/api|backend|server/.test(lower)) return "backend";
  if (/packages\/shared|\/shared\//.test(lower)) return "shared";
  if (language === "TypeScript" || language === "JavaScript") return "module";
  return "module";
};

const relativeDirectoryName = (relativePath: string) => {
  const directory = path.posix.dirname(relativePath);
  return directory === "." ? "" : directory;
};

const moduleResolutionCandidates = (sourceFile: string, targetModule: string) => {
  if (!targetModule.startsWith(".")) return [];
  const sourceDirectory = relativeDirectoryName(sourceFile);
  const base = path.posix.normalize(path.posix.join(sourceDirectory, targetModule));
  const extensions = ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs", "json"];
  return [
    base,
    ...extensions.map((extension) => `${base}.${extension}`),
    ...extensions.map((extension) => `${base}/index.${extension}`),
  ];
};

const resolveInternalModule = (
  sourceFile: string,
  targetModule: string,
  knownFiles: Set<string>,
) =>
  moduleResolutionCandidates(sourceFile, targetModule).find((candidate) =>
    knownFiles.has(candidate),
  ) ?? null;

const containsPropertyName = (node: ts.Node, names: Set<string>): boolean => {
  if (ts.isPropertyAssignment(node)) {
    const name = declarationName({ name: node.name });
    if (name && names.has(name)) return true;
  }
  return (
    node.getChildCount() > 0 &&
    node.getChildren().some((child) => containsPropertyName(child, names))
  );
};

const findCycles = (
  dependencies: Array<{ sourceFile: string; targetFile: string | null }>,
) => {
  const graph = new Map<string, Set<string>>();
  for (const dependency of dependencies) {
    if (!dependency.targetFile) continue;
    if (!graph.has(dependency.sourceFile)) graph.set(dependency.sourceFile, new Set());
    graph.get(dependency.sourceFile)!.add(dependency.targetFile);
  }
  const cycles: string[][] = [];
  const seenCycleKeys = new Set<string>();
  const visit = (node: string, pathStack: string[]) => {
    if (cycles.length >= 100) return;
    const existingIndex = pathStack.indexOf(node);
    if (existingIndex >= 0) {
      const cycle = pathStack.slice(existingIndex);
      const key = [...cycle].sort().join("\u0000");
      if (!seenCycleKeys.has(key)) {
        seenCycleKeys.add(key);
        cycles.push(cycle.slice(0, 50));
      }
      return;
    }
    if (pathStack.length > 50) return;
    for (const target of graph.get(node) ?? []) visit(target, [...pathStack, node]);
  };
  for (const node of graph.keys()) visit(node, []);
  return cycles;
};

const buildSemanticIndex = async (input: {
  workspaceId: string;
  rootPath: string;
  files: Array<Record<string, unknown>>;
}) => {
  const knownFiles = new Set(input.files.map((file) => String(file.relativePath)));
  const symbols: ScannedSymbol[] = [];
  const imports: Array<Record<string, unknown>> = [];
  const exports: Array<Record<string, unknown>> = [];
  const dependencies: ScannedDependency[] = [];
  const references: ScannedReference[] = [];
  const relations: ScannedRelation[] = [];
  const apiRoutes: ScannedApiRoute[] = [];
  const databaseModels: ScannedDatabaseModel[] = [];
  const architectureNodes: ScannedArchitectureNode[] = [];
  const architectureEdges: ScannedArchitectureEdge[] = [];
  const symbolByName = new Map<string, string>();
  const symbolNamesById = new Map<string, string>();
  const fileNodeIds = new Map<string, string>();

  const addArchitectureNode = (file: Record<string, unknown>) => {
    const relativePath = String(file.relativePath);
    const nodeId = metadataFingerprint(["architecture:file", relativePath]);
    fileNodeIds.set(relativePath, nodeId);
    architectureNodes.push({
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      nodeId,
      kind: architectureKindFor(
        relativePath,
        String(file.language),
        String(file.classification),
      ),
      label: relativePath,
      relativePath,
      metadata: {
        language: String(file.language),
        classification: String(file.classification),
      },
    });
  };

  for (const file of input.files) addArchitectureNode(file);

  const addSymbol = (record: {
    name: string;
    kind: ScannedSymbol["kind"];
    parentSymbolId: string | null;
    language: "TypeScript" | "JavaScript";
    relativePath: string;
    line: number;
    column: number;
    visibility: ScannedSymbol["visibility"];
    exported: boolean;
    metadata?: ScannedSymbol["metadata"];
  }) => {
    if (symbols.length >= MAX_SYMBOLS || record.name.length > 255) return null;
    const symbolId = metadataFingerprint([
      "symbol",
      record.relativePath,
      record.kind,
      record.name,
      record.line,
      record.column,
      record.parentSymbolId,
    ]);
    const symbol: ScannedSymbol = {
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      symbolId,
      ...record,
    };
    symbols.push(symbol);
    if (!symbolByName.has(record.name)) symbolByName.set(record.name, symbolId);
    symbolNamesById.set(symbolId, record.name);
    if (record.kind === "component" || record.kind === "hook") {
      const sourceNodeId = fileNodeIds.get(record.relativePath);
      if (sourceNodeId && architectureEdges.length < MAX_ARCHITECTURE_EDGES) {
        const targetNodeId = metadataFingerprint(["architecture:symbol", symbolId]);
        architectureNodes.push({
          schemaVersion: "1",
          workspaceId: input.workspaceId,
          nodeId: targetNodeId,
          kind: record.kind,
          label: record.name,
          relativePath: record.relativePath,
          metadata: { symbolId },
        });
        architectureEdges.push({
          schemaVersion: "1",
          workspaceId: input.workspaceId,
          sourceNodeId,
          targetNodeId,
          relation: "contains",
        });
      }
    }
    return symbolId;
  };

  const addReference = (record: {
    name: string;
    kind: ScannedReference["kind"];
    sourceSymbolId: string | null;
    targetSymbolId: string | null;
    relativePath: string;
    line: number;
    column: number;
  }) => {
    if (references.length >= MAX_REFERENCES || record.name.length > 255) return;
    references.push({
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      referenceId: metadataFingerprint([
        "reference",
        record.relativePath,
        record.kind,
        record.name,
        record.line,
        record.column,
        record.sourceSymbolId,
      ]),
      name: record.name,
      kind: record.kind,
      sourceSymbolId: record.sourceSymbolId,
      targetSymbolId: record.targetSymbolId,
      location: {
        relativePath: record.relativePath,
        line: record.line,
        column: record.column,
      },
    });
  };

  for (const file of input.files) {
    const relativePath = String(file.relativePath);
    const extension = String(file.extension);
    const sizeBytes = Number(file.sizeBytes);
    if (!SEMANTIC_EXTENSIONS.has(extension) || sizeBytes > MAX_SEMANTIC_FILE_BYTES)
      continue;
    const absolutePath = path.join(input.rootPath, relativePath);
    const sourceText = await readFile(absolutePath, "utf8").catch(() => null);
    if (sourceText === null) continue;
    const language = semanticLanguageFor(extension);
    const sourceFile = ts.createSourceFile(
      relativePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(extension),
    );
    const symbolStack: string[] = [];
    const pendingRelations: Array<{
      sourceSymbolId: string;
      targetName: string;
      relationKind: "extends" | "implements" | "owns" | "calls";
    }> = [];

    const addDeclarationExport = (name: string, node: ts.Node) => {
      if (!declarationIsExported(node)) return;
      const pos = positionFor(sourceFile, node);
      exports.push({
        schemaVersion: "1",
        workspaceId: input.workspaceId,
        sourceFile: relativePath,
        exportedName: name,
        localName: name,
        line: pos.line,
        column: pos.column,
      });
    };

    const visit = (node: ts.Node) => {
      let pushedSymbolId: string | null = null;
      if (ts.isImportDeclaration(node)) {
        const importedModule = stringLiteralText(node.moduleSpecifier);
        if (importedModule) {
          const pos = positionFor(sourceFile, node);
          const importedNames: string[] = [];
          const clause = node.importClause;
          if (clause?.name) importedNames.push(clause.name.text);
          if (clause?.namedBindings) {
            if (ts.isNamespaceImport(clause.namedBindings))
              importedNames.push(clause.namedBindings.name.text);
            if (ts.isNamedImports(clause.namedBindings)) {
              for (const element of clause.namedBindings.elements)
                importedNames.push(element.name.text);
            }
          }
          imports.push({
            schemaVersion: "1",
            workspaceId: input.workspaceId,
            sourceFile: relativePath,
            importedModule,
            importedNames,
            isTypeOnly: Boolean(clause?.isTypeOnly),
            line: pos.line,
            column: pos.column,
          });
          const targetFile = resolveInternalModule(
            relativePath,
            importedModule,
            knownFiles,
          );
          dependencies.push({
            schemaVersion: "1",
            workspaceId: input.workspaceId,
            sourceFile: relativePath,
            targetModule: importedModule,
            targetFile,
            dependencyKind: targetFile
              ? "internal"
              : importedModule.startsWith(".")
                ? "unknown"
                : "external",
          });
        }
      }

      if (ts.isExportDeclaration(node)) {
        const pos = positionFor(sourceFile, node);
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            exports.push({
              schemaVersion: "1",
              workspaceId: input.workspaceId,
              sourceFile: relativePath,
              exportedName: element.name.text,
              localName: element.propertyName?.text ?? element.name.text,
              line: pos.line,
              column: pos.column,
            });
          }
        } else if (node.moduleSpecifier) {
          exports.push({
            schemaVersion: "1",
            workspaceId: input.workspaceId,
            sourceFile: relativePath,
            exportedName: "*",
            localName: null,
            line: pos.line,
            column: pos.column,
          });
        }
      }

      if (
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isFunctionDeclaration(node)
      ) {
        const name = declarationName(node);
        if (name) {
          const pos = positionFor(sourceFile, node);
          const kind = ts.isClassDeclaration(node)
            ? "class"
            : ts.isInterfaceDeclaration(node)
              ? "interface"
              : ts.isEnumDeclaration(node)
                ? "enum"
                : ts.isTypeAliasDeclaration(node)
                  ? "type"
                  : isReactHookName(name)
                    ? "hook"
                    : isPascalCase(name) && extension.endsWith("x")
                      ? "component"
                      : "function";
          pushedSymbolId = addSymbol({
            name,
            kind,
            parentSymbolId: symbolStack.at(-1) ?? null,
            language,
            relativePath,
            line: pos.line,
            column: pos.column,
            visibility: visibilityFor(node),
            exported: declarationIsExported(node),
          });
          addDeclarationExport(name, node);
          if (
            pushedSymbolId &&
            (ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node))
          ) {
            for (const clause of node.heritageClauses ?? []) {
              const relationKind =
                clause.token === ts.SyntaxKind.ExtendsKeyword
                  ? "extends"
                  : "implements";
              for (const type of clause.types) {
                pendingRelations.push({
                  sourceSymbolId: pushedSymbolId,
                  targetName: type.expression.getText(sourceFile).slice(0, 255),
                  relationKind,
                });
              }
            }
          }
        }
      }

      if (
        ts.isMethodDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isPropertyDeclaration(node)
      ) {
        const name = declarationName(node);
        const parentSymbolId = symbolStack.at(-1) ?? null;
        if (name && parentSymbolId) {
          const pos = positionFor(sourceFile, node);
          pushedSymbolId = addSymbol({
            name,
            kind: ts.isPropertyDeclaration(node) ? "property" : "method",
            parentSymbolId,
            language,
            relativePath,
            line: pos.line,
            column: pos.column,
            visibility: visibilityFor(node),
            exported: false,
          });
          if (pushedSymbolId) {
            pendingRelations.push({
              sourceSymbolId: parentSymbolId,
              targetName: name,
              relationKind: "owns",
            });
          }
        }
      }

      if (ts.isVariableDeclaration(node)) {
        const name = declarationName(node);
        if (name) {
          const pos = positionFor(sourceFile, node);
          const isFunctionLike =
            node.initializer &&
            (ts.isArrowFunction(node.initializer) ||
              ts.isFunctionExpression(node.initializer));
          const isConst =
            ts.isVariableDeclarationList(node.parent) &&
            Boolean(node.parent.flags & ts.NodeFlags.Const);
          const kind =
            isFunctionLike && isReactHookName(name)
              ? "hook"
              : isFunctionLike && isPascalCase(name) && extension.endsWith("x")
                ? "component"
                : isFunctionLike
                  ? "function"
                  : isConst
                    ? "constant"
                    : "variable";
          pushedSymbolId = addSymbol({
            name,
            kind,
            parentSymbolId: symbolStack.at(-1) ?? null,
            language,
            relativePath,
            line: pos.line,
            column: pos.column,
            visibility: visibilityFor(node.parent.parent),
            exported: declarationIsExported(node.parent.parent),
          });
          addDeclarationExport(name, node.parent.parent);
          if (node.initializer && ts.isCallExpression(node.initializer)) {
            const callName = expressionName(node.initializer.expression);
            if (
              callName &&
              ["pgTable", "mysqlTable", "sqliteTable", "model"].includes(callName)
            ) {
              const tableName =
                stringLiteralText(node.initializer.arguments[0]) ?? name;
              databaseModels.push({
                schemaVersion: "1",
                workspaceId: input.workspaceId,
                relativePath,
                modelName: tableName.slice(0, 255),
                modelKind: callName === "model" ? "mongoose_model" : "drizzle_table",
                fields: [],
                relationships: [],
                line: pos.line,
                column: pos.column,
              });
            }
          }
        }
      }

      if (ts.isCallExpression(node)) {
        const callName = expressionName(node.expression);
        const pos = positionFor(sourceFile, node);
        if (callName) {
          addReference({
            name: callName,
            kind: "call",
            sourceSymbolId: symbolStack.at(-1) ?? null,
            targetSymbolId: null,
            relativePath,
            line: pos.line,
            column: pos.column,
          });
          const currentSymbolId = symbolStack.at(-1);
          if (currentSymbolId) {
            pendingRelations.push({
              sourceSymbolId: currentSymbolId,
              targetName: callName,
              relationKind: "calls",
            });
          }
        }
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          ["get", "post", "put", "patch", "delete", "options", "head"].includes(
            node.expression.name.text,
          )
        ) {
          const routePath = stringLiteralText(node.arguments[0]);
          if (routePath) {
            const hasAuthHint = node.arguments.some((argument) =>
              containsPropertyName(
                argument,
                new Set(["preHandler", "onRequest", "authenticate", "requireAuth"]),
              ),
            );
            const httpMethod = node.expression.name.text.toUpperCase() as
              "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";
            apiRoutes.push({
              schemaVersion: "1",
              workspaceId: input.workspaceId,
              relativePath,
              httpMethod,
              routePath,
              handlerName:
                node.arguments
                  .map((argument) => expressionName(argument))
                  .find(Boolean) ?? null,
              authRequired: hasAuthHint,
              line: pos.line,
              column: pos.column,
            });
          }
        }
      }

      if (ts.isPropertyAccessExpression(node)) {
        const pos = positionFor(sourceFile, node);
        addReference({
          name: node.name.text,
          kind: "property_access",
          sourceSymbolId: symbolStack.at(-1) ?? null,
          targetSymbolId: null,
          relativePath,
          line: pos.line,
          column: pos.column,
        });
      }

      if (ts.isTypeReferenceNode(node)) {
        const name = node.typeName.getText(sourceFile).slice(0, 255);
        const pos = positionFor(sourceFile, node);
        addReference({
          name,
          kind: "type_reference",
          sourceSymbolId: symbolStack.at(-1) ?? null,
          targetSymbolId: null,
          relativePath,
          line: pos.line,
          column: pos.column,
        });
      }

      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(sourceFile).slice(0, 255);
        if (/^[A-Z]/.test(tagName)) {
          const pos = positionFor(sourceFile, node);
          addReference({
            name: tagName,
            kind: "jsx_usage",
            sourceSymbolId: symbolStack.at(-1) ?? null,
            targetSymbolId: null,
            relativePath,
            line: pos.line,
            column: pos.column,
          });
        }
      }

      if (pushedSymbolId) symbolStack.push(pushedSymbolId);
      ts.forEachChild(node, visit);
      if (pushedSymbolId) symbolStack.pop();
    };

    visit(sourceFile);
    for (const relation of pendingRelations) {
      relations.push({
        schemaVersion: "1",
        workspaceId: input.workspaceId,
        sourceSymbolId: relation.sourceSymbolId,
        targetName: relation.targetName,
        targetSymbolId: symbolByName.get(relation.targetName) ?? null,
        relationKind: relation.relationKind,
      });
    }
  }

  for (const dependency of dependencies) {
    const targetFile = dependency.targetFile ?? "";
    if (!targetFile) continue;
    const sourceNodeId = fileNodeIds.get(String(dependency.sourceFile));
    const targetNodeId = fileNodeIds.get(targetFile);
    if (
      sourceNodeId &&
      targetNodeId &&
      architectureEdges.length < MAX_ARCHITECTURE_EDGES
    ) {
      architectureEdges.push({
        schemaVersion: "1",
        workspaceId: input.workspaceId,
        sourceNodeId,
        targetNodeId,
        relation: "depends_on",
      });
    }
  }

  for (const route of apiRoutes) {
    const sourceNodeId = fileNodeIds.get(String(route.relativePath));
    if (!sourceNodeId) continue;
    const targetNodeId = metadataFingerprint([
      "architecture:route",
      route.relativePath,
      route.httpMethod,
      route.routePath,
    ]);
    architectureNodes.push({
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      nodeId: targetNodeId,
      kind: "route",
      label: `${route.httpMethod} ${route.routePath}`,
      relativePath: route.relativePath,
      metadata: { authRequired: route.authRequired },
    });
    architectureEdges.push({
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      sourceNodeId,
      targetNodeId,
      relation: "exposes",
    });
  }

  for (const reference of references) {
    const targetSymbolId = symbolByName.get(String(reference.name));
    if (targetSymbolId) reference.targetSymbolId = targetSymbolId;
  }
  for (const relation of relations) {
    const targetSymbolId = symbolByName.get(String(relation.targetName));
    if (targetSymbolId) relation.targetSymbolId = targetSymbolId;
  }

  const importCounts = new Map<string, number>();
  for (const dependency of dependencies) {
    const target = dependency.targetFile ?? dependency.targetModule;
    importCounts.set(target, (importCounts.get(target) ?? 0) + 1);
  }
  const mostImported = [...importCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 25)
    .map(([module, count]) => ({ module, count }));
  const cycles = findCycles(
    dependencies.map((dependency) => ({
      sourceFile: String(dependency.sourceFile),
      targetFile: dependency.targetFile,
    })),
  );
  const symbolCountsByFile = new Map<string, number>();
  const referenceCountsByFile = new Map<string, number>();
  for (const symbol of symbols)
    symbolCountsByFile.set(
      String(symbol.relativePath),
      (symbolCountsByFile.get(String(symbol.relativePath)) ?? 0) + 1,
    );
  for (const reference of references) {
    const relativePath = String(
      (reference.location as { relativePath: string }).relativePath,
    );
    referenceCountsByFile.set(
      relativePath,
      (referenceCountsByFile.get(relativePath) ?? 0) + 1,
    );
  }
  const hotspots = [...symbolCountsByFile.entries()]
    .map(([relativePath, symbolCount]) => ({
      relativePath,
      symbolCount,
      referenceCount: referenceCountsByFile.get(relativePath) ?? 0,
      score: symbolCount + (referenceCountsByFile.get(relativePath) ?? 0),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 25);
  const referencedNames = new Set(
    references.map((reference) => String(reference.name)),
  );
  const deadCodeCandidates = symbols
    .filter(
      (symbol) => Boolean(symbol.exported) && !referencedNames.has(String(symbol.name)),
    )
    .slice(0, 50)
    .map((symbol) => ({
      name: symbol.name,
      kind: symbol.kind,
      relativePath: symbol.relativePath,
      line: symbol.line,
    }));
  const sharedUtilities = architectureNodes
    .filter((node) => node.kind === "utility" || node.kind === "shared")
    .slice(0, 50)
    .map((node) => ({ relativePath: node.relativePath, kind: node.kind }));
  const largeComponents = symbols
    .filter((symbol) => symbol.kind === "component")
    .map((symbol) => ({
      name: symbol.name,
      relativePath: symbol.relativePath,
      line: symbol.line,
      fileSymbols: symbolCountsByFile.get(String(symbol.relativePath)) ?? 0,
    }))
    .sort((left, right) => right.fileSymbols - left.fileSymbols)
    .slice(0, 25);
  const insights = [
    {
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      insightType: "most_imported_modules",
      title: "Most imported modules",
      severity: "info",
      data: { modules: mostImported },
    },
    {
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      insightType: "circular_dependencies",
      title: "Circular dependency candidates",
      severity: cycles.length > 0 ? "warning" : "info",
      data: { cycles },
    },
    {
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      insightType: "architecture_hotspots",
      title: "Architecture hotspots",
      severity: "info",
      data: { files: hotspots },
    },
    {
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      insightType: "large_components",
      title: "Large React component candidates",
      severity: "info",
      data: { components: largeComponents },
    },
    {
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      insightType: "dead_code_candidates",
      title: "Unused export candidates",
      severity: deadCodeCandidates.length > 0 ? "warning" : "info",
      data: { symbols: deadCodeCandidates },
    },
    {
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      insightType: "shared_utilities",
      title: "Shared utilities and modules",
      severity: "info",
      data: { modules: sharedUtilities },
    },
  ];

  return {
    symbols,
    imports,
    exports,
    dependencies,
    references,
    relations,
    apiRoutes,
    databaseModels,
    architectureNodes,
    architectureEdges,
    insights,
  };
};

export const scanRepositoryMetadata = async (input: {
  workspaceId: string;
  rootPath: string;
  blockedPatterns: string[];
  maxEntries: number;
  signal?: AbortSignal;
}) => {
  const workspace = await resolveWorkspace(input.rootPath);
  const ignoreRules = new Set(DEFAULT_IGNORES);
  const gitignore = await readFile(
    path.join(workspace.canonicalRoot, ".gitignore"),
    "utf8",
  )
    .then(parseIgnoreLines)
    .catch(() => []);
  for (const rule of gitignore) ignoreRules.add(rule);

  const files: Array<Record<string, unknown>> = [];
  const directories: Array<Record<string, unknown>> = [];
  const extensionStats: Record<string, number> = {};
  const languageSummary: Record<string, number> = {};
  const classificationSummary = {
    source: 0,
    test: 0,
    configuration: 0,
    documentation: 0,
    asset: 0,
    generated: 0,
    build_output: 0,
    unknown: 0,
  };
  let totalBytes = 0;
  let truncated = false;
  const directoryTotals = new Map<
    string,
    {
      fileCount: number;
      directoryCount: number;
      totalBytes: number;
      languages: Record<string, number>;
    }
  >();
  const ensureDirectory = (relativePath: string) => {
    if (!directoryTotals.has(relativePath)) {
      directoryTotals.set(relativePath, {
        fileCount: 0,
        directoryCount: 0,
        totalBytes: 0,
        languages: {},
      });
    }
    return directoryTotals.get(relativePath)!;
  };
  ensureDirectory("");

  const queue = [""];
  while (queue.length > 0) {
    if (input.signal?.aborted)
      throw new CapabilityError("CAPABILITY_CANCELLED", "Repository scan cancelled.");
    const relativeDirectory = queue.shift()!;
    const absoluteDirectory = path.join(workspace.canonicalRoot, relativeDirectory);
    const entries = (await readdir(absoluteDirectory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      if (files.length + directories.length >= input.maxEntries) {
        truncated = true;
        break;
      }
      const relativePath = path
        .join(relativeDirectory, entry.name)
        .replaceAll(path.sep, "/");
      if (
        shouldIgnore(relativePath, entry.name, ignoreRules) ||
        matchesBlockedPattern(relativePath, input.blockedPatterns)
      )
        continue;
      const info = await lstat(path.join(workspace.canonicalRoot, relativePath));
      if (info.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        ensureDirectory(relativePath);
        ensureDirectory(relativeDirectory).directoryCount += 1;
        directories.push({
          schemaVersion: "1",
          workspaceId: input.workspaceId,
          relativePath,
          parentDirectory: relativeDirectory || null,
          name: entry.name,
          fileCount: 0,
          directoryCount: 0,
          totalBytes: 0,
          languageSummary: {},
        });
        queue.push(relativePath);
      } else if (entry.isFile()) {
        const extension = path.extname(entry.name).replace(/^\./, "").toLowerCase();
        const language = languageFor(entry.name, extension);
        const classification = classify(relativePath, entry.name, extension);
        const parentDirectory = relativeDirectory;
        const record = {
          schemaVersion: "1",
          workspaceId: input.workspaceId,
          relativePath,
          parentDirectory,
          fileName: entry.name,
          extension,
          language,
          sizeBytes: info.size,
          modifiedAt: info.mtime.toISOString(),
          classification,
          metadataFingerprint: metadataFingerprint({
            relativePath,
            sizeBytes: info.size,
            modifiedAt: info.mtime.toISOString(),
            language,
            classification,
          }),
        };
        files.push(record);
        totalBytes += info.size;
        increment(extensionStats, extension || "(none)");
        increment(languageSummary, language);
        classificationSummary[classification] += 1;
        const total = ensureDirectory(parentDirectory);
        total.fileCount += 1;
        total.totalBytes += info.size;
        increment(total.languages, language);
      }
    }
    if (truncated) break;
  }

  const largestFiles = [...files]
    .sort((left, right) => Number(right.sizeBytes) - Number(left.sizeBytes))
    .slice(0, 25)
    .map((file) => ({
      relativePath: String(file.relativePath),
      sizeBytes: Number(file.sizeBytes),
    }));
  const fileNames = new Set(files.map((file) => String(file.fileName).toLowerCase()));
  const detected = new Set<string>();
  const packageManagers = new Set<string>();
  const frameworks = new Set<string>();
  const databases = new Set<string>();
  if (fileNames.has("package.json")) detected.add("Node.js");
  if (fileNames.has("pnpm-lock.yaml")) packageManagers.add("pnpm");
  if (fileNames.has("package-lock.json")) packageManagers.add("npm");
  if (fileNames.has("yarn.lock")) packageManagers.add("Yarn");
  if ([...files].some((file) => String(file.relativePath).endsWith(".tsx")))
    frameworks.add("React");
  if ([...fileNames].some((name) => name.startsWith("vite.config")))
    frameworks.add("Vite");
  if ([...fileNames].some((name) => name.startsWith("next.config")))
    frameworks.add("Next.js");
  if ([...fileNames].some((name) => name.startsWith("electron")))
    frameworks.add("Electron");
  if ([...files].some((file) => file.language === "Python")) detected.add("Python");
  if (fileNames.has("dockerfile")) detected.add("Docker");
  if ([...files].some((file) => String(file.relativePath).includes("migrations/")))
    databases.add("PostgreSQL");
  if ([...files].some((file) => String(file.relativePath).includes("prisma/")))
    databases.add("Prisma");
  detected.add("Git");

  const scannedAt = new Date().toISOString();
  const rootFingerprint = metadataFingerprint({
    workspaceId: input.workspaceId,
    files: files.map((file) => file.metadataFingerprint).sort(),
    ignoreVersion: "phase-4.1-default-v1",
  });
  const directoryRecords = [
    {
      schemaVersion: "1",
      workspaceId: input.workspaceId,
      relativePath: "",
      parentDirectory: null,
      name: ".",
      fileCount: ensureDirectory("").fileCount,
      directoryCount: ensureDirectory("").directoryCount,
      totalBytes: ensureDirectory("").totalBytes,
      languageSummary: ensureDirectory("").languages,
    },
    ...directories.map((directory) => {
      const totals = ensureDirectory(String(directory.relativePath));
      return {
        ...directory,
        fileCount: totals.fileCount,
        directoryCount: totals.directoryCount,
        totalBytes: totals.totalBytes,
        languageSummary: totals.languages,
      };
    }),
  ];
  const semanticIndex = await buildSemanticIndex({
    workspaceId: input.workspaceId,
    rootPath: workspace.canonicalRoot,
    files,
  });

  return RepositoryScanResultSchema.parse({
    schemaVersion: "1",
    workspaceId: input.workspaceId,
    rootFingerprint,
    scannedAt,
    ignoreVersion: "phase-4.1-default-v1",
    files,
    directories: directoryRecords,
    statistics: {
      fileCount: files.length,
      directoryCount: directoryRecords.length,
      totalBytes,
      largestFiles,
      extensionStats,
      languageSummary,
      classificationSummary,
    },
    technologySummary: {
      detected: [...detected].sort(),
      packageManagers: [...packageManagers].sort(),
      frameworks: [...frameworks].sort(),
      databases: [...databases].sort(),
      languages: Object.keys(languageSummary).sort(),
    },
    semanticIndex,
    truncated,
  });
};
