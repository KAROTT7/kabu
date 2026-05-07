# gen-services 使用说明

`scripts/gen-services.ts` 用于把 OpenAPI JSON 文件批量转换成前端可直接调用的 `services` 代码。

完整生成策略见 [`docs/strategy.md`](../docs/strategy.md)，案例见 [`docs/examples.md`](../docs/examples.md)。

支持 OpenAPI `3.0.x` 和 `3.1.x`。

## 功能

- 递归扫描输入目录下所有 `*.openapi.json`
- 每个 OpenAPI 文件生成一个同名 `.ts` 文件

## 命令用法

```bash
kabu gen --input-dir <path> --request-import <path> [--output-dir <path>] [--rewrite-prefix <from=to>]
kabu gen <input-dir> --request-import <path> [--output-dir <path>] [--rewrite-prefix <from=to>]
```

## 参数说明

- `--input-dir`：必填。OpenAPI 文件所在目录（会递归扫描）。
- `--request-import`：必填。生成文件中 `request` 的导入路径（例如 `@/request` 或 `../utils/request`）。
- `--output-dir`：可选。生成目录；不传时默认等于 `input-dir`。
- `--rewrite-prefix`：可选。接口路径前缀重写规则，格式 `<from=to>`，可重复传入多条规则，按传入顺序匹配第一个命中的规则。
- `--services-dir`：兼容旧参数，等价于同时设置 `input-dir` 和 `output-dir` 为同一个目录。

## 生成规则

- 文件名映射：
  - `member.openapi.json` -> `member.ts`
  - `trade.openapi.json` -> `trade.ts`
- 请求/响应 Schema 选择：
  - 优先 `application/json`
  - 若不存在，会回退到其他包含 `json` 的媒体类型（例如 `application/problem+json`）
- 响应优先 `200`，其次自动选择其他 `2xx`，最后尝试 `default`
- 函数命名使用 `method + path`，例如 `GET /member/user/list` -> `getMemberUserList`
- 路径参数会生成 `ByXxx`，例如 `GET /member/user/list/{id}` -> `getMemberUserListById`
- 类型命名按职责区分：`XxxParams` 表示 `path/query` 请求参数，`XxxBody` 表示请求体 data，`XxxResponse` 表示响应 data，不是 axios 原始的 `AxiosResponse<T>` 对象
- `header` 参数不生成到函数入参中，默认由用户的 axios 拦截器统一处理
- 每个生成函数都会追加 `axiosRequestConfig?: AxiosRequestConfig`，用于自定义单个请求行为
- 生成调用以 axios 方法签名为准：查询参数放在 `AxiosRequestConfig.params`，`POST/PUT/PATCH` 的请求体使用第二个请求参数，`DELETE` 的请求体使用 `AxiosRequestConfig.data`
- 当接口同时存在参数和请求体时，函数签名为 `(params, data, axiosRequestConfig?)`

## 示例

```bash
# 输入和输出都在 src/services
kabu gen ./src/services --request-import '@/request'

# 显式指定输入目录
kabu gen --input-dir ./src/services --request-import '@/request'

# 输入和输出分离
kabu gen --input-dir ./openapi --output-dir ./src/services --request-import '@/request'

# 路径重写：/member/xxx -> /api/member/xxx
kabu gen --input-dir ./src/services --request-import '@/request' --rewrite-prefix /member=/api/member

# 多条重写规则
kabu gen --input-dir ./src/services --request-import '@/request' --rewrite-prefix /a/b=/c/a/c --rewrite-prefix /a=/c/a/b
```

## 注意事项

- 脚本会覆盖同名输出文件（如已存在 `member.ts` 会被重写）。
- 使用 `--rewrite-prefix` 时，只会重写请求 URL，不会改变生成函数名。
- 当未找到任何 `*.openapi.json` 文件时，脚本会报错退出。
- 未提供输入目录时，脚本会报错提示必填参数。
- 未提供 `--request-import` 时，脚本会报错提示必填参数。
