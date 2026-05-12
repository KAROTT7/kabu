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
pnpm dev gen ./src/services --request-import '@/request'
pnpm dev gen --input-dir ./openapi --output-dir ./src/services --request-import '@/request'
```

运行完整模拟案例：

```bash
pnpm build
node ./dist/src/bin/kabu.js gen ./example/openapi --output-dir ./example/services --request-import '../request' --rewrite-prefix /product=/api/product
```

构建 TypeScript：

```bash
pnpm build
```

本地 link 后可以直接使用 `kabu` 命令：

```bash
pnpm link --global
kabu gen ./src/services --request-import '@/request'
```

## 命令

```bash
kabu gen [inputDir] --request-import <path> [options]
```

参数：

- `--input-dir <dir>`：递归扫描 `*.openapi.json` 的输入目录
- `--output-dir <dir>`：生成 `.ts` 文件的输出目录，默认等于 `inputDir`
- `--request-import <path>`：生成文件中 request 封装的导入路径
- `--rewrite-prefix <from=to>`：有序请求路径重写规则，可重复传入

详细生成规则见 [生成策略](./docs/strategy.md)，完整案例见 [生成案例](./docs/examples.md)。

`rewrite-prefix` 按传入顺序匹配，命中第一条后停止：

```bash
kabu gen ./openapi --request-import '@/request' --rewrite-prefix /a/b=/c/a/c --rewrite-prefix /a=/c/a/b
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
tsconfig.example.json       example 类型检查配置
```
