# kabu 完整模拟案例

这个目录提供一组可以直接复现的模拟 OpenAPI 输入和生成结果，用来展示 `kabu` 在前端业务模块中的完整输出形态。

## 目录结构

```text
example/
  package.json              独立示例项目配置
  openapi/
    product.openapi.json      模拟商品模块 OpenAPI 输入
  openapi-baseline/
    product.openapi.json      由 kabu 生成的模块级 OpenAPI 基线
  services/
    product.ts                由 kabu 生成的接口文件
  request.ts                  axios request 封装示例
  tsconfig.json              独立类型检查配置
```

`request.ts` 使用真实 `axios` 实例，并通过响应拦截器把 `{ code, msg/message, data }` 解包为业务响应值 `data`。为了贴合生成代码，示例里把 `request.get` / `request.post` 等方法声明成 `request.get<ResponseData, RawResponse>` 这类“业务值在前、原始响应在后”的 axios 风格封装；业务码失败时会提示错误信息并返回 `undefined`。

## 安装

在 `example/` 目录执行：

```bash
pnpm install
```

`example/package.json` 通过 `link:..` 安装当前仓库里的 `kabu`。生成脚本会先构建父级包，再调用构建后的 CLI。

## 复现命令

在 `example/` 目录执行：

```bash
pnpm gen
```

生成结果会覆盖 `example/services/product.ts`。
默认还会把模块级 OpenAPI 基线写入 `example/openapi-baseline/product.openapi.json`。

如果希望以当前 `openapi/` 作为完整事实来源重新生成，可以执行：

```bash
pnpm gen:full
```

类型检查：

```bash
pnpm check
```

## 覆盖场景

| 场景 | OpenAPI 接口 |
| --- | --- |
| 无参数且无请求体 | `GET /product/catalog/config` |
| `POST` 无参数且无请求体 | `POST /product/catalog/sync` |
| 只有查询参数 | `GET /product/item/page?pageNo&pageSize` |
| 只有路径参数 | `GET /product/item/{id}` |
| 路径参数和查询参数 | `GET /product/item/{id}/logs?level&operator` |
| 只有请求体 | `POST /product/item/create` |
| 查询参数和请求体 | `POST /product/item/export?format` |
| 路径参数和请求体 | `PUT /product/item/{id}/price` |
| 路径参数、查询参数和请求体 | `PATCH /product/item/{id}/status?notify` |
| `DELETE` 携带查询参数 | `DELETE /product/item/delete?id` |
| `DELETE` 携带请求体 | `DELETE /product/item/{id}` |
| 文件头 | `--file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '../request'"` |
| 路径重写 | `--rewrite /product=/api/product` |
| 响应数据解包 | 所有 `ApiResult<T>.data` 都会解包成业务响应类型 |
