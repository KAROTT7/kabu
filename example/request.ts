import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'

interface ApiResult<T> {
  code: number | string
  msg?: string
  message?: string
  data: T
}

interface RequestInstance {
  get<ResolvedData, RawResponse = ApiResult<ResolvedData>>(
    url: string,
    config?: AxiosRequestConfig
  ): Promise<ResolvedData | undefined>
  delete<ResolvedData, RawResponse = ApiResult<ResolvedData>, RequestBody = unknown>(
    url: string,
    config?: AxiosRequestConfig<RequestBody>
  ): Promise<ResolvedData | undefined>
  post<ResolvedData, RawResponse = ApiResult<ResolvedData>, RequestBody = unknown>(
    url: string,
    data?: RequestBody,
    config?: AxiosRequestConfig<RequestBody>
  ): Promise<ResolvedData | undefined>
  put<ResolvedData, RawResponse = ApiResult<ResolvedData>, RequestBody = unknown>(
    url: string,
    data?: RequestBody,
    config?: AxiosRequestConfig<RequestBody>
  ): Promise<ResolvedData | undefined>
  patch<ResolvedData, RawResponse = ApiResult<ResolvedData>, RequestBody = unknown>(
    url: string,
    data?: RequestBody,
    config?: AxiosRequestConfig<RequestBody>
  ): Promise<ResolvedData | undefined>
  interceptors: AxiosInstance['interceptors']
}

const axiosRequest = axios.create({
  timeout: 10000
})

function isSuccessCode(code: ApiResult<unknown>['code']): boolean {
  return code === 0 || code === '0' || code === 200 || code === '200'
}

// 运行时仍然是 axios 实例；这里用类型包装把方法泛型调整成 <ResolvedData, RawResponse> 的项目约定。
function unwrapApiResponse(response: AxiosResponse<ApiResult<unknown>>): any {
  const result = response.data as ApiResult<unknown>
  if (isSuccessCode(result.code)) return result.data

  const message = result.msg || result.message || '接口请求失败'
  console.warn(message)
  return undefined
}

axiosRequest.interceptors.response.use(unwrapApiResponse)

const request = axiosRequest as unknown as RequestInstance

export default request
