# kabu

基于 OpenAPI 文档生成 TypeScript 接口请求文件。

生成代码以 axios 风格的 request 封装为标准：查询参数写入 `AxiosRequestConfig.params`，请求体遵循 axios 方法别名签名。

完整的命名、路径重写、axios 调用、参数/请求体和 schema 生成规则见 [生成策略](./docs/strategy.md)，输入输出示例见 [生成案例](./docs/examples.md)，可复现完整模拟案例见 [example](./example/README.md)。

## 安装

```bash
pnpm install
```

## 使用

```bash
pnpm dev --help
pnpm dev --input-dir ./openapi-fragments --baseline-dir ./openapi-baseline --output-dir ./src/services --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'"
pnpm dev --input-dir ./openapi-fragments --baseline-dir ./openapi-baseline --output-dir ./src/services --mode full --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'"
pnpm dev -c ./kabu.config.mjs
```

配置文件示例：

```js
import { defineConfig } from 'kabu'

export default defineConfig({
  inputDir: './openapi-fragments',
  baselineDir: './openapi-baseline',
  outputDir: './src/services',
  fileHeader: "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'",
  rewrite: ['/product=/api/product']
})
```

配置文件就是当前生成命令的参数对象，目前不做命令名映射；如果写入 `gen`、`commands`、`config`、`logger` 等非生成参数字段，会被直接忽略。默认会自动读取当前目录下的 `kabu.config.mjs`、`kabu.config.js`、`kabu.config.cjs` 或 `kabu.config.json`。使用 `-c, --config <file>` 可以指定配置文件。执行时命令行参数优先，配置文件参数次之，例如 `kabu -c ./kabu.config.mjs --mode full` 会使用配置文件里的其他参数，但以命令行里的 `mode: full` 为准。

运行完整模拟案例：

```bash
cd example
pnpm install
pnpm gen
pnpm check
```

构建 TypeScript：

```bash
pnpm build
```

本地 link 后可以直接使用 `kabu` 命令：

```bash
pnpm link --global
kabu --input-dir ./openapi-fragments --baseline-dir ./openapi-baseline --output-dir ./src/services --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'"
```

## 命令

```bash
kabu [inputDir] --baseline-dir <dir> --output-dir <dir> --file-header <code> [options]
```

参数：

- `-c, --config <file>`：指定配置文件；未指定时会尝试读取当前目录的 `kabu.config.*`
- `--input-dir <dir>`：必填，递归扫描 `*.openapi.json` 的输入目录；也可以用位置参数 `[inputDir]` 提供
- `--baseline-dir <dir>`：必填，模块级 OpenAPI 基线目录
- `--output-dir <dir>`：必填，生成 `.ts` 文件的输出目录
- `--file-header <code>`：生成文件头部代码，通常用于自定义依赖导入
- `--mode <update|full>`：生成模式，默认 `update`
- `--rewrite <from=to>`：有序请求路径重写规则，可重复传入

详细生成规则见 [生成策略](./docs/strategy.md)，完整案例见 [生成案例](./docs/examples.md)。

默认 `update` 会先把本次导入的接口按路径第一段聚合到 `openapi-baseline/*.openapi.json`，再从这些模块基线文件生成最终 `.ts`。同一路径同一方法会覆盖旧定义，本次未导出的旧接口会保留。

如果 OpenAPI 中检测到 `{ code, message/msg, data }` 这类通用响应包装，生成器会把共享的 `ApiResult<T>` 写到输出目录的 `interface.ts`，业务模块通过 `import type { ApiResult } from './interface'` 复用。

如果传入 `--mode full`，则会先清空基线目录和输出目录，再把当前输入目录作为完整事实来源重新生成。

`rewrite` 按传入顺序匹配，命中第一条后停止：

```bash
kabu ./openapi --baseline-dir ./openapi-baseline --output-dir ./src/services --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'" --rewrite /a/b=/c/a/c --rewrite /a=/c/a/b
```

## 项目结构

```text
src/bin/kabu.ts             CLI 可执行入口
src/cli/index.ts            CLI 初始化
src/cli/commands/gen.ts     cac 命令注册
src/index.ts                OpenAPI 生成核心公共导出
src/*.ts                    OpenAPI 生成核心模块
docs/strategy.md            生成规则
docs/examples.md            生成案例
example/                    可复现完整模拟案例
tsconfig.example.json       example 类型检查兼容配置
```
