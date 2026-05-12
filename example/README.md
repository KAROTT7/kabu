# kabu 完整模拟案例

这个目录提供一组可以直接复现的模拟 OpenAPI 输入和生成结果，用来展示 `kabu gen` 在前端业务模块中的完整输出形态。

## 目录结构

```text
example/
  openapi/
    product.openapi.json      模拟商品模块 OpenAPI 输入
  services/
    product.ts                由 kabu gen 生成的接口文件
  request.ts                  axios request 封装示例
```

`request.ts` 使用真实 `axios` 实例，并通过响应拦截器把 `AxiosResponse<T>` 解包为业务响应值 `T`，与生成代码中的 `request.get<ResponseData, ResponseData>` 策略保持一致。

## 复现命令

在项目根目录执行：

```bash
pnpm build
node ./dist/src/bin/kabu.js gen ./example/openapi \
  --baseline-dir ./openapi-baseline \
  --output-dir ./example/services \
  --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '../request'" \
  --rewrite /product=/api/product
```

生成结果会覆盖 `example/services/product.ts`。
默认还会把模块级 OpenAPI 基线写入 `openapi-baseline/product.openapi.json`。

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
| 响应数据解包 | 所有 `ApiResultXxx.data` 都会解包成业务响应类型 |
