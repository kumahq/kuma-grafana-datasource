import { processEdgePromQueries, processServicePromQueries, Stats } from 'stats';

test('processEdgePromQueries', () => {
  const stats = new Stats();
  const srvs = [
    { name: 'srv1', status: 'online', online: 3, offline: 0, total: 3 },
    { name: 'srv2', status: 'online', online: 3, offline: 0, total: 3 },
    { name: 'srv3', status: 'online', online: 1, offline: 0, total: 1 },
    { name: 'srv4', status: 'online', online: 1, offline: 0, total: 1 },
  ];
  for (const srv of srvs) {
    stats.addNode(srv);
  }
  const status = [
    {
      metric: { envoy_cluster_name: 'srv1', envoy_response_code_class: '2' },
      value: [1631800504.203, '245'],
    },
    {
      metric: { envoy_cluster_name: 'srv2', envoy_response_code_class: '2' },
      value: [1631800504.203, '363'],
    },
    {
      metric: { envoy_cluster_name: 'srv3', envoy_response_code_class: '2' },
      value: [1631800504.203, '189'],
    },
    {
      metric: { envoy_cluster_name: 'srv1', envoy_response_code_class: '5' },
      value: [1631800504.203, '180'],
    },
  ];
  const rps = [
    { metric: { envoy_cluster_name: 'srv1' }, value: [1631800504.203, '0.5777777777777777'] },
    { metric: { envoy_cluster_name: 'srv2' }, value: [1631800504.203, '13.066666666666668'] },
    { metric: { envoy_cluster_name: 'srv3' }, value: [1631800504.203, '0.6000000000000001'] },
  ];
  const lat50 = [
    { metric: { envoy_cluster_name: 'srv1' }, value: [1631800504.203, '3'] },
    { metric: { envoy_cluster_name: 'srv2' }, value: [1631800504.203, '4'] },
    { metric: { envoy_cluster_name: 'srv3' }, value: [1631800504.203, 'NaN'] },
    { metric: { envoy_cluster_name: 'srv4' }, value: [1631800504.203, 'NaN'] },
    { metric: { envoy_cluster_name: 'srv5' }, value: [1631800504.203, 'NaN'] },
  ];
  const lat99 = [
    { metric: { envoy_cluster_name: 'srv1' }, value: [1631800504.203, '10'] },
    { metric: { envoy_cluster_name: 'srv2' }, value: [1631800504.203, '50'] },
    { metric: { envoy_cluster_name: 'srv3' }, value: [1631800504.203, 'NaN'] },
    { metric: { envoy_cluster_name: 'srv4' }, value: [1631800504.203, 'NaN'] },
    { metric: { envoy_cluster_name: 'srv5' }, value: [1631800504.203, 'NaN'] },
  ];
  processServicePromQueries(stats, status, rps, lat50, lat99);

  const status2 = [
    {
      metric: { envoy_cluster_name: 'srv1', envoy_response_code_class: '2', kuma_io_service: 'srv2' },
      value: [1631800504.203, '179'],
    },
    {
      metric: { envoy_cluster_name: 'srv1', envoy_response_code_class: '2', kuma_io_service: 'srv4' },
      value: [1631800504.203, '179'],
    },
    {
      metric: { envoy_cluster_name: 'srv3', envoy_response_code_class: '2', kuma_io_service: 'srv2' },
      value: [1631800504.203, '179'],
    },
  ];
  const rps2 = [
    {
      metric: { envoy_cluster_name: 'srv1', kuma_io_service: 'srv2' },
      value: [1631800504.203, '3'],
    },
    {
      metric: { envoy_cluster_name: 'srv1', kuma_io_service: 'srv4' },
      value: [1631800504.203, '4'],
    },
    {
      metric: { envoy_cluster_name: 'srv3', kuma_io_service: 'srv2' },
      value: [1631800504.203, '10'],
    },
  ];
  const lat502 = [
    {
      metric: { envoy_cluster_name: 'srv1', kuma_io_service: 'srv2' },
      value: [1631800504.203, '3'],
    },
    {
      metric: { envoy_cluster_name: 'srv1', kuma_io_service: 'srv4' },
      value: [1631800504.203, '4'],
    },
    {
      metric: { envoy_cluster_name: 'srv3', kuma_io_service: 'srv2' },
      value: [1631800504.203, 'NaN'],
    },
  ];
  const lat992 = [
    {
      metric: { envoy_cluster_name: 'srv1', kuma_io_service: 'srv2' },
      value: [1631800504.203, '10'],
    },
    {
      metric: { envoy_cluster_name: 'srv1', kuma_io_service: 'srv4' },
      value: [1631800504.203, '20'],
    },
    {
      metric: { envoy_cluster_name: 'srv3', kuma_io_service: 'srv2' },
      value: [1631800504.203, 'NaN'],
    },
  ];
  processEdgePromQueries(stats, status2, rps2, lat502, lat992);
  expect(stats.sends).toEqual({ srv2: true, srv4: true });
  expect(stats.nodeStats['srv1'].statuses).toEqual({ s2xx: 245, s3xx: 0, s4xx: 0, s5xx: 180 });
  expect(stats.nodeStats['srv2'].statuses).toEqual({ s2xx: 363, s3xx: 0, s4xx: 0, s5xx: 0 });
  expect(stats.nodeStats['srv3'].statuses).toEqual({ s2xx: 189, s3xx: 0, s4xx: 0, s5xx: 0 });
  expect(stats.nodeStats['srv4'].statuses).toEqual({ s2xx: 0, s3xx: 0, s4xx: 0, s5xx: 0 });
  expect(stats.nodeStats['srv1'].edges['srv2']).toBeTruthy();
  expect(stats.nodeStats['srv1'].edges['srv4']).toBeTruthy();
  expect(stats.nodeStats['srv2'].edges).toEqual({});
  expect(stats.nodeStats['srv3'].edges['srv2']).toBeTruthy();
  expect(stats.nodeStats['srv4'].edges).toEqual({});
});

test('with rollup', () => {
  const stats = new Stats(/(.+)(_srv_[0-9]+)/);
  const srvs = [
    { name: 'srv1_srv_1', status: 'online', online: 3, offline: 0, total: 3 },
    { name: 'srv1_srv_2', status: 'online', online: 3, offline: 0, total: 3 },
    { name: 'srv3_srv_1', status: 'online', online: 1, offline: 0, total: 1 },
    { name: 'srv4', status: 'online', online: 1, offline: 0, total: 1 },
  ];
  for (const srv of srvs) {
    stats.addNode(srv);
  }
  const status = [
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', envoy_response_code_class: '2' },
      value: [1631800504.203, '245'],
    },
    {
      metric: { envoy_cluster_name: 'srv1_srv_2', envoy_response_code_class: '2' },
      value: [1631800504.203, '363'],
    },
    {
      metric: { envoy_cluster_name: 'srv3_srv_1', envoy_response_code_class: '2' },
      value: [1631800504.203, '189'],
    },
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', envoy_response_code_class: '5' },
      value: [1631800504.203, '180'],
    },
  ];
  const rps = [
    { metric: { envoy_cluster_name: 'srv1_srv_1' }, value: [1631800504.203, '0.5777777777777777'] },
    { metric: { envoy_cluster_name: 'srv1_srv_2' }, value: [1631800504.203, '13.066666666666668'] },
    { metric: { envoy_cluster_name: 'srv3_srv_1' }, value: [1631800504.203, '0.6000000000000001'] },
  ];
  const lat50 = [
    { metric: { envoy_cluster_name: 'srv1_srv_1' }, value: [1631800504.203, '3'] },
    { metric: { envoy_cluster_name: 'srv1_srv_2' }, value: [1631800504.203, '4'] },
    { metric: { envoy_cluster_name: 'srv3_srv_1' }, value: [1631800504.203, 'NaN'] },
    { metric: { envoy_cluster_name: 'srv4' }, value: [1631800504.203, 'NaN'] },
    { metric: { envoy_cluster_name: 'srv5_srv_1' }, value: [1631800504.203, 'NaN'] },
  ];
  const lat99 = [
    { metric: { envoy_cluster_name: 'srv1_srv_1' }, value: [1631800504.203, '10'] },
    { metric: { envoy_cluster_name: 'srv1_srv_2' }, value: [1631800504.203, '50'] },
    { metric: { envoy_cluster_name: 'srv3_srv_1' }, value: [1631800504.203, 'NaN'] },
    { metric: { envoy_cluster_name: 'srv4' }, value: [1631800504.203, 'NaN'] },
    { metric: { envoy_cluster_name: 'srv5_srv_1' }, value: [1631800504.203, 'NaN'] },
  ];
  processServicePromQueries(stats, status, rps, lat50, lat99);

  const status2 = [
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', envoy_response_code_class: '2', kuma_io_service: 'srv1_srv_2' },
      value: [1631800504.203, '179'],
    },
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', envoy_response_code_class: '2', kuma_io_service: 'srv4' },
      value: [1631800504.203, '179'],
    },
    {
      metric: { envoy_cluster_name: 'srv3_srv_1', envoy_response_code_class: '2', kuma_io_service: 'srv1_srv_2' },
      value: [1631800504.203, '182'],
    },
  ];
  const rps2 = [
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', kuma_io_service: 'srv1_srv_2' },
      value: [1631800504.203, '3'],
    },
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', kuma_io_service: 'srv4' },
      value: [1631800504.203, '4'],
    },
    {
      metric: { envoy_cluster_name: 'srv3_srv_1', kuma_io_service: 'srv1_srv_2' },
      value: [1631800504.203, '10'],
    },
  ];
  const lat502 = [
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', kuma_io_service: 'srv1_srv_2' },
      value: [1631800504.203, '3'],
    },
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', kuma_io_service: 'srv4' },
      value: [1631800504.203, '4'],
    },
    {
      metric: { envoy_cluster_name: 'srv3_srv_1', kuma_io_service: 'srv1_srv_1' },
      value: [1631800504.203, 'NaN'],
    },
  ];
  const lat992 = [
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', kuma_io_service: 'srv1_srv_2' },
      value: [1631800504.203, '10'],
    },
    {
      metric: { envoy_cluster_name: 'srv1_srv_1', kuma_io_service: 'srv4' },
      value: [1631800504.203, '20'],
    },
    {
      metric: { envoy_cluster_name: 'srv3_srv_1', kuma_io_service: 'srv1_srv_2' },
      value: [1631800504.203, 'NaN'],
    },
    {
      metric: { envoy_cluster_name: 'srv3_srv_1', kuma_io_service: 'srv1_srv_2' },
      value: [1631800504.203, 2],
    },
  ];
  processEdgePromQueries(stats, status2, rps2, lat502, lat992);
  expect(stats.sends).toEqual({ srv1: true });
  expect(stats.nodeStats['srv1'].statuses).toEqual({ s2xx: 245 + 363, s3xx: 0, s4xx: 0, s5xx: 180 });
  expect(stats.nodeStats['srv3'].statuses).toEqual({ s2xx: 189, s3xx: 0, s4xx: 0, s5xx: 0 });
  expect(stats.nodeStats['srv4']).toBeUndefined();
  expect(stats.nodeStats['srv5']).toBeUndefined();
  expect(stats.nodeStats['srv1'].edges).toEqual({
    srv1: {
      dest: 'srv1',
      latencyp50: 3,
      latencyp99: 10,
      rps: 3,
      src: 'srv1',
      statuses: { s2xx: 179, s3xx: 0, s4xx: 0, s5xx: 0 },
    },
  });
  expect(stats.nodeStats['srv3'].edges).toEqual({
    srv1: {
      dest: 'srv3',
      latencyp50: 0,
      latencyp99: 2,
      rps: 10,
      src: 'srv1',
      statuses: { s2xx: 182, s3xx: 0, s4xx: 0, s5xx: 0 },
    },
  });
});
