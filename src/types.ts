import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface KumaQuery extends DataQuery {
  type: string;
  mesh: string;
  zone?: string;
}

export const MeshGraphQType = 'mesh-graph';
export const MeshesQType = 'meshes';
export const ZonesQType = 'zones';
export const queryTypes = [MeshGraphQType, ZonesQType, MeshesQType];

export const defaultQuery: Partial<KumaQuery> = {
  queryType: MeshGraphQType,
  mesh: 'default',
};

/**
 * These are options configured for each DataSource instance
 */
export interface KumaDataSourceOptions extends DataSourceJsonData {
  url?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface KumaSecureJsonData {
  apiKey?: string;
}
