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

export class Stats {
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

export function processEdgePromQueries(stats: Stats, statusRes: any, rpsRes: any, lat50Res: any, lat99Res: any) {
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
}

export function processServicePromQueries(stats: Stats, statusRes: any, rpsRes: any, lat50Res: any, lat99Res: any) {
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
