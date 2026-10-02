import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { API } from "typescript/unstable/sync";
import * as ast from "typescript/unstable/ast/is";

const DEFAULT_ROOT = resolve(import.meta.dirname, "..");
const OUTPUT = "docs/product/frontend-operation-inventory";
const NATIVE = new Set(["button", "a", "input", "select", "textarea", "form", "summary", "details", "option"]);
const CONTROL = /(?:Button|Input|Select|Textarea|Checkbox|Switch|TabsTrigger|MenuItem|MenuTrigger|PaginationLink|PaginationPrevious|PaginationNext)$/u;
const OVERLAY = /(?:Dialog|Sheet|DropdownMenu|ConfirmAction|Confirmation)$/u;
const STATE_KEYS = new Set(["open", "disabled", "hidden", "readOnly", "aria-disabled", "aria-hidden", "aria-busy", "aria-expanded"]);
const eventKey = key => /^on[A-Z]/u.test(key);
const text = (node, source) => node?.getText(source) ?? "";
const walk = (node, visit) => { visit(node); node.forEachChild(child => walk(child, visit)); };

function props(node, source) {
  const attributes = {}, spreads = [];
  for (const prop of node.attributes.properties) {
    if (ast.isJsxSpreadAttribute(prop)) spreads.push(text(prop.expression, source));
    else if (ast.isJsxAttribute(prop)) {
      const init = prop.initializer;
      attributes[text(prop.name, source)] = !init ? "true" : ast.isJsxExpression(init) ? text(init.expression, source) : text(init, source);
    }
  }
  return { attributes, spreads };
}

function ownerOf(node, source) {
  let owner = "<module>", boundary = source;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ast.isFunctionDeclaration(parent) && parent.name) {
      owner = text(parent.name, source); boundary = parent;
    } else if (ast.isVariableDeclaration(parent) && parent.initializer && parent.initializer.pos <= node.pos && parent.initializer.end >= node.end) {
      // Only top-level variable owners; an event callback's local const is not a page owner.
      if (parent.parent?.parent?.parent === source) { owner = text(parent.name, source); boundary = parent; }
    }
  }
  return { owner, boundary };
}

function contextOf(node, source, boundary) {
  const context = [];
  let child = node;
  for (let parent = node.parent; parent && parent !== boundary; child = parent, parent = parent.parent) {
    if (ast.isConditionalExpression(parent)) {
      if (child === parent.whenTrue || child === parent.whenFalse) context.push({kind:"branch", expression:text(parent.condition,source), branch:child === parent.whenTrue ? "true" : "false"});
    } else if (ast.isBinaryExpression(parent) && child === parent.right) {
      const operator = text(parent.operatorToken,source);
      if (["&&","||","??"].includes(operator)) context.push({kind:"logical", expression:text(parent.left,source), operator});
    } else if (ast.isIfStatement(parent)) {
      if (child === parent.thenStatement || child === parent.elseStatement) context.push({kind:"branch", expression:text(parent.expression,source), branch:child === parent.thenStatement ? "true" : "false"});
    } else if (ast.isCallExpression(parent) && /\.(?:map|flatMap)$/u.test(text(parent.expression,source))) {
      context.push({kind:"repeat",expression:text(parent.expression,source).replace(/\.(?:map|flatMap)$/u,"")});
    } else if (ast.isJsxElement(parent) && child !== parent.openingElement) {
      const opening = parent.openingElement;
      const tag = text(opening.tagName,source);
      const attributes = Object.fromEntries(Object.entries(props(opening,source).attributes).filter(([key]) => STATE_KEYS.has(key)));
      if (Object.keys(attributes).length || OVERLAY.test(tag) || tag === "form") context.push({kind:"container",tag,attributes});
    }
  }
  return context.reverse();
}

function earlyReturnsOf(node, boundary, source) {
  const guards = [];
  // Deliberately report guard source, not an inferred reachability proof.
  // Only enclosing statement lists: do not attribute another callback's guards.
  for (let parent = node.parent; parent && parent !== boundary.parent; parent = parent.parent) {
    for (const statement of parent.statements ?? []) {
      if (!ast.isIfStatement(statement) || statement.end > node.pos) continue;
      const branch = statement.thenStatement;
      const terminal = ast.isReturnStatement(branch) || (ast.isBlock(branch) && branch.statements.some(ast.isReturnStatement));
      if (terminal) guards.push({condition:text(statement.expression,source),source:text(statement,source)});
    }
  }
  return guards;
}

function labelsOf(node, source) {
  const element = node.parent;
  if (!ast.isJsxElement(element) || element.openingElement !== node) return [];
  return element.children.flatMap(child => {
    if (ast.isJsxText(child)) { const label = text(child,source).trim(); return label ? [label] : []; }
    if (ast.isJsxExpression(child) && child.expression) {
      let nestedJsx = false;
      walk(child.expression, n => { if (ast.isJsxElement(n) || ast.isJsxSelfClosingElement(n)) nestedJsx = true; });
      return nestedJsx ? [] : [text(child.expression,source)];
    }
    return [];
  });
}

// Conservative symbol-reference graph: route candidates, NOT runtime visibility.
// Shadowed identifiers can over-approximate; spreads and dynamic renderers remain
// explicit review boundaries. Never use this graph as authorization evidence.
function symbolIndex(sources, repositoryRoot) {
  const index = new Map();
  for (const [path, source] of sources) {
    const imports = new Map();
    for (const statement of source.statements) {
      if (!ast.isImportDeclaration(statement) || statement.importClause?.isTypeOnly || !ast.isStringLiteral(statement.moduleSpecifier)) continue;
      const specifier = statement.moduleSpecifier.text;
      if (!specifier.startsWith(".")) continue;
      const base = resolve(repositoryRoot,dirname(path),specifier);
      const imported = [base,`${base}.ts`,`${base}.tsx`,resolve(base,"index.ts"),resolve(base,"index.tsx")]
        .find(candidate => sources.has(relative(repositoryRoot,candidate).replaceAll("\\","/")));
      if (!imported) continue;
      const target = relative(repositoryRoot,imported).replaceAll("\\","/");
      const clause = statement.importClause;
      for (const binding of clause?.namedBindings?.elements ?? []) {
        if (!binding.isTypeOnly) imports.set(text(binding.name,source),`${target}#${text(binding.propertyName ?? binding.name,source)}`);
      }
      if (clause?.name) imports.set(text(clause.name,source),`${target}#default`);
      if (clause?.namedBindings?.name) imports.set(text(clause.namedBindings.name,source),`${target}#*`);
    }
    const definitions = [];
    for (const statement of source.statements) {
      if ((ast.isFunctionDeclaration(statement) || ast.isClassDeclaration(statement)) && statement.name) definitions.push([text(statement.name,source),statement]);
      if (ast.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        if (ast.isIdentifier(declaration.name) && declaration.initializer) definitions.push([text(declaration.name,source),declaration.initializer]);
      }
    }
    const local = new Set(definitions.map(([name])=>name));
    for (const [name,node] of definitions) {
      const refs = new Set();
      walk(node,n=>{
        if (!ast.isIdentifier(n)) return;
        const symbol = text(n,source);
        if (local.has(symbol) && symbol !== name) refs.add(`${path}#${symbol}`);
        else if (imports.has(symbol)) refs.add(imports.get(symbol));
      });
      index.set(`${path}#${name}`,[...refs].sort());
      if (ast.isFunctionDeclaration(node) && node.modifiers?.some(modifier=>text(modifier,source)==="default")) index.set(`${path}#default`,[`${path}#${name}`]);
    }
  }
  return index;
}

function literalRecords(source, name) {
  let array;
  walk(source,node=>{
    if (!ast.isVariableDeclaration(node) || text(node.name,source)!==name || !node.initializer) return;
    // Locate the outer declared array, not a nested field's array.
    const descend = n=>{ if (ast.isArrayLiteralExpression(n)) { array ??= n; return; } n.forEachChild(descend); };
    descend(node.initializer);
  });
  assert.ok(array,`missing literal array ${name}`);
  return array.elements.map(element=>{
    assert.ok(ast.isObjectLiteralExpression(element),`nonliteral ${name} entry`);
    return Object.fromEntries(element.properties.flatMap(prop=> ast.isPropertyAssignment(prop) && ast.isStringLiteral(prop.initializer) ? [[text(prop.name,source),prop.initializer.text]] : []));
  });
}

function routeCandidates(manifest, sources, operations, repositoryRoot) {
  const index = symbolIndex(sources,repositoryRoot);
  const definitions = [...index.keys()];
  const roots = manifest ? literalRecords(manifest,"WORKBENCH_OPERATION_ROOTS") : [];
  const capabilities = manifest ? literalRecords(manifest,"WORKBENCH_MATURITY_CAPABILITIES") : [];
  const attach = (id,pathname,operationRoots) => {
    const seen = new Set(), unresolvedSymbols = new Set(), pending = operationRoots.map(root=>`${root.path}#${root.symbol}`);
    while (pending.length) {
      const key = pending.pop();
      if (seen.has(key)) continue;
      seen.add(key);
      if (key.endsWith("#*")) { pending.push(...definitions.filter(name=>name.startsWith(key.slice(0,-1)))); continue; }
      if (!index.has(key)) { unresolvedSymbols.add(key); continue; }
      pending.push(...index.get(key));
    }
    return {id,pathname,operationRoots,candidateOperationIds:operations.filter(op=>seen.has(`${op.path}#${op.owner}`)).map(op=>op.id),unresolvedSymbols:[...unresolvedSymbols].sort()};
  };
  const routes = capabilities.map(cap=>{
    const owned = roots.filter(root=>root.capabilityId===cap.id);
    assert.ok(owned.length,`missing operation roots for ${cap.id}`);
    return {...attach(cap.id,cap.pathname,owned), ...(cap.routePattern ? {routePattern:cap.routePattern} : {})};
  });
  // These are global/public surfaces rather than additional authenticated routes.
  const shared = [
    ["shell","<authenticated-shell>","frontend/components/shell/app-shell.tsx","AppShell"],
    ["public","<anonymous-home>","frontend/pages/workbench-landing/public-workbench-page.tsx","PublicWorkbenchPage"],
    ["login","<login>","frontend/pages/login-page.tsx","LoginPage"],
  ].filter(([, ,path,symbol])=>index.has(`${path}#${symbol}`)).map(([id,pathname,path,symbol])=>attach(id,pathname,[{path,symbol}]));
  const assigned = new Set([...routes,...shared].flatMap(route=>route.candidateOperationIds));
  return {routes,sharedSurfaces:shared,unassignedOperationIds:operations.filter(op=>!assigned.has(op.id)).map(op=>op.id)};
}

export function collectFrontendOperations({repositoryRoot = DEFAULT_ROOT} = {}) {
  const frontend = resolve(repositoryRoot,"frontend");
  const files = readdirSync(frontend,{recursive:true,withFileTypes:true})
    .filter(entry => entry.isFile() && /\.(?:[cm]?[jt]sx?)$/u.test(entry.name) && !/\.d\.[cm]?ts$/u.test(entry.name))
    .map(entry => relative(repositoryRoot,resolve(entry.parentPath,entry.name)).replaceAll("\\","/"))
    .filter(path => !path.startsWith("frontend/dist/"))
    .sort();
  assert.ok(files.length,"frontend source inventory must not be empty");
  const api = new API({cwd:repositoryRoot});
  let snapshot;
  try {
    const manifestPath = resolve(repositoryRoot,"shared/workbench-maturity-capabilities.ts");
    const openFiles = files.map(path => resolve(repositoryRoot,path));
    if (existsSync(manifestPath)) openFiles.push(manifestPath);
    snapshot = api.updateSnapshot({openFiles});
    const sources = new Map();
    const operations = [];
    for (const path of files) {
      const absolute = resolve(repositoryRoot,path);
      const project = snapshot.getDefaultProjectForFile(absolute);
      const source = project?.program.getSourceFile(absolute);
      assert.ok(source,`cannot parse ${path}`);
      assert.equal(project.program.getSyntacticDiagnostics(absolute).length,0,`syntax error: ${path}`);
      sources.set(path,source);
      walk(source,node => {
        let details;
        if (ast.isJsxOpeningElement(node) || ast.isJsxSelfClosingElement(node)) {
          const tag = text(node.tagName,source);
          const {attributes,spreads} = props(node,source);
          const handlers = Object.fromEntries(Object.entries(attributes).filter(([key]) => eventKey(key)));
          if (!(NATIVE.has(tag) || CONTROL.test(tag) || OVERLAY.test(tag) || Object.keys(handlers).length || spreads.length || attributes.href || Object.hasOwn(attributes,"role") || attributes.tabIndex)) return;
          details = {kind:"jsx",tag,attributes,handlers,spreads,labels:labelsOf(node,source)};
        } else if (ast.isCallExpression(node) && /\.(?:addEventListener|addListener|on)$/u.test(text(node.expression,source))) {
          details = {kind:"listener",tag:text(node.expression,source),event:text(node.arguments[0],source),arguments:node.arguments.map(arg => text(arg,source)),attributes:{},handlers:{},spreads:[],labels:[]};
        } else return;
        const {owner,boundary} = ownerOf(node,source);
        const location = source.getLineAndCharacterOfPosition(node.getStart(source));
        operations.push({id:`${path}:${location.line+1}:${location.character+1}`,path,owner,line:location.line+1,column:location.character+1,...details,context:contextOf(node,source,boundary),earlyReturns:earlyReturnsOf(node,boundary,source)});
      });
    }
    let manifest;
    if (existsSync(manifestPath)) {
      const project = snapshot.getDefaultProjectForFile(manifestPath);
      manifest = project?.program.getSourceFile(manifestPath);
      assert.ok(manifest,"cannot parse maturity manifest");
      assert.equal(project.program.getSyntacticDiagnostics(manifestPath).length,0,"syntax error: maturity manifest");
    }
    return {schemaVersion:1,scope:"source-census-not-runtime-acceptance",files,...routeCandidates(manifest,sources,operations,repositoryRoot),operations};
  } finally { snapshot?.dispose(); api.close(); }
}

const cell = value => String(value).replace(/\s+/gu," ").replaceAll("|","&#124;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("`","&#96;");
const preview = value => { const full = cell(value); return full.length > 160 ? `${full.slice(0,157)}…` : full; };
export function renderOperationInventory(inventory) {
  const lines = ["# 前端可见操作源码索引（A01）","",
    "此索引是源码清点，不是可见性证明、权限证明或原生浏览器验收；不能据此关闭 A01/A02/A05 父项。",
    "",
    "生成器枚举全部第一方 frontend TS/TSX/JS/MJS 中的 JSX 控件、事件回调、导航/表单、role 语义边界、转发 spread 和命令式监听器。包含未接线组件，不能把出现次数当作用户可见功能数。",
    "JSON 保留完整属性、handler、条件分支/重复模板、弹层祖先和前置 return 守卫；下表仅作摘要（长表达式截断），逐项核对以相邻 frontend-operation-inventory.json 和源码锚点为准。",
    "自定义组件回调可能是状态通知而非用户操作；spread、动态菜单数据、跨组件条件传播、门户/第三方控件、createElement/innerHTML 动态生成的控件及 CSS 可见性需人工展开。未求值条件，不承诺列出所有运行时状态组合。",
    "运行 `npm run audit:frontend-operations` 验证无漂移；只有有意更新证据才运行 `npm run inventory:frontend-operations`。","",
    `源码文件：${inventory.files.length}；操作/转发候选：${inventory.operations.length}。无候选文件也逐一列出，防止静默遗漏扫描范围。`,"",
    "| 源文件 | 候选数 |","| --- | ---: |",
    ...inventory.files.map(path => `| ${path} | ${inventory.operations.filter(op=>op.path===path).length} |`), "",
  ];
  lines.push("## 路由与共享入口候选映射", "", "以下来自现有成熟度清单的明确 root symbol，再按本地符号引用及相对 import 传递展开；不是把 app.tsx 的所有按钮归给每条路由。候选可过度近似（如局部变量同名）；跨模块动态渲染、默认/re-export 等未解析符号单独列出，不能声称无遗漏。JSON 保存每个入口对应的精确候选 ID。", "", "| 路由/入口 | root symbol | 候选数 | 未解析符号 |", "| --- | --- | ---: | --- |");
  for (const route of [...inventory.routes,...inventory.sharedSurfaces]) lines.push(`| ${cell(route.pathname)} | ${route.operationRoots.map(root=>cell(`${root.path}#${root.symbol}`)).join("; ")} | ${route.candidateOperationIds.length} | ${route.unresolvedSymbols.map(cell).join("; ") || "无（不代表动态边界已核对）"} |`);
  lines.push("", `尚未归入上述入口的候选：${inventory.unassignedOperationIds.length}。这些可能是 App 全局守卫、未接线组件或静态图盲区，必须核对，不能删掉以提高覆盖率。`, "");
  for (const path of inventory.files) {
    const ops = inventory.operations.filter(op => op.path === path);
    if (!ops.length) continue;
    lines.push(`## ${path}`,"","| 位置 / 所有者 | 控件 / 事件 / 标签 | handler 或导航 | 状态 / 二级操作上下文 |","| --- | --- | --- | --- |");
    for (const op of ops) {
      const handlers = op.kind === "listener" ? op.arguments.join(", ") : Object.entries({...op.handlers,...Object.fromEntries(Object.entries(op.attributes).filter(([key])=>["href","type","action","formAction"].includes(key)))}).map(([k,v])=>`${k}=${v}`).join("; ");
      const state = [Object.entries(op.attributes).filter(([key])=>STATE_KEYS.has(key)).map(([k,v])=>`${k}=${v}`).join("; "),...op.context.map(c=>JSON.stringify(c)),...op.earlyReturns.map(c=>`earlier return: ${c.condition}`),...op.spreads.map(s=>`spread: ${s}`)].filter(Boolean).join("; ");
      lines.push(`| ${op.line}:${op.column} ${cell(op.owner)} | ${cell(op.tag)} ${preview(op.labels.join(" / "))} | ${preview(handlers)} | ${preview(state)} |`);
    }
    lines.push("");
  }
  return lines.join("\n")+"\n";
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 1 && ["--write","--check"].includes(args[0]),"use --write or --check");
  const result = collectFrontendOperations();
  for (const [extension,contents] of [["json",JSON.stringify(result,null,2)+"\n"],["md",renderOperationInventory(result)]]) {
    const path = resolve(DEFAULT_ROOT,`${OUTPUT}.${extension}`);
    if (args[0] === "--write") writeFileSync(path,contents);
    else assert.equal(readFileSync(path,"utf8"),contents,`stale operation inventory: ${path}; regenerate deliberately`);
  }
  console.log(`${args[0]}: ${result.files.length} source files, ${result.operations.length} source operation candidates; not runtime acceptance`);
}
