# 生成策略

本文档说明 `kabu gen` 的生成规则、优先级和边界。完整输入输出案例见 [生成案例](./examples.md)。

## 目标

- 稳定：同一份 OpenAPI 文档和同一组选项，应生成一致的 TypeScript 代码。
- 可感知：函数名来自请求方法和路径，后端路径变化会体现在生成代码里。
- 低重复：自动生成参数类型、请求体类型、响应类型和请求函数。
- axios 优先：请求调用遵循 axios 方法别名签名，方便对接 axios 实例或 axios 风格封装。

## 输入文件

`kabu gen` 会递归扫描输入目录下所有 `*.openapi.json` 文件。

文件名映射规则：

```text
<module>.openapi.json -> <module>.ts
```

例如：

```text
member.openapi.json -> member.ts
trade.openapi.json  -> trade.ts
```

如果递归扫描中出现同名 OpenAPI 文件，例如 `a/product.openapi.json` 和 `b/product.openapi.json`，二者都会映射到 `product.ts`。为避免静默覆盖，生成器会直接报错并提示冲突文件。

支持的 OpenAPI 版本：

- OpenAPI `3.0.x`
- OpenAPI `3.1.x`

必需结构：

- 顶层存在 `openapi`
- 顶层存在 `paths`
- 顶层存在 `info.title` 和 `info.version`

## 输出文件

每个 OpenAPI 文件生成一个同名 TypeScript 文件。

生成文件包含：

- 用户通过 `--file-header` 指定的文件头部代码
- OpenAPI `components.schemas` 中被引用到的类型
- 每个 operation 对应的请求参数类型、请求体类型、响应数据类型和请求函数

`--file-header` 是字符串形式，内容会写入生成文件开头，通常用于自定义依赖导入。生成函数默认会引用 `AxiosRequestConfig` 类型和 `request` 变量，因此文件头通常需要包含：

```ts
import type { AxiosRequestConfig } from 'axios'
import request from '@/request'
```

命令行中可以传入实际换行，也可以传入 `\n`，生成器会将 `\n` 转成换行。

## 接口方法选择

当前会生成以下 HTTP 方法：

- `GET`
- `POST`
- `PUT`
- `DELETE`
- `PATCH`

忽略的内容：

- 不在上述列表中的 HTTP 方法
- OpenAPI `header` 参数
- OpenAPI `cookie` 参数
- 非 JSON 请求体或响应体

## 函数命名

函数名使用“请求方法 + 路径”，也就是 `method + path`。

处理步骤：

1. 请求方法转小写，作为函数名前缀。
2. 路径按 `/` 拆成片段。
3. 普通路径片段转换为 PascalCase。
4. `-`、`_`、空格等分隔符会被视为单词边界。
5. 路径参数转换为 `ByXxx`。
6. 拼接所有片段。
7. 同一个文件中生成的函数名必须唯一；如果不同 `method + path` 生成了同名函数，生成器会直接报错。

路径参数支持两种形式：

```text
{id}
:id
```

命名示例：

```text
GET /member/user/list      -> getMemberUserList
GET /member/user/list/{id} -> getMemberUserListById
POST /trade/order/create   -> postTradeOrderCreate
```

同名冲突示例：

```text
GET /member/user-list -> getMemberUserList
GET /member/user_list -> getMemberUserList
```

上述两个接口会生成同名函数，生成器会报错，不会自动追加数字后缀。

## 路径重写

`rewritePrefix` 只改变生成后的请求 URL，不改变函数名。

规则格式：

```text
<from=to>
```

命令行可重复传入：

```bash
kabu gen ./openapi \
  --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'" \
  --rewrite-prefix /a/b=/c/a/c \
  --rewrite-prefix /a=/c/a/b
```

匹配规则：

- 按传入顺序匹配。
- 命中第一条后停止。
- 前缀匹配按路径片段判断。
- `/a` 可以匹配 `/a` 和 `/a/user`。
- `/a` 不会匹配 `/abc/user`。

示例：

```text
/a/b/user -> /c/a/c/user
/a/user   -> /c/a/b/user
```

## 参数策略

OpenAPI 参数按位置分为：

- `path`
- `query`
- `header`
- `cookie`

当前生成策略：

- 支持 Path Item 级别的公共 `parameters`，也支持 operation 级别的 `parameters`。
- 如果 Path Item 和 operation 中存在相同 `in + name` 的参数，operation 参数覆盖 Path Item 参数。
- `path` 参数生成独立入参，入参名优先使用路径模板中的参数名，例如 `{id}` 生成 `id: string | number`，`{userId}` 生成 `userId: string | number`，并用于拼接 URL。
- `query` 参数进入函数入参 `params`，并写入 `AxiosRequestConfig.params`。
- `header` 参数不生成，由 axios 拦截器、axios 默认配置或调用方的 `axiosRequestConfig.headers` 处理。
- `cookie` 参数不生成。

生成函数入参里的 `params` 是生成器层面的查询参数对象，只包含 `query` 参数。

axios 配置中的 `AxiosRequestConfig.params` 只表示查询参数，会被 axios 序列化到 URL 的 `?` 后面，不会替换路径模板。路径参数只用于拼接 URL，不会同时作为查询参数发送。

例如 `GET /member/user/{id}/orders?pageNo` 会生成：

```ts
request.get(`/member/user/${id}/orders`, {
  ...axiosRequestConfig,
  params
})
```

这里的 `id` 是路径参数，用于替换 URL；函数入参 `params` 会整体写入 `AxiosRequestConfig.params`，最终变成 `?pageNo=...`。

如果 OpenAPI 路径中出现 `{id}`，但 operation parameters 没有声明对应 path 参数，生成器会补一个必填路径参数，并生成 `id: string | number`。

## 类型命名

生成类型会按职责拆分，避免把请求参数、请求体和响应数据混在一起。

| 类型角色 | 生成命名 | 含义 |
| --- | --- | --- |
| 请求参数类型 | `<FunctionName>Params` | `query` 参数对象 |
| 请求体类型 | `<FunctionName>Body` | 请求体 data |
| 响应数据类型 | `<FunctionName>Response` | 响应 data，也就是业务响应值 |

这里的 `<FunctionName>Response` 表示响应 data 类型，不是 axios 原始的 `AxiosResponse<T>` 对象。

命名示例：

```text
getTradeOrderPage    -> GetTradeOrderPageParams
postTradeOrderCreate -> PostTradeOrderCreateBody
getTradeOrderPage    -> GetTradeOrderPageResponse
```

## 请求体策略

请求体 schema 选择顺序：

1. 优先使用 `application/json`
2. 如果不存在，则选择其他媒体类型中名称包含 `json` 的内容，例如 `application/problem+json`
3. 如果仍然不存在，则认为没有请求体

请求体入参名固定为 `data`。

## 响应策略

响应 schema 选择顺序：

1. 优先使用 `200`
2. 其次使用其他 `2xx` 响应，按状态码数字升序选择
3. 最后尝试 `default`
4. 如果仍未找到 JSON schema，则生成 `unknown`

响应数据解包规则：

- 如果响应 schema 是对象，并且顶层存在 `data` 字段，则响应类型使用 `data` 字段类型。
- 如果响应 schema 是 `$ref`，并且引用对象顶层存在 `data` 字段，也会使用 `data` 字段类型。
- 如果不存在顶层 `data` 字段，则使用完整响应 schema 类型。

## Schema 转换策略

支持的 schema 形态：

- `string`
- `number`
- `integer`
- `boolean`
- `null`
- `array`
- `object`
- `enum`
- `const`
- `$ref`
- `oneOf`
- `anyOf`
- `allOf`
- `additionalProperties`
- OpenAPI 3.0 的 `nullable: true`
- OpenAPI 3.1 的 `type: ['string', 'null']`
- 类似元组的 `prefixItems`

基础类型映射：

| OpenAPI schema | TypeScript |
| --- | --- |
| `integer` | `number` |
| `number` | `number` |
| `string` | `string` |
| `boolean` | `boolean` |
| `null` | `null` |
| `array` | `T[]` |
| `object` | `interface` 或对象字面量类型 |

组合类型映射：

| OpenAPI schema | TypeScript |
| --- | --- |
| `oneOf` | 联合类型 |
| `anyOf` | 联合类型 |
| `allOf` | 交叉类型 |
| `enum` | 字面量联合类型 |
| `const` | 字面量类型 |

`nullable: true` 会追加 `| null`，包括 `oneOf`、`anyOf`、`allOf` 等组合类型。

未知或暂不支持的 schema 形态会生成 `unknown`。

## Axios 调用策略

生成调用遵循 axios 方法别名：

```text
GET    -> request.get(url, config)
DELETE -> request.delete(url, config)
POST   -> request.post(url, data, config)
PUT    -> request.put(url, data, config)
PATCH  -> request.patch(url, data, config)
```

查询参数写入 `AxiosRequestConfig.params`。

请求体按 axios 规则处理：

- `POST`、`PUT`、`PATCH`：请求体作为第二个请求参数。
- `DELETE`：请求体写入 `AxiosRequestConfig.data`。

每个生成函数都支持 `axiosRequestConfig`。

当接口同时存在参数和请求体时，函数签名为：

```ts
function api(params, data, axiosRequestConfig?)
```

当接口只有参数时，函数签名为：

```ts
function api(params, axiosRequestConfig?)
```

当接口只有请求体时，函数签名为：

```ts
function api(data, axiosRequestConfig?)
```

当接口无参数且无请求体时，函数签名为：

```ts
function api(axiosRequestConfig?)
```

说明中的泛型占位符会区分请求体和响应数据：

```ts
request.get<ResponseData, ResolvedData>(url, config)
request.post<ResponseData, ResolvedData, RequestBody>(url, data, config)
```

这里的 `ResponseData`、`ResolvedData`、`RequestBody` 是说明用的类型角色，不代表真实生成的固定类型名。

以 axios v1 的方法签名为参考：

```ts
get<T = any, R = AxiosResponse<T>, D = any>(url, config): Promise<R>
post<T = any, R = AxiosResponse<T>, D = any>(url, data, config): Promise<R>
```

三个泛型的含义是：

- `T`：`ResponseData`，响应 data 的类型
- `R`：`ResolvedData`，整个请求 Promise resolve 的类型
- `D`：`RequestBody`，请求体 data 的类型

`kabu` 默认假设项目使用的是 axios 风格 request 封装，并且响应拦截器已经把 `AxiosResponse<T>` 解包成业务响应值 `T`。因此生成：

```ts
request.get<ResponseData, ResponseData>(url, config)
request.post<ResponseData, ResponseData, RequestBody>(url, data, config)
```

它表示：

- 响应 data 类型是 `ResponseData`
- 函数最终 resolve 的类型也是 `ResponseData`
- 对 `POST/PUT/PATCH`，请求体类型是 `RequestBody`

在真实生成代码中，`ResponseData` 会替换成具体的响应数据类型，例如 `GetTradeOrderPageResponse`；`RequestBody` 会替换成具体的请求体类型，例如 `PostTradeOrderCreateBody`。

如果直接使用原始 axios，不经过响应解包，那么第二个泛型通常应该是 `AxiosResponse<ResponseData>`，函数返回值也会是 `Promise<AxiosResponse<ResponseData>>`。这不是 `kabu` 当前默认生成策略。

## 方法矩阵

下表是调用形态示意。路径参数用独立入参 `id: string | number` 表示；查询参数仍使用 `params` 对象。

| OpenAPI 形态 | 生成函数形态 | axios 调用形态 |
| --- | --- | --- |
| 无参数、无请求体 | `(axiosRequestConfig?)` | `request.get(url, config)` 或 `request.post(url, undefined, config)` |
| 只有查询参数 | `(params, axiosRequestConfig?)` | `request.get(url, { ...config, params })` |
| 只有路径参数 | `(id: string \| number, axiosRequestConfig?)` | `request.get(urlWithId, config)` |
| 路径参数 + 查询参数 | `(id: string \| number, params, axiosRequestConfig?)` | `request.get(urlWithId, { ...config, params })` |
| 只有请求体 | `(data, axiosRequestConfig?)` | `request.post(url, data, config)` |
| 查询参数 + 请求体 | `(params, data, axiosRequestConfig?)` | `request.post(url, data, { ...config, params })` |
| 路径参数 + 请求体 | `(id: string \| number, data, axiosRequestConfig?)` | `request.put(urlWithId, data, config)` |
| 路径参数 + 查询参数 + 请求体 | `(id: string \| number, params, data, axiosRequestConfig?)` | `request.patch(urlWithId, data, { ...config, params })` |
| DELETE 携带查询参数 | `(params, axiosRequestConfig?)` | `request.delete(url, { ...config, params })` |
| DELETE 携带请求体 | `(id: string \| number, data, axiosRequestConfig?)` | `request.delete(urlWithId, { ...config, data })` |

## 覆盖与错误策略

- 输出文件已存在时会直接覆盖。
- 未找到任何 `*.openapi.json` 文件时会报错。
- 未提供输入目录时会报错。
- 未提供 `--file-header` 时会报错。
- 输入目录不存在或不是目录时会报错。
