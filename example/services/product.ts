import type { AxiosRequestConfig } from 'axios'
import request from '../request'

/** 模拟商品服务接口（由 OpenAPI 自动提取） */

export interface ProductConfig {
  /** 是否开启商品模块 */
  enabled: boolean
  /** 默认货币 */
  defaultCurrency: string
  /** 支持的商品类型 */
  supportTypes: ProductCategoryType[]
}

export interface SyncTask {
  /** 同步任务 ID */
  taskId: string
  /** 是否已受理 */
  accepted: boolean
}

export type ProductDetail = ProductRecord & { description: string; attributes?: Record<string, string>; skus: ProductSku[] }

export interface DeleteProductRequest {
  /** 删除原因 */
  reason: string
}

export interface ProductLog {
  /** 日志 ID */
  id: number
  /** 日志等级 */
  level: 'info' | 'warning' | 'error'
  /** 日志内容 */
  content: string
  /** 操作人 */
  operator?: string
  /** 创建时间 */
  createdAt: string
}

export interface UpdateProductPriceRequest {
  /** 销售价 */
  salePrice: number
  /** 市场价 */
  marketPrice?: number
}

export interface UpdateProductStatusRequest {
  status: ProductStatus
  /** 操作备注 */
  remark?: string
}

export interface CreateProductRequest {
  /** SPU 编码 */
  spuCode: string
  /** 商品名称 */
  name: string
  categoryType: ProductCategoryType
  /** 销售价 */
  salePrice: number
  /** SKU 列表 */
  skus: CreateProductSku[]
}

export interface ProductRecord {
  /** 商品 ID */
  id: number
  /** SPU 编码 */
  spuCode: string
  /** 商品名称 */
  name: string
  categoryType: ProductCategoryType
  status: ProductStatus
  /** 销售价 */
  salePrice: number
  /** 创建时间 */
  createdAt: string
  /** 归档时间 */
  archivedAt?: string | null
}

export interface ExportProductRequest {
  status?: ProductStatus
  /** 创建时间范围 */
  createdAtRange?: [string, string]
}

export interface ExportTask {
  /** 导出任务 ID */
  taskId: string
  /** 下载地址 */
  downloadUrl: string
}

export type ProductStatus = 'draft' | 'on_sale' | 'off_sale' | 'archived'

export interface ProductPage {
  /** 总数 */
  total: number
  /** 商品列表 */
  list: ProductRecord[]
}

export type ProductCategoryType = 'physical' | 'virtual' | 'bundle'

export interface ProductSku {
  /** SKU ID */
  skuId: number
  /** SKU 名称 */
  skuName: string
  /** 库存 */
  stock: number
  /** SKU 价格 */
  price: number
}

export interface CreateProductSku {
  /** SKU 名称 */
  skuName: string
  /** 库存 */
  stock: number
  /** SKU 价格 */
  price: number
}

export type GetProductCatalogConfigResponse = ProductConfig

/**
 * 获取商品配置
 * GET /api/product/catalog/config
 */
export function getProductCatalogConfig(axiosRequestConfig?: AxiosRequestConfig): Promise<GetProductCatalogConfigResponse> {
  return request.get<GetProductCatalogConfigResponse, GetProductCatalogConfigResponse>(`/api/product/catalog/config`, axiosRequestConfig)
}

export type PostProductCatalogSyncResponse = SyncTask

/**
 * 同步商品目录
 * POST /api/product/catalog/sync
 */
export function postProductCatalogSync(axiosRequestConfig?: AxiosRequestConfig): Promise<PostProductCatalogSyncResponse> {
  return request.post<PostProductCatalogSyncResponse, PostProductCatalogSyncResponse>(`/api/product/catalog/sync`, undefined, axiosRequestConfig)
}

export type GetProductItemByIdResponse = ProductDetail

/**
 * 查询商品详情
 * GET /api/product/item/{id}
 */
export function getProductItemById(id: string | number, axiosRequestConfig?: AxiosRequestConfig): Promise<GetProductItemByIdResponse> {
  return request.get<GetProductItemByIdResponse, GetProductItemByIdResponse>(`/api/product/item/${id}`, axiosRequestConfig)
}

export type DeleteProductItemByIdBody = DeleteProductRequest

export type DeleteProductItemByIdResponse = boolean

/**
 * 删除商品并记录原因
 * DELETE /api/product/item/{id}
 */
export function deleteProductItemById(id: string | number, data: DeleteProductItemByIdBody, axiosRequestConfig?: AxiosRequestConfig<DeleteProductItemByIdBody>): Promise<DeleteProductItemByIdResponse> {
  return request.delete<DeleteProductItemByIdResponse, DeleteProductItemByIdResponse, DeleteProductItemByIdBody>(`/api/product/item/${id}`, { ...axiosRequestConfig, data })
}

export interface GetProductItemByIdLogsParams {
  /** 日志等级 */
  level?: 'info' | 'warning' | 'error'
  /** 操作人 */
  operator?: string
}

export type GetProductItemByIdLogsResponse = ProductLog[]

/**
 * 查询商品操作日志
 * GET /api/product/item/{id}/logs
 */
export function getProductItemByIdLogs(id: string | number, params: GetProductItemByIdLogsParams, axiosRequestConfig?: AxiosRequestConfig): Promise<GetProductItemByIdLogsResponse> {
  return request.get<GetProductItemByIdLogsResponse, GetProductItemByIdLogsResponse>(`/api/product/item/${id}/logs`, { ...axiosRequestConfig, params })
}

export type PutProductItemByIdPriceBody = UpdateProductPriceRequest

export type PutProductItemByIdPriceResponse = ProductDetail

/**
 * 修改商品价格
 * PUT /api/product/item/{id}/price
 */
export function putProductItemByIdPrice(id: string | number, data: PutProductItemByIdPriceBody, axiosRequestConfig?: AxiosRequestConfig<PutProductItemByIdPriceBody>): Promise<PutProductItemByIdPriceResponse> {
  return request.put<PutProductItemByIdPriceResponse, PutProductItemByIdPriceResponse, PutProductItemByIdPriceBody>(`/api/product/item/${id}/price`, data, axiosRequestConfig)
}

export interface PatchProductItemByIdStatusParams {
  /** 是否通知订阅用户 */
  notify?: boolean
}

export type PatchProductItemByIdStatusBody = UpdateProductStatusRequest

export type PatchProductItemByIdStatusResponse = ProductDetail

/**
 * 修改商品状态
 * PATCH /api/product/item/{id}/status
 */
export function patchProductItemByIdStatus(id: string | number, params: PatchProductItemByIdStatusParams, data: PatchProductItemByIdStatusBody, axiosRequestConfig?: AxiosRequestConfig<PatchProductItemByIdStatusBody>): Promise<PatchProductItemByIdStatusResponse> {
  return request.patch<PatchProductItemByIdStatusResponse, PatchProductItemByIdStatusResponse, PatchProductItemByIdStatusBody>(`/api/product/item/${id}/status`, data, { ...axiosRequestConfig, params })
}

export type PostProductItemCreateBody = CreateProductRequest

export type PostProductItemCreateResponse = ProductRecord

/**
 * 创建商品
 * POST /api/product/item/create
 */
export function postProductItemCreate(data: PostProductItemCreateBody, axiosRequestConfig?: AxiosRequestConfig<PostProductItemCreateBody>): Promise<PostProductItemCreateResponse> {
  return request.post<PostProductItemCreateResponse, PostProductItemCreateResponse, PostProductItemCreateBody>(`/api/product/item/create`, data, axiosRequestConfig)
}

export interface DeleteProductItemDeleteParams {
  /** 商品 ID */
  id: number
  /** 是否静默删除 */
  silent?: boolean
}

export type DeleteProductItemDeleteResponse = boolean

/**
 * 按查询参数删除商品
 * DELETE /api/product/item/delete
 */
export function deleteProductItemDelete(params: DeleteProductItemDeleteParams, axiosRequestConfig?: AxiosRequestConfig): Promise<DeleteProductItemDeleteResponse> {
  return request.delete<DeleteProductItemDeleteResponse, DeleteProductItemDeleteResponse>(`/api/product/item/delete`, { ...axiosRequestConfig, params })
}

export interface PostProductItemExportParams {
  /** 导出格式 */
  format: 'xlsx' | 'csv'
}

export type PostProductItemExportBody = ExportProductRequest

export type PostProductItemExportResponse = ExportTask

/**
 * 导出商品
 * POST /api/product/item/export
 */
export function postProductItemExport(params: PostProductItemExportParams, data: PostProductItemExportBody, axiosRequestConfig?: AxiosRequestConfig<PostProductItemExportBody>): Promise<PostProductItemExportResponse> {
  return request.post<PostProductItemExportResponse, PostProductItemExportResponse, PostProductItemExportBody>(`/api/product/item/export`, data, { ...axiosRequestConfig, params })
}

export interface GetProductItemPageParams {
  /** 页码 */
  pageNo: number
  /** 每页数量 */
  pageSize: number
  /** 商品状态 */
  status?: ProductStatus
  /** 商品名称或编码 */
  keyword?: string
}

export type GetProductItemPageResponse = ProductPage

/**
 * 分页查询商品
 * GET /api/product/item/page
 */
export function getProductItemPage(params: GetProductItemPageParams, axiosRequestConfig?: AxiosRequestConfig): Promise<GetProductItemPageResponse> {
  return request.get<GetProductItemPageResponse, GetProductItemPageResponse>(`/api/product/item/page`, { ...axiosRequestConfig, params })
}

