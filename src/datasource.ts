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
import { DataSourceWithBackend, FetchResponse, getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { KumaDataSourceOptions, KumaQuery, MeshGraphQType } from './types';
import { from, Observable } from 'rxjs';

interface Dictionary<T> {
  [key: string]: T;
}

interface NodeStat {
  statuses: ReqStatuses;
  rps: string;
  latencyp50: string;
  latencyp99: string;
  edges: Dictionary<EdgeStat>;
  dpStatus: string;
  dpOnline: number;
  dpOffline: number;
  dpTotal: number;
}

class ReqStatuses {
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;

  constructor(props: any) {
    this.s2xx = props.s2xx;
    this.s3xx = props.s3xx;
    this.s4xx = props.s4xx;
    this.s5xx = props.s5xx;
  }

  slo(): number {
    const total = this.total();
    if (total === 0) {
      return 100;
    }
    return Math.round(((total - this.s5xx) * 100) / total);
  }

  total(): number {
    return this.s2xx + this.s3xx + this.s4xx + this.s5xx;
  }

  ratio(t: 's2xx' | 's3xx' | 's4xx' | 's5xx'): number {
    const total = this.total();
    if (total === 0) {
      return t === 's2xx' ? 1 : 0;
    }
    return Math.round((this[t] * 100) / total) / 100;
  }

  summary(): string {
    return `${this.s2xx}/${this.s3xx}/${this.s4xx}/${this.s5xx}/${this.total()}`;
  }
}

interface EdgeStat {
  dest: string;
  statuses: ReqStatuses;
  rps: string;
  latencyp50: string;
  latencyp99: string;
}

function emptyEdge(dest: string): EdgeStat {
  return {
    dest: dest,
    latencyp50: 'N/A',
    latencyp99: 'N/A',
    rps: '0',
    statuses: new ReqStatuses({ s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 }),
  };
}

class Stats {
  nodeStats: Dictionary<NodeStat>;
  // A set that indicates that this service receives data.
  sends: Dictionary<boolean>;

  constructor() {
    this.nodeStats = {};
    this.sends = {};
  }

  addNode(input: { name: string; online: number; offline: number; total: number; status: string }) {
    this.nodeStats[input.name] = {
      dpStatus: input.status,
      dpOnline: input.online,
      dpOffline: input.offline,
      dpTotal: input.total,
      statuses: new ReqStatuses({ s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 }),
      rps: '0',
      latencyp50: 'N/A',
      latencyp99: 'N/A',
      edges: {},
    };
  }

  populateEdge(data: any, fn: (labels: any, value: string, elt: EdgeStat) => void) {
    for (let { metric, value } of data) {
      const src = metric['kuma_io_service'];
      const dest = metric['envoy_cluster_name'];
      if (this.nodeStats[dest] && this.nodeStats[src]) {
        this.sends[src] = true;
        if (!this.nodeStats[dest].edges[src]) {
          this.nodeStats[dest].edges[src] = emptyEdge(src);
        }
        fn(metric, value[1], this.nodeStats[dest].edges[src]);
      }
    }
  }

  populateNode(data: any, fn: (labels: any, value: string, elt: NodeStat) => void) {
    for (let { metric, value } of data) {
      const srv = metric['envoy_cluster_name'];
      if (this.nodeStats[srv]) {
        fn(metric, value[1], this.nodeStats[srv]);
      }
    }
  }
}

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
  private prometheusDs: string | undefined;

  constructor(instanceSettings: DataSourceInstanceSettings<KumaDataSourceOptions>) {
    super(instanceSettings);
    this.prometheusDs = instanceSettings.jsonData.prometheusDataSourceId;
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
    let selector = `mesh="${mesh}"`;
    if (zone) {
      selector = `mesh="${mesh}",zone="${zone}"`;
    }
    try {
      let stats = await this.postResource('services', { mesh: mesh }).then((r) => {
        const out = new Stats();
        for (let s of r.services) {
          out.addNode(s);
        }
        return out;
      });
      await Promise.all([
        this.postResource('services', { mesh: mesh }).then((r) => r.services),
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
          stats.populateEdge(statusRes, aggregateStatus);
          stats.populateEdge(rpsRes, (labels: any, value: string, elt: EdgeStat) => {
            elt.rps = value;
          });
          stats.populateEdge(lat50Res, (labels: any, value: string, elt: EdgeStat) => {
            elt.latencyp50 = value;
          });
          stats.populateEdge(lat99Res, (labels: any, value: string, elt: EdgeStat) => {
            elt.latencyp99 = value;
          });
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
          stats.populateNode(statusRes, aggregateStatus);
          stats.populateNode(rpsRes, (labels: any, value: string, elt: NodeStat) => {
            elt.rps = value;
          });
          stats.populateNode(lat50Res, (labels: any, value: string, elt: NodeStat) => {
            elt.latencyp50 = value;
          });
          stats.populateNode(lat99Res, (labels: any, value: string, elt: NodeStat) => {
            elt.latencyp99 = value;
          });
        }),
      ]);

      const nodeDf = assembleNodeDf(stats);
      const edgeDf = assembleEdgeDf(stats);
      return { data: [nodeDf, edgeDf], error: undefined, key: '', state: undefined };
    } catch (e) {
      console.error('failed', e);
      return { data: [], key: request.requestId, state: LoadingState.Error, error: e };
    }
  }

  private async sendPromQuery(q: string, t: number): Promise<any> {
    return getBackendSrv()
      .fetch({
        url: `/api/datasources/proxy/${this.prometheusDs}/api/v1/query`,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data: { query: q, time: t / 1000 },
      })
      .toPromise()
      .then((res: FetchResponse) => {
        if (res.status === 200) {
          if (res.data.status === 'success') {
            return res.data.data.result;
          }
          throw new Error(`Prom query failed body: ${res.data}`);
        } else {
          throw new Error(`Failed with status ${res.status} body: ${res.data}`);
        }
      });
  }
}

function aggregateStatus(labels: any, value: string, elt: EdgeStat | NodeStat) {
  const s = labels['envoy_response_code_class'];
  if (s === '5') {
    elt.statuses.s5xx = Number(value);
  } else if (s === '4') {
    elt.statuses.s4xx = Number(value);
  } else if (s === '3') {
    elt.statuses.s3xx = Number(value);
  } else if (s === '2') {
    elt.statuses.s2xx = Number(value);
  }
}
