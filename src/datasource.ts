import {
  DataFrame,
  DataQueryRequest,
  DataQueryResponse,
  DataSourceInstanceSettings,
  FieldColorModeId,
  FieldType,
  LoadingState,
  MutableDataFrame,
} from '@grafana/data';
import { DataSourceWithBackend, getTemplateSrv, toDataQueryError } from '@grafana/runtime';
import { PrometheusDatasource } from 'prometheus/datasource';
import { from, Observable } from 'rxjs';
import { processEdgePromQueries, processGatewayPromQueries, processServicePromQueries, Stats } from './stats';
import { KumaDataSourceOptions, KumaQuery, MeshGraphQType } from './types';

function assembleNodeDf(serviceStats: Stats): DataFrame {
  const df = new MutableDataFrame();
  df.name = 'nodes';
  df.meta = { preferredVisualisationType: 'nodeGraph' };

  df.addField({ name: 'id', type: FieldType.string });
  df.addField({ name: 'title', type: FieldType.string, config: { displayName: 'Name' } });
  df.addField({
    name: 'arc__2xx',
    type: FieldType.number,
    config: { displayName: '2xx', color: { fixedColor: 'green', mode: FieldColorModeId.Fixed } },
  });
  df.addField({
    name: 'arc__3xx',
    type: FieldType.number,
    config: { displayName: '3xx', color: { fixedColor: 'yellow', mode: FieldColorModeId.Fixed } },
  });
  df.addField({
    name: 'arc__4xx',
    type: FieldType.number,
    config: { displayName: '4xx', color: { fixedColor: 'orange', mode: FieldColorModeId.Fixed } },
  });
  df.addField({
    name: 'arc__5xx',
    type: FieldType.number,
    config: { displayName: '5xx', color: { fixedColor: 'red', mode: FieldColorModeId.Fixed } },
  });
  df.addField({
    name: 'mainStat',
    type: FieldType.number,
    config: { displayName: 'Requests per sec', unit: 'req/s', decimals: 2 },
  });
  df.addField({
    name: 'secondaryStat',
    type: FieldType.number,
    config: { displayName: 'SLO ((all-5xx)/all) * 100', unit: '%' },
  });
  df.addField({ name: 'detail__status', type: FieldType.string, config: { displayName: 'status' } });
  df.addField({
    name: 'detail__stats',
    type: FieldType.string,
    config: { displayName: 'dataplane online/offline/total' },
  });
  df.addField({
    name: 'detail__requests',
    type: FieldType.string,
    config: { displayName: 'request count 2xx/3xx/4xx/5xx/total' },
  });
  df.addField({ name: 'detail__p50', type: FieldType.number, config: { displayName: 'latency p50', unit: 'ms' } });
  df.addField({ name: 'detail__p99', type: FieldType.number, config: { displayName: 'latency p99', unit: 'ms' } });
  for (let name in serviceStats.nodeStats) {
    const st = serviceStats.nodeStats[name];
    if (Object.keys(st.edges).length > 0 || serviceStats.sends[name]) {
      df.appendRow([
        name,
        name,
        st.statuses.ratio('s2xx'),
        st.statuses.ratio('s3xx'),
        st.statuses.ratio('s4xx'),
        st.statuses.ratio('s5xx'),
        st.rps,
        st.statuses.slo(),
        status,
        `${st.dpOnline}/${st.dpOffline}/${st.dpTotal}`,
        st.statuses.summary(),
        st.latencyp50,
        st.latencyp99,
      ]);
    }
  }
  return df;
}

function assembleEdgeDf(serviceStats: Stats): DataFrame {
  const df = new MutableDataFrame();
  df.name = 'edges';
  df.meta = { preferredVisualisationType: 'nodeGraph' };

  df.addField({ name: 'id', type: FieldType.string });
  df.addField({ name: 'source', type: FieldType.string, config: { displayName: 'Source' } });
  df.addField({ name: 'target', type: FieldType.string, config: { displayName: 'Target' } });
  df.addField({
    name: 'mainStat',
    type: FieldType.number,
    config: { displayName: 'Requests per sec', unit: 'req/s', decimals: 2 },
  });
  df.addField({
    name: 'secondaryStat',
    type: FieldType.number,
    config: { displayName: 'SLO ((all-5xx)/all) * 100', unit: '%' },
  });
  df.addField({
    name: 'detail__requests',
    type: FieldType.string,
    config: { displayName: 'request count 2xx/3xx/4xx/5xx/total' },
  });
  df.addField({ name: 'detail__p50', type: FieldType.number, config: { displayName: 'latency p50', unit: 'ms' } });
  df.addField({ name: 'detail__p99', type: FieldType.number, config: { displayName: 'latency p99', unit: 'ms' } });
  for (let targetName in serviceStats.nodeStats) {
    let targetStats = serviceStats.nodeStats[targetName];
    for (let srcName in targetStats.edges) {
      let edgeStat = targetStats.edges[srcName];
      df.appendRow([
        `${srcName}->${targetName}`,
        srcName,
        targetName,
        edgeStat.rps,
        edgeStat.statuses.slo(),
        edgeStat.statuses.summary(),
        edgeStat.latencyp50,
        edgeStat.latencyp99,
      ]);
    }
  }
  return df;
}

export class DataSource extends DataSourceWithBackend<KumaQuery, KumaDataSourceOptions> {
  private prometheusDs: PrometheusDatasource;

  constructor(instanceSettings: DataSourceInstanceSettings<KumaDataSourceOptions>) {
    super(instanceSettings);
    this.prometheusDs = new PrometheusDatasource(instanceSettings.jsonData.prometheusDataSourceUid);
  }

  query(request: DataQueryRequest<KumaQuery>): Observable<DataQueryResponse> {
    if (request.targets.length === 1 && request.targets[0].queryType === MeshGraphQType) {
      return from(this.meshGraphQuery(request));
    } else {
      return super.query(request);
    }
  }

  private async meshGraphQuery(request: DataQueryRequest<KumaQuery>): Promise<DataQueryResponse> {
    let interval = (request.intervalMs - (request.intervalMs % 60000)) / 60000;
    if (interval === 0) {
      interval = 1;
    }
    const mesh = getTemplateSrv().replace(request.targets[0].mesh, request.scopedVars);
    const zone = getTemplateSrv().replace(request.targets[0].zone, request.scopedVars);
    const rollup = getTemplateSrv().replace(request.targets[0].rollupRegEx, request.scopedVars);
    // Add a bunch
    let selector = `mesh="${mesh}",envoy_cluster_name!~"^localhost_[0-9]+$",envoy_cluster_name!="ads_cluster",envoy_cluster_name!="kuma_envoy_admin"`;
    if (zone) {
      selector = `${selector},kuma_io_zone=~"${zone}"`;
    }
    let gatewaySelector = `mesh="${mesh}",kuma_io_mesh_gateway!="",kuma_io_mesh_traffic="true"`;
    if (zone) {
      gatewaySelector = `${gatewaySelector},kuma_io_zone=~"${zone}"`;
    }
    try {
      let stats = await this.postResource('services', { mesh: mesh }).then((r) => {
        const out = new Stats(new RegExp(rollup));
        for (let s of r.services) {
          out.addNode(s);
        }
        return out;
      });
      await Promise.all([
        // Query for edges
        Promise.all([
          this.sendPromQuery(
            `sum by (kuma_io_service,envoy_cluster_name,envoy_response_code_class) (round(increase(envoy_cluster_upstream_rq_xx{${selector}}[${interval}m]))) != 0`,
            request.startTime
          ),
          this.sendPromQuery(
            `sum by (kuma_io_service,envoy_cluster_name) (rate(envoy_cluster_upstream_rq_total{${selector}}[${interval}m])) != 0`,
            request.startTime
          ),
          this.sendPromQuery(
            `ceil(histogram_quantile(0.5, sum by (kuma_io_service, envoy_cluster_name, le) (rate(envoy_cluster_upstream_rq_time_bucket{${selector}}[${interval}m]))))`,
            request.startTime
          ),
          this.sendPromQuery(
            `ceil(histogram_quantile(0.99, sum by (kuma_io_service, envoy_cluster_name, le) (rate(envoy_cluster_upstream_rq_time_bucket{${selector}}[${interval}m]))))`,
            request.startTime
          ),
        ]).then((res) => {
          const [statusRes, rpsRes, lat50Res, lat99Res] = res;
          processEdgePromQueries(stats, statusRes, rpsRes, lat50Res, lat99Res);
        }),
        // Query for services
        Promise.all([
          this.sendPromQuery(
            `sum by (envoy_cluster_name,envoy_response_code_class) (round(increase(envoy_cluster_upstream_rq_xx{${selector}}[${interval}m]))) != 0`,
            request.startTime
          ),
          this.sendPromQuery(
            `sum by (envoy_cluster_name) (rate(envoy_cluster_upstream_rq_total{${selector}}[${interval}m])) != 0`,
            request.startTime
          ),
          this.sendPromQuery(
            `ceil(histogram_quantile(0.5, sum by (envoy_cluster_name, le) (rate(envoy_cluster_upstream_rq_time_bucket{${selector}}[${interval}m]))))`,
            request.startTime
          ),
          this.sendPromQuery(
            `ceil(histogram_quantile(0.99, sum by (envoy_cluster_name, le) (rate(envoy_cluster_upstream_rq_time_bucket{${selector}}[${interval}m]))))`,
            request.startTime
          ),
        ]).then((res) => {
          const [statusRes, rpsRes, lat50Res, lat99Res] = res;
          processServicePromQueries(stats, statusRes, rpsRes, lat50Res, lat99Res);
        }),
        // Gateways
        Promise.all([
          this.sendPromQuery(
            `sum by (kuma_io_service, envoy_response_code_class) (round(increase(envoy_http_downstream_rq_xx{${gatewaySelector}}[${interval}m]))) != 0`,
            request.startTime
          ),
          this.sendPromQuery(
            `sum by (kuma_io_service) (rate(envoy_http_downstream_rq_total{${gatewaySelector}}[${interval}m])) != 0`,
            request.startTime
          ),
          this.sendPromQuery(
            `ceil(histogram_quantile(0.5, sum by (kuma_io_service, le) (rate(envoy_http_downstream_rq_time_bucket{${gatewaySelector}}[${interval}m]))))`,
            request.startTime
          ),
          this.sendPromQuery(
            `ceil(histogram_quantile(0.99, sum by (kuma_io_service, le) (rate(envoy_http_downstream_rq_time_bucket{${gatewaySelector}}[${interval}m]))))`,
            request.startTime
          ),
        ]).then((res) => {
          const [statusRes, rpsRes, lat50Res, lat99Res] = res;
          processGatewayPromQueries(stats, statusRes, rpsRes, lat50Res, lat99Res);
        }),
      ]);

      const nodeDf = assembleNodeDf(stats);
      const edgeDf = assembleEdgeDf(stats);
      return { data: [nodeDf, edgeDf], error: undefined, key: '', state: undefined };
    } catch (e) {
      console.error('failed', e);
      return { data: [], key: request.requestId, state: LoadingState.Error, error: toDataQueryError(e as any) };
    }
  }

  private async sendPromQuery(q: string, t: number): Promise<any> {
    return this.prometheusDs.sendInstantQuery({ query: q, time: t / 1000 });
  }
}
