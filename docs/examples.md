# 生成案例

本文档提供 `kabu gen` 的常见输入输出案例。规则说明见 [生成策略](./strategy.md)。可复现完整模拟案例见 [example](../example/README.md)。

为了避免混淆，本文档说明中会区分以下类型角色：

| 类型角色 | 含义 | 生成命名示例 |
| --- | --- | --- |
| `RequestParams` | `path` 和 `query` 请求参数对象 | `GetTradeAfterSalePageParams` |
| `RequestBody` | 请求体 data | `PostMemberUserCreateBody` |
| `ResponseData` | 响应 data，也就是业务响应值 | `GetSystemAreaTreeResponse` |
| `ResolvedData` | 请求最终 resolve 的值 | 默认等同于 `ResponseData` |

示例中的 `request.get<GetSystemAreaTreeResponse, GetSystemAreaTreeResponse>` 是 axios 风格封装的写法。第一个 `GetSystemAreaTreeResponse` 是 `ResponseData`，第二个是 `ResolvedData`。`kabu` 默认假设响应拦截器已经把 `AxiosResponse<T>` 解包成业务响应值 `T`，所以默认生成时 `ResolvedData` 与 `ResponseData` 使用同一个类型。

## 无参数且无请求体

OpenAPI：

```text
GET /system/area/tree
```

生成结果：

```ts
export function getSystemAreaTree(
  axiosRequestConfig?: AxiosRequestConfig
): Promise<GetSystemAreaTreeResponse> {
  return request.get<GetSystemAreaTreeResponse, GetSystemAreaTreeResponse>(
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
): Promise<PostMemberAuthLogoutResponse> {
  return request.post<PostMemberAuthLogoutResponse, PostMemberAuthLogoutResponse>(
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
): Promise<GetTradeAfterSalePageResponse> {
  return request.get<GetTradeAfterSalePageResponse, GetTradeAfterSalePageResponse>(
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
): Promise<GetMemberUserListByIdResponse> {
  return request.get<GetMemberUserListByIdResponse, GetMemberUserListByIdResponse>(
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
): Promise<GetMemberUserByIdOrdersResponse> {
  return request.get<GetMemberUserByIdOrdersResponse, GetMemberUserByIdOrdersResponse>(
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
): Promise<PostMemberUserCreateResponse> {
  return request.post<
    PostMemberUserCreateResponse,
    PostMemberUserCreateResponse,
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
): Promise<PostPromotionCouponTakeResponse> {
  return request.post<
    PostPromotionCouponTakeResponse,
    PostPromotionCouponTakeResponse,
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
): Promise<PutMemberUserByIdResponse> {
  return request.put<
    PutMemberUserByIdResponse,
    PutMemberUserByIdResponse,
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
): Promise<PatchMemberUserByIdResponse> {
  return request.patch<
    PatchMemberUserByIdResponse,
    PatchMemberUserByIdResponse,
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
): Promise<DeleteTradeAfterSaleCancelResponse> {
  return request.delete<
    DeleteTradeAfterSaleCancelResponse,
    DeleteTradeAfterSaleCancelResponse
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
): Promise<DeleteMemberUserByIdResponse> {
  return request.delete<
    DeleteMemberUserByIdResponse,
    DeleteMemberUserByIdResponse,
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
kabu gen ./openapi \
  --file-header "import type { AxiosRequestConfig } from 'axios'\nimport request from '@/request'" \
  --rewrite-prefix /a/b=/c/a/c \
  --rewrite-prefix /a=/c/a/b
```

生成路径：

```text
/a/b/user -> /c/a/c/user
/a/user   -> /c/a/b/user
```

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
```
