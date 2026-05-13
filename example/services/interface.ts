/** 通用接口类型（由 OpenAPI 自动提取） */

export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

