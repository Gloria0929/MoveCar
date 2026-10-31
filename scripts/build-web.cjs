/**
 * 轻量前端构建：@vue/compiler-sfc 编译 SFC + esbuild 打包。
 * 相比 Vite 依赖更少，也不依赖 Node 的 HTTP 栈，任何环境下都能稳定产出 dist。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const { parse, compileScript, compileTemplate, compileStyle } = require('@vue/compiler-sfc');
const { NodeTypes } = require('@vue/compiler-core');

const root = path.resolve(__dirname, '..');
const webDir = path.join(root, 'web');
const srcDir = path.join(webDir, 'src');
const outDir = path.join(webDir, 'dist');

/** 收集所有 SFC 的样式，最后统一输出 */
const styleChunks = [];

/**
 * Vue 3.5 的编译器不再自动给元素注入 data-v-xxx，
 * 这里用 AST 转换补上，保证 scoped 样式可以命中子元素。
 */
function makeScopeTransform(scopeId) {
  const SKIP = new Set(['template', 'slot', 'Teleport', 'Suspense', 'KeepAlive']);
  return (node) => {
    if (node.type !== NodeTypes.ELEMENT) return;
    if (SKIP.has(node.tag)) return;
    if (node.props.some((p) => p.type === NodeTypes.ATTRIBUTE && p.name === scopeId)) return;
    node.props.push({
      type: NodeTypes.ATTRIBUTE,
      name: scopeId,
      nameLoc: node.loc,
      value: { type: NodeTypes.TEXT, content: '', loc: node.loc },
      loc: node.loc,
    });
  };
}

function compileVue(source, filename) {
  const rel = path.relative(srcDir, filename).split(path.sep).join('/');
  const hash = crypto.createHash('sha256').update(rel).digest('hex').slice(0, 8);
  const scopeId = `data-v-${hash}`;

  const { descriptor, errors } = parse(source, { filename, sourceMap: false });
  if (errors.length) {
    throw new Error(`[${rel}] ${errors.map((e) => e.message).join('; ')}`);
  }

  const hasScoped = descriptor.styles.some((s) => s.scoped);

  // 1) script setup
  const script = compileScript(descriptor, {
    id: hash,
    genDefaultAs: '__sfc__',
    sourceMap: false,
  });

  let code = script.content;

  // 2) template
  if (descriptor.template) {
    const tpl = compileTemplate({
      source: descriptor.template.content,
      filename,
      id: hash,
      scoped: hasScoped,
      isProd: true,
      compilerOptions: {
        bindingMetadata: script.bindings,
        nodeTransforms: hasScoped ? [makeScopeTransform(scopeId)] : [],
      },
    });
    if (tpl.errors.length) {
      throw new Error(`[${rel}] 模板编译失败：${tpl.errors.map((e) => e.message || e).join('; ')}`);
    }
    // compileTemplate 产出 `export function render`，改为内部函数再挂到组件上
    code += `\n${tpl.code.replace('export function render', 'function render')}`;
    code += '\n__sfc__.render = render;';
  }

  if (hasScoped) code += `\n__sfc__.__scopeId = ${JSON.stringify(scopeId)};`;
  code += '\nexport default __sfc__;\n';

  // 3) styles
  for (const style of descriptor.styles) {
    const res = compileStyle({
      source: style.content,
      filename,
      id: scopeId,
      scoped: !!style.scoped,
      isProd: true,
    });
    if (res.errors.length) {
      throw new Error(`[${rel}] 样式编译失败：${res.errors.map((e) => e.message).join('; ')}`);
    }
    styleChunks.push(`/* ${rel} */\n${res.code}`);
  }

  return { code, rel };
}

const vuePlugin = {
  name: 'vue-sfc',
  setup(build) {
    build.onResolve({ filter: /\.vue$/ }, (args) => ({
      path: path.resolve(args.resolveDir, args.path),
      namespace: 'vue-sfc',
    }));

    build.onLoad({ filter: /.*/, namespace: 'vue-sfc' }, (args) => {
      const source = fs.readFileSync(args.path, 'utf8');
      const { code } = compileVue(source, args.path);
      return { contents: code, loader: 'js', resolveDir: path.dirname(args.path) };
    });
  },
};

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230E9F8E'/%3E%3Cg fill='%23fff'%3E%3Crect x='6' y='6' width='7' height='7' rx='1.5'/%3E%3Crect x='19' y='6' width='7' height='7' rx='1.5'/%3E%3Crect x='6' y='19' width='7' height='7' rx='1.5'/%3E%3Crect x='19' y='19' width='3' height='3' rx='0.8'/%3E%3Crect x='23' y='23' width='3' height='3' rx='0.8'/%3E%3C/g%3E%3C/svg%3E";

async function build() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });

  const result = await esbuild.build({
    entryPoints: [path.join(srcDir, 'main.js')],
    bundle: true,
    outdir: path.join(outDir, 'assets'),
    entryNames: 'index-[hash]',
    assetNames: '[name]-[hash]',
    format: 'esm',
    target: ['es2020'],
    minify: true,
    metafile: true,
    logLevel: 'warning',
    plugins: [vuePlugin],
    define: {
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
  });

  const outputs = Object.keys(result.metafile.outputs);
  const jsFile = outputs.find((f) => f.endsWith('.js'));
  const cssFile = outputs.find((f) => f.endsWith('.css'));

  if (!jsFile) throw new Error('未生成 JS 产物');

  // 把 SFC 样式追加到 esbuild 产出的 CSS 末尾
  if (cssFile) {
    fs.appendFileSync(cssFile, `\n${styleChunks.join('\n')}\n`);
  } else if (styleChunks.length) {
    fs.writeFileSync(path.join(outDir, 'assets', 'index.css'), styleChunks.join('\n'));
  }

  const jsPath = path.relative(outDir, jsFile).split(path.sep).join('/');
  const cssPath = cssFile
    ? path.relative(outDir, cssFile).split(path.sep).join('/')
    : styleChunks.length
      ? 'assets/index.css'
      : '';

  // 资源加版本号，避免 CSS 同名但内容更新时被浏览器缓存
  const version = Date.now().toString(36);

  const html = fs.readFileSync(path.join(webDir, 'index.html'), 'utf8');
  const injected = html
    .replace(/<script type="module"[^>]*><\/script>\s*/g, '')
    .replace(
      '</head>',
      `  <link rel="icon" href="${FAVICON}" />\n` +
        (cssPath ? `    <link rel="stylesheet" href="/${cssPath}?v=${version}" />\n` : '') +
        '  </head>',
    )
    .replace('</body>', `    <script type="module" src="/${jsPath}?v=${version}"></script>\n  </body>`);

  fs.writeFileSync(path.join(outDir, 'index.html'), injected);

  const kb = (fs.statSync(jsFile).size / 1024).toFixed(1);
  const cssKb = cssFile ? (fs.statSync(cssFile).size / 1024).toFixed(1) : '0';
  console.log(`构建完成：${jsPath} (${kb} KB) + ${cssPath || '无 CSS'} (${cssKb} KB)`);
}

build().catch((err) => {
  console.error('构建失败：', err.message);
  process.exitCode = 1;
});
