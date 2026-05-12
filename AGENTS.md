# AGENTS.md

本文件是 `kabu` 仓库的项目级协作指令，适用于整个仓库。

## 1. 项目定位

- `kabu` 是一个 TypeScript / Node.js CLI，用于从 OpenAPI 3.x 文档生成 axios 风格的 TypeScript service 函数。
- 这是单包仓库，不是 monorepo；核心代码位于 `src/gen`，CLI 入口位于 `src/bin/kabu.ts`，命令注册位于 `src/commands/gen.ts`。
- `docs/strategy.md` 和 `docs/examples.md` 是生成规则说明；`example/` 是可复现的模拟输入和生成输出，属于行为契约的一部分。
- 当前包管理器为 `pnpm@10.18.1`，Node 版本要求为 `>=18`。
- TypeScript 使用 ESM / `NodeNext`，源码中的相对导入需要保留 `.js` 后缀，例如 `../gen/index.js`。

## 2. 开始工作前

- 先执行并查看 `git status --short --branch`，确认当前分支和未提交改动。
- 先阅读与任务直接相关的文件，再修改代码。涉及生成规则时，至少查看：
  - `src/gen/render-ts.ts`
  - `src/gen/openapi.ts`
  - `src/gen/generate-services.ts`
  - `src/gen/rewrite-rules.ts`
  - `docs/strategy.md`
  - `docs/examples.md`
  - `example/README.md`
- 不覆盖、不回退、不清理用户已有改动。
- 不主动修改 `dist/`、`node_modules/` 等生成或依赖目录。

## 3. 常用命令

在仓库根目录执行：

```bash
pnpm install
pnpm build
pnpm check
pnpm dev --help
```

完整 example 生成验证：

```bash
pnpm build
node ./dist/src/bin/kabu.js gen ./example/openapi \
  --output-dir ./example/services \
  --request-import '../request' \
  --rewrite-prefix /product=/api/product
```

说明：

- `pnpm build` 执行 `tsc`，并通过 `postbuild` 给 CLI 产物增加可执行权限。
- `pnpm check` 执行主项目 `tsc --noEmit` 和 `tsconfig.example.json` 的 example 类型检查。
- 仓库当前没有 lint/test 脚本；不要声称已运行不存在的检查。

## 4. 代码风格

- 优先遵循所在文件已有风格；整体偏向 2 空格缩进、单引号、TypeScript 函数式工具函数。
- 不为小改动引入新依赖；新增依赖必须能明显降低复杂度，并确认兼容当前 Node / TypeScript / pnpm 配置。
- 保持 CLI 层轻薄：`src/bin/kabu.ts` 只做 CLI 初始化，`src/commands/gen.ts` 只做命令参数注册与错误输出，核心逻辑放在 `src/gen`。
- 公共导出集中从 `src/gen/index.ts` 暴露；新增公共 API 时同步维护类型导出。
- OpenAPI schema 边界允许使用 `any` 表达不稳定输入；内部新增稳定结构时优先补明确类型。
- 错误消息和用户可见日志遵循现有中文风格，例如 `缺少必填参数`、`输入目录不存在或不是目录`。

## 5. 生成器行为约束

修改生成逻辑时必须保持以下契约，除非用户明确要求改变：

- 只支持 OpenAPI 3.x，输入目录递归扫描 `*.openapi.json`。
- 文件名映射保持 `<module>.openapi.json -> <module>.ts`。
- 生成代码默认面向 axios 风格 request 封装，并假设响应拦截器已将 `AxiosResponse<T>` 解包成业务值 `T`。
- 生成函数默认返回 `Promise<ResponseType>`，axios 泛型保持 `request.get<ResponseType, ResponseType>` 这类策略。
- `GET`、`POST`、`PUT`、`DELETE`、`PATCH` 是当前支持的 HTTP 方法。
- `path` 参数用于 URL 模板，不能同时作为 query 发送。
- `query` 参数写入 `AxiosRequestConfig.params`。
- `POST`、`PUT`、`PATCH` 的请求体作为 axios 第二参数；`DELETE` 的请求体写入 `AxiosRequestConfig.data`。
- `rewritePrefix` 只改变请求 URL，不改变函数名；规则按传入顺序匹配，命中第一条后停止。
- 生成结果需要稳定可复现：文件排序、类型命名、函数命名和重名后缀都应保持确定性。
- 输出文件已存在时会覆盖；这个行为需要在文档中保持明确。

## 6. 文档与 example 同步

- 修改生成策略、函数签名、schema 转换、路径重写、错误策略或 CLI 参数时，同步更新 `docs/strategy.md`。
- 修改用户可见示例或生成代码形态时，同步更新 `docs/examples.md`。
- 修改 example 输入或生成器输出时，通过完整 example 生成命令更新 `example/services/product.ts`；不要只手工改生成结果。
- 修改 CLI 用法、安装方式、命令参数或项目结构时，同步更新 `README.md`。

## 7. 验证标准

- 仅改文档：至少检查相关 Markdown 链接、命令和示例是否仍与代码一致。
- 改 TypeScript 源码：至少执行 `pnpm check`。
- 改 CLI、构建配置或生成器核心逻辑：执行 `pnpm build` 和 `pnpm check`。
- 改生成输出规则：执行完整 example 生成命令，并查看 `example/services/product.ts` diff 是否符合预期。
- 如果某项验证无法运行，汇报时明确说明命令、失败原因和未覆盖风险。

## 8. Git 与交付

- 只改与当前任务相关的文件。
- 不使用 `git reset --hard`、`git checkout --`、强制推送等破坏性命令，除非用户明确要求。
- 汇报时说明改了什么、为什么这样改、执行了哪些验证、还有哪些未验证。
- 如用户要求提交，commit message 使用仓库当前语言风格，并在末尾附加当前模型对应的 `Co-Authored-By` trailer。
