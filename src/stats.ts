import { max } from 'lodash';

interface Dictionary<T> {
  [key: string]: T;
}

interface NodeStat {
  name: string;
  statuses: ReqStatuses;
  rps: number;
  latencyp50: number;
  latencyp99: number;
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
  src: string;
  dest: string;
  statuses: ReqStatuses;
  rps: number;
  latencyp50: number;
  latencyp99: number;
}

export class Stats {
  nodeStats: Dictionary<NodeStat>;
  // A set of services that send data
  sends: Dictionary<boolean>;
  private rollUp?: RegExp;

  constructor(rollUp?: RegExp) {
    this.nodeStats = {};
    this.sends = {};
    this.rollUp = rollUp;
  }

  addNode(input: { name: string; online: number; offline: number; total: number; status: string }) {
    let name = this.getName(input.name);
    if (name) {
      this.nodeStats[name] = {
        name: name,
        dpStatus: input.status,
        dpOnline: input.online,
        dpOffline: input.offline,
        dpTotal: input.total,
        statuses: new ReqStatuses({ s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 }),
        rps: 0,
        latencyp50: 0,
        latencyp99: 0,
        edges: {},
      };
    }
  }

  private getName(name: string): string | undefined {
    if (!this.rollUp) {
      return name;
    }
    let r = name.match(this.rollUp);
    if (r == null) {
      return;
    }
    if (r.length >= 2) {
      return r[1];
    }
    return name;
  }

  private getNodeStats(name: string): NodeStat | undefined {
    let n = this.getName(name);
    if (n) {
      return this.nodeStats[n];
    }
    return;
  }

  populateEdge(data: any, fn: (labels: any, value: string, elt: EdgeStat) => void) {
    for (let { metric, value } of data) {
      const src = this.getNodeStats(metric['kuma_io_service']);
      const dest = this.getNodeStats(metric['envoy_cluster_name']);
      if (dest && src) {
        this.sends[src.name] = true;
        if (!dest.edges[src.name]) {
          dest.edges[src.name] = {
            src: src.name,
            dest: dest.name,
            latencyp50: 0,
            latencyp99: 0,
            rps: 0,
            statuses: new ReqStatuses({ s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 }),
          };
        }
        fn(metric, value[1], dest.edges[src.name]);
      }
    }
  }

  populateNode(data: any, fn: (labels: any, value: string, elt: NodeStat) => void) {
    for (let { metric, value } of data) {
      const srv = this.getNodeStats(metric['envoy_cluster_name']);
      if (srv) {
        fn(metric, value[1], srv);
      }
    }
  }

  populateGatewayNode(data: any, fn: (labels: any, value: string, elt: NodeStat) => void) {
    for (let { metric, value } of data) {
      const srv = this.getNodeStats(metric['kuma_io_service']);
      if (srv) {
        fn(metric, value[1], srv);
      }
    }
  }
}

export function processEdgePromQueries(stats: Stats, statusRes: any, rpsRes: any, lat50Res: any, lat99Res: any) {
  stats.populateEdge(statusRes, aggregateStatus);
  stats.populateEdge(rpsRes, addRequests);
  stats.populateEdge(lat50Res, addLatencyp50);
  stats.populateEdge(lat99Res, addLatencyp99);
}

export function processServicePromQueries(stats: Stats, statusRes: any, rpsRes: any, lat50Res: any, lat99Res: any) {
  stats.populateNode(statusRes, aggregateStatus);
  stats.populateNode(rpsRes, addRequests);
  stats.populateNode(lat50Res, addLatencyp50);
  stats.populateNode(lat99Res, addLatencyp99);
}

export function processGatewayPromQueries(stats: Stats, statusRes: any, rpsRes: any, lat50Res: any, lat99Res: any) {
  stats.populateGatewayNode(statusRes, aggregateStatus);
  stats.populateGatewayNode(rpsRes, addRequests);
  stats.populateGatewayNode(lat50Res, addLatencyp50);
  stats.populateGatewayNode(lat99Res, addLatencyp99);
}

function aggregateStatus(labels: any, value: string, elt: EdgeStat | NodeStat) {
  const s = labels['envoy_response_code_class'];
  if (s === '5') {
    elt.statuses.s5xx += Number(value);
  } else if (s === '4') {
    elt.statuses.s4xx += Number(value);
  } else if (s === '3') {
    elt.statuses.s3xx += Number(value);
  } else if (s === '2') {
    elt.statuses.s2xx += Number(value);
  }
}

function addRequests(labels: unknown, value: string, elt: EdgeStat | NodeStat) {
  elt.rps += Number(value);
}

function addLatencyp50(labels: unknown, value: string, elt: EdgeStat | NodeStat) {
  elt.latencyp50 = max([Number(value), elt.latencyp50]) || 0;
}

function addLatencyp99(labels: unknown, value: string, elt: EdgeStat | NodeStat) {
  elt.latencyp99 = max([Number(value), elt.latencyp99]) || 0;
}
