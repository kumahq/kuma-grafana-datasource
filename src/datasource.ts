import { DataSourceInstanceSettings } from '@grafana/data';
import { DataSourceWithBackend } from '@grafana/runtime';
import { KumaDataSourceOptions, KumaQuery } from './types';

export class DataSource extends DataSourceWithBackend<KumaQuery, KumaDataSourceOptions> {
  constructor(instanceSettings: DataSourceInstanceSettings<KumaDataSourceOptions>) {
    super(instanceSettings);
  }
}
