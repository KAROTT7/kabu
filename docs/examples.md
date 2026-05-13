# 生成案例

本文档提供 `kabu` 的常见输入输出案例。规则说明见 [生成策略](./strategy.md)。可复现完整模拟案例见 [example](../example/README.md)。

为了避免混淆，本文档说明中会区分以下类型角色：

| 类型角色 | 含义 | 生成命名示例 |
| --- | --- | --- |
| `RequestParams` | `path` 和 `query` 请求参数对象 | `GetTradeAfterSalePageParams` |
| `RequestBody` | 请求体 data | `PostMemberUserCreateBody` |
| `ResponseData` | 响应 data，也就是业务响应值 | `GetSystemAreaTreeResponse` |
| `RawResponse` | 接口原始响应包装对象 | `ApiResult<GetSystemAreaTreeResponse>` |
| `ResolvedData` | 请求最终 resolve 的值 | 默认等同于 `ResponseData | undefined` |

示例中的 `request.get<GetSystemAreaTreeResponse, ApiResult<GetSystemAreaTreeResponse>>` 是项目里 axios 风格 request 封装的写法。第一个泛型是页面真正消费的业务值，第二个泛型是接口原始响应包装对象。`kabu` 默认假设响应拦截器已经把 `{ code, msg/message, data }` 解包成业务值 `data`；当业务码表示失败时，拦截器可以提示错误信息并返回 `undefined`，所以默认生成时 `ResolvedData` 仍然是 `ResponseData | undefined`。

如果 OpenAPI 在 `components.schemas` 中定义了同构的包装类型，例如多个 `ApiResultXxx` 都是 `{ code, message/msg, data }`，生成代码会自动折叠成共享的泛型包装 `ApiResult<T>`，并写入输出目录的 `interface.ts`。各模块文件会导入这个共享类型，例如 `request.get<GetProductItemPageResponse, ApiResult<GetProductItemPageResponse>>`。

`interface.ts` 示例：

```ts
/** 通用接口类型（由 OpenAPI 自动提取） */

export interface ApiResult<T> {
  code: number
  message: string
  data: T
}
```

## 无参数且无请求体

OpenAPI：

```text
GET /system/area/tree
```

生成结果：

```ts
export function getSystemAreaTree(
  axiosRequestConfig?: AxiosRequestConfig
): Promise<GetSystemAreaTreeResponse | undefined> {
  return request.get<GetSystemAreaTreeResponse, ApiResult<GetSystemAreaTreeResponse>>(
    `/system/area/tree`,
    axiosRequestConfig
  )
}
```

## POST 无参数且无请求体

OpenAPI：

```text
POST /member/auth/logout
```

生成结果：

```ts
export function postMemberAuthLogout(
  axiosRequestConfig?: AxiosRequestConfig
): Promise<PostMemberAuthLogoutResponse | undefined> {
  return request.post<PostMemberAuthLogoutResponse, ApiResult<PostMemberAuthLogoutResponse>>(
    `/member/auth/logout`,
    undefined,
    axiosRequestConfig
  )
}
```

## 只有查询参数

OpenAPI：

```text
GET /trade/after-sale/page?pageNo&pageSize
```

生成结果：

```ts
export interface GetTradeAfterSalePageParams {
  pageNo: number
  pageSize: number
}

export function getTradeAfterSalePage(
  params: GetTradeAfterSalePageParams,
  axiosRequestConfig?: AxiosRequestConfig
): Promise<GetTradeAfterSalePageResponse | undefined> {
  return request.get<GetTradeAfterSalePageResponse, ApiResult<GetTradeAfterSalePageResponse>>(
    `/trade/after-sale/page`,
    {
      ...axiosRequestConfig,
      params
    }
  )
}
```

## 只有路径参数

OpenAPI：

```text
GET /member/user/list/{id}
```

生成结果：

```ts
export function getMemberUserListById(
  id: string | number,
  axiosRequestConfig?: AxiosRequestConfig
): Promise<GetMemberUserListByIdResponse | undefined> {
  return request.get<GetMemberUserListByIdResponse, ApiResult<GetMemberUserListByIdResponse>>(
    `/member/user/list/${id}`,
    axiosRequestConfig
  )
}
```

这里的 `id` 是路径参数，用于拼接 URL；axios 配置里的 `params` 只代表查询参数。路径参数不会同时作为查询参数发送。

## 路径参数和查询参数

OpenAPI：

```text
GET /member/user/{id}/orders?pageNo
```

生成结果：

```ts
export interface GetMemberUserByIdOrdersParams {
  pageNo?: number
}

export function getMemberUserByIdOrders(
  id: string | number,
  params: GetMemberUserByIdOrdersParams,
  axiosRequestConfig?: AxiosRequestConfig
): Promise<GetMemberUserByIdOrdersResponse | undefined> {
  return request.get<GetMemberUserByIdOrdersResponse, ApiResult<GetMemberUserByIdOrdersResponse>>(
    `/member/user/${id}/orders`,
    {
      ...axiosRequestConfig,
      params
    }
  )
}
```

## 只有请求体

OpenAPI：

```text
POST /member/user/create
```

生成结果：

```ts
export type PostMemberUserCreateBody = {
  name: string
}

export function postMemberUserCreate(
  data: PostMemberUserCreateBody,
  axiosRequestConfig?: AxiosRequestConfig<PostMemberUserCreateBody>
): Promise<PostMemberUserCreateResponse | undefined> {
  return request.post<
    PostMemberUserCreateResponse,
    ApiResult<PostMemberUserCreateResponse>,
    PostMemberUserCreateBody
  >(`/member/user/create`, data, axiosRequestConfig)
}
```

## 查询参数和请求体

OpenAPI：

```text
POST /promotion/coupon/take?templateId
```

生成结果：

```ts
export interface PostPromotionCouponTakeParams {
  templateId: number
}

export type PostPromotionCouponTakeBody = {
  count: number
}

export function postPromotionCouponTake(
  params: PostPromotionCouponTakeParams,
  data: PostPromotionCouponTakeBody,
  axiosRequestConfig?: AxiosRequestConfig<PostPromotionCouponTakeBody>
): Promise<PostPromotionCouponTakeResponse | undefined> {
  return request.post<
    PostPromotionCouponTakeResponse,
    ApiResult<PostPromotionCouponTakeResponse>,
    PostPromotionCouponTakeBody
  >(`/promotion/coupon/take`, data, {
    ...axiosRequestConfig,
    params
  })
}
```

## 路径参数和请求体

OpenAPI：

```text
PUT /member/user/{id}
```

生成结果：

```ts
export type PutMemberUserByIdBody = {
  name: string
}

export function putMemberUserById(
  id: string | number,
  data: PutMemberUserByIdBody,
  axiosRequestConfig?: AxiosRequestConfig<PutMemberUserByIdBody>
): Promise<PutMemberUserByIdResponse | undefined> {
  return request.put<
    PutMemberUserByIdResponse,
    ApiResult<PutMemberUserByIdResponse>,
    PutMemberUserByIdBody
  >(`/member/user/${id}`, data, axiosRequestConfig)
}
```

## 路径参数、查询参数和请求体

OpenAPI：

```text
PATCH /member/user/{id}?notify
```

生成结果：

```ts
export interface PatchMemberUserByIdParams {
  notify?: boolean
}

export type PatchMemberUserByIdBody = {
  name?: string
}

export function patchMemberUserById(
  id: string | number,
  params: PatchMemberUserByIdParams,
  data: PatchMemberUserByIdBody,
  axiosRequestConfig?: AxiosRequestConfig<PatchMemberUserByIdBody>
): Promise<PatchMemberUserByIdResponse | undefined> {
  return request.patch<
    PatchMemberUserByIdResponse,
    ApiResult<PatchMemberUserByIdResponse>,
    PatchMemberUserByIdBody
  >(`/member/user/${id}`, data, {
    ...axiosRequestConfig,
    params
  })
}
```

## DELETE 携带查询参数

OpenAPI：

```text
DELETE /trade/after-sale/cancel?id
```

生成结果：

```ts
export function deleteTradeAfterSaleCancel(
  params: DeleteTradeAfterSaleCancelParams,
  axiosRequestConfig?: AxiosRequestConfig
): Promise<DeleteTradeAfterSaleCancelResponse | undefined> {
  return request.delete<
    DeleteTradeAfterSaleCancelResponse,
    ApiResult<DeleteTradeAfterSaleCancelResponse>
  >(`/trade/after-sale/cancel`, {
    ...axiosRequestConfig,
    params
  })
}
```

## DELETE 携带请求体

OpenAPI：

```text
DELETE /member/user/{id}
```

生成结果：

```ts
export function deleteMemberUserById(
  id: string | number,
  data: DeleteMemberUserByIdBody,
  axiosRequestConfig?: AxiosRequestConfig<DeleteMemberUserByIdBody>
): Promise<DeleteMemberUserByIdResponse | undefined> {
  return request.delete<
    DeleteMemberUserByIdResponse,
    ApiResult<DeleteMemberUserByIdResponse>,
    DeleteMemberUserByIdBody
  >(`/member/user/${id}`, {
    ...axiosRequestConfig,
    data
  })
}
```

## 路径重写

命令：

```bash
kabu ./openapi \
  --baseline-dir ./openapi-baseline \
  --output-dir ./services \
  --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'" \
  --rewrite /a/b=/c/a/c \
  --rewrite /a=/c/a/b
```

生成路径：

```text
/a/b/user -> /c/a/c/user
/a/user   -> /c/a/b/user
```

## 配置文件

可以把生成命令参数写入配置文件：

```js
// kabu.config.mjs
export default {
  inputDir: './openapi',
  baselineDir: './openapi-baseline',
  outputDir: './services',
  fileHeader: "import type { AxiosRequestConfig } from 'axios'\nimport request from '../request'",
  rewrite: ['/product=/api/product']
}
```

执行：

```bash
kabu -c ./kabu.config.mjs
```

如果同时传入命令行参数，命令行参数优先：

```bash
kabu -c ./kabu.config.mjs --mode full --rewrite /product=/admin/product
```

上述命令会复用配置文件里的输入、输出、文件头等参数，但 `mode` 和 `rewrite` 使用命令行传入的值。

## 增量同步

第一次导入：

```text
/product/item/page
/product/item/{id}
/product/item/{id}/delete
```

会先聚合到：

```text
openapi-baseline/product.openapi.json
```

再生成：

```text
product.ts
```

第二次如果只导入一个改过的接口：

```text
/product/item/{id}
```

并使用默认 `update` 模式，则会：

- 用新的 `/product/item/{id}` 覆盖模块基线中的同路径同方法定义
- 保留 `/product/item/page` 和 `/product/item/{id}/delete`
- 再重新生成整份 `product.ts`

也就是说，最终是“模块级整文件重生成”，但导入语义是“按模块增量合并”。

## 全量同步

如果传入：

```bash
kabu ./openapi \
  --baseline-dir ./openapi-baseline \
  --output-dir ./services \
  --mode full \
  --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'"
```

则会先清空基线目录和输出目录，再按当前输入目录完整重建：

- 旧的模块基线文件会被清空
- 旧的输出 `.ts` 文件会被清空
- 当前输入目录中的接口会重新生成新的模块基线和新的输出文件

## 响应数据解包

OpenAPI 响应 schema：

```json
{
  "type": "object",
  "properties": {
    "data": {
      "type": "string"
    }
  }
}
```

生成结果：

```ts
export type SomeResponse = string

export function someApi(axiosRequestConfig?: AxiosRequestConfig): Promise<SomeResponse | undefined> {
  return request.get<SomeResponse, ApiResult<SomeResponse>>(`/some/api`, axiosRequestConfig)
}
```
