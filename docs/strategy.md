# 生成策略

本文档说明 `kabu` 的生成规则、优先级和边界。完整输入输出案例见 [生成案例](./examples.md)。

## 目标

- 稳定：同一份 OpenAPI 文档和同一组选项，应生成一致的 TypeScript 代码。
- 可感知：函数名来自请求方法和路径，后端路径变化会体现在生成代码里。
- 低重复：自动生成参数类型、请求体类型、响应类型和请求函数。
- axios 优先：请求调用遵循 axios 方法别名签名，方便对接 axios 实例或 axios 风格封装。

## 输入文件

`kabu` 会递归扫描输入目录下所有 `*.openapi.json` 文件。

默认会先按接口路径第一段拆分模块，并把模块级 OpenAPI 基线写入：

```text
openapi-baseline/<module>.openapi.json
```

再由这些模块基线文件生成最终输出：

```text
<module>.openapi.json -> <module>.ts
```

例如：

```text
/member/user/list -> openapi-baseline/member.openapi.json -> member.ts
/trade/order/page -> openapi-baseline/trade.openapi.json  -> trade.ts
```

也就是说，输入文件名本身不再决定输出模块；决定模块归属的是接口路径的第一段。

支持的 OpenAPI 版本：

- OpenAPI `3.0.x`
- OpenAPI `3.1.x`

必需结构：

- 顶层存在 `openapi`
- 顶层存在 `paths`
- 顶层存在 `info.title` 和 `info.version`

## 输出文件

每个模块基线 OpenAPI 文件生成一个同名 TypeScript 文件。

生成文件包含：

- 用户通过 `--file-header` 指定的文件头部代码
- OpenAPI `components.schemas` 中被引用到的类型
- 每个 operation 对应的请求参数类型、请求体类型、响应数据类型和请求函数

## 同步模式

`kabu` 支持两种生成模式：

- `update`：默认模式。把本次导入的接口片段合并进模块基线，再从受影响的模块基线文件生成对应 `.ts`
- `full`：先清空基线目录和输出目录，再把当前输入目录作为完整事实来源重新生成

`update` 的合并规则：

- 模块名来自接口路径第一段，例如 `/product/item/page` 归属 `product`
- 同一路径同一方法会被新导入定义覆盖
- 同一路径的其他方法保留
- 本次未导出的旧接口默认保留
- 多份输入文件中的同模块接口会合并到同一个模块基线文件

`full` 的清理规则：

- 生成前会先清空基线目录
- 生成前会先清空输出目录
- 然后再按当前输入目录里的接口重新生成模块基线和输出文件

`--file-header` 是字符串形式，内容会写入生成文件开头，通常用于自定义依赖导入。生成函数默认会引用 `AxiosRequestConfig` 类型和 `request` 变量，因此文件头通常需要包含：

```ts
import type { AxiosRequestConfig } from 'axios'
import request from '@/request'
```

命令行中可以传入实际换行，也可以传入 `\n`，生成器会将 `\n` 转成换行。

## 配置文件

`kabu` 支持通过配置文件提供命令参数。默认会尝试读取当前目录下的以下文件：

```text
kabu.config.mjs
kabu.config.js
kabu.config.cjs
kabu.config.json
```

也可以通过 `-c, --config <file>` 指定配置文件：

```bash
kabu -c ./kabu.config.mjs
```

配置文件直接导出当前生成命令的参数对象，目前不做命令名映射：

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

配置文件只读取当前生成参数字段：

- `inputDir`
- `baselineDir`
- `outputDir`
- `fileHeader`
- `mode`
- `rewrite`

如果配置文件中出现 `gen`、`commands`、`config`、`logger`、`root`、`pathRewrites`、`rewritePrefix` 或其他非生成参数字段，会被直接忽略。

合并优先级为：

```text
命令行参数 > 配置文件参数 > 生成器默认值
```

例如配置文件里写了 `mode: 'update'`，命令行执行 `kabu -c ./kabu.config.mjs --mode full` 时会以 `full` 为准。`rewrite`、`pathRewrites`、`rewritePrefix` 也遵循同样规则：只要命令行传入 `--rewrite`，就会覆盖配置文件里的路径重写配置。

`inputDir`、`baselineDir`、`outputDir` 是必填参数，可以来自命令行，也可以来自配置文件。缺少任意一个都会直接报错。

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

`rewrite` 只改变生成后的请求 URL，不改变函数名。

规则格式：

```text
<from=to>
```

命令行可重复传入：

```bash
kabu ./openapi \
  --baseline-dir ./openapi-baseline \
  --output-dir ./src/services \
  --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'" \
  --rewrite /a/b=/c/a/c \
  --rewrite /a=/c/a/b
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
- 常见接口响应模型如 `{ code, msg, data }` 或 `{ code, message, data }` 中，`code` 和 `msg/message` 通常由响应拦截器处理；生成函数的返回值只暴露页面真正使用的业务 `data` 类型。

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

说明中的泛型占位符会区分最终业务返回值、原始响应包装和请求体：

```ts
request.get<ResolvedData, RawResponse>(url, config)
request.post<ResolvedData, RawResponse, RequestBody>(url, data, config)
```

这里的 `ResolvedData`、`RawResponse`、`RequestBody` 是说明用的类型角色，不代表真实生成的固定类型名。

这里的 `request` 指的是项目里的 axios 风格封装，而不是直接使用原始 `AxiosInstance` 默认泛型顺序。当前约定是：

```ts
get<ResolvedData = any, RawResponse = unknown>(url, config): Promise<ResolvedData | undefined>
post<ResolvedData = any, RawResponse = unknown, RequestBody = any>(url, data, config): Promise<ResolvedData | undefined>
```

三个泛型的含义是：

- 第一个泛型：`ResolvedData`，页面真正消费的业务数据类型
- 第二个泛型：`RawResponse`，接口原始响应体类型，例如 `{ code, msg, data }`
- 第三个泛型：`RequestBody`，请求体 `data` 的类型；不会用它表达 `params` 查询参数

`kabu` 默认假设项目使用的是 axios 风格 request 封装，并且响应拦截器已经把接口响应包装对象解包成业务响应值 `ResolvedData` 或 `undefined`。因此生成：

```ts
request.get<ResponseData, RawResponse>(url, config)
request.post<ResponseData, RawResponse, RequestBody>(url, data, config)
```

它表示：

- 第一个泛型表达页面真正拿到的 `ResponseData`
- 第二个泛型表达接口原始响应包装 `RawResponse`
- 函数最终 resolve 的类型仍然是 `ResponseData | undefined`
- 对 `POST/PUT/PATCH`，请求体 `data` 类型是 `RequestBody`

生成函数返回 `Promise<ResponseData | undefined>`。当业务码表示成功时，响应拦截器返回 `data`；当业务码表示失败时，响应拦截器可以统一提示 `msg/message` 并返回 `undefined`。

在真实生成代码中，`ResponseData` 会替换成具体的响应 `data` 类型，例如 `GetTradeOrderPageResponse`；`RawResponse` 会替换成生成器归一化后的原始响应包装类型，例如 `ApiResult<GetTradeOrderPageResponse>`；`RequestBody` 会替换成具体的请求体类型，例如 `PostTradeOrderCreateBody`。

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
