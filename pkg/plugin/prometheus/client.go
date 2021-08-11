package prometheus

import (
	"context"
	"fmt"
	prom_api "github.com/prometheus/client_golang/api"
	api "github.com/prometheus/client_golang/api/prometheus/v1"
	"github.com/prometheus/common/model"
	"math"
	"time"
)

type Client interface {
	QueryNodeGraph(ctx context.Context, zone string, mesh string, window time.Duration, t time.Time) ([]NodeStat, []EdgeStat, error)
}

type prom struct {
	client prom_api.Client
}

func NewPrometheusEngine(url string) (Client, error) {
	cl, err := prom_api.NewClient(prom_api.Config{
		Address: url,
	})
	if err != nil {
		return nil, err
	}
	return &prom{client: cl}, nil
}

func (d *prom) QueryNodeGraph(ctx context.Context, zone string, mesh string, interval time.Duration, t time.Time) ([]NodeStat, []EdgeStat, error) {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	windowStr := fmt.Sprintf("%dms", int(interval.Truncate(time.Millisecond).Milliseconds()))
	selector := fmt.Sprintf(`mesh="%s"`, mesh)
	if zone != "" {
		selector = fmt.Sprintf(`%s,zone="%s"`, selector, zone)
	}
	responseCodeReq := d.asyncQuery(ctx, fmt.Sprintf(`sum by (kuma_io_service,envoy_cluster_name,envoy_response_code_class) (delta(envoy_cluster_upstream_rq_xx{%s}[%s])) != 0`, selector, windowStr), t)
	edgeLatencyQ := fmt.Sprintf(`histogram_quantile(%%s, sum by (kuma_io_service, envoy_cluster_name, le) (rate(envoy_cluster_upstream_rq_time_bucket{%s}[%s])))`, selector, windowStr)
	edgeLatency50Req := d.asyncQuery(ctx, fmt.Sprintf(edgeLatencyQ, "0.5"), t)
	edgeLatency99Req := d.asyncQuery(ctx, fmt.Sprintf(edgeLatencyQ, "0.99"), t)
	nodeLatencyQ := fmt.Sprintf(`histogram_quantile(%%s, sum by (envoy_cluster_name, le) (rate(envoy_cluster_upstream_rq_time_bucket{%s}[%s])))`, selector, windowStr)
	nodeLatency50Req := d.asyncQuery(ctx, fmt.Sprintf(nodeLatencyQ, "0.5"), t)
	nodeLatency99Req := d.asyncQuery(ctx, fmt.Sprintf(nodeLatencyQ, "0.99"), t)
	rpsReq := d.asyncQuery(ctx, fmt.Sprintf(`sum by (kuma_io_service,envoy_cluster_name) (rate(envoy_cluster_upstream_rq_total{%s}[%s])) != 0`, selector, windowStr), t)

	byEdgeId := map[string]*EdgeStat{}
	byNodeId := map[string]*NodeStat{}
	// Send requests in parallel
	for i := 0; i < 6; i++ {
		select {
		case r := <-nodeLatency50Req:
			if err := r.accumulate(byNodeId, byEdgeId, func(node *NodeStat, edge *EdgeStat, dataPoint *model.Sample) {
				node.Latencyp50 = int64(math.Ceil(float64(dataPoint.Value)))
			}); err != nil {
				return nil, nil, r.err
			}
		case r := <-nodeLatency99Req:
			if err := r.accumulate(byNodeId, byEdgeId, func(node *NodeStat, edge *EdgeStat, dataPoint *model.Sample) {
				node.Latencyp99 = int64(math.Ceil(float64(dataPoint.Value)))
			}); err != nil {
				return nil, nil, r.err
			}
		case r := <-edgeLatency50Req:
			if err := r.accumulate(byNodeId, byEdgeId, func(node *NodeStat, edge *EdgeStat, dataPoint *model.Sample) {
				edge.Latencyp50 = int64(math.Ceil(float64(dataPoint.Value)))
			}); err != nil {
				return nil, nil, r.err
			}
		case r := <-edgeLatency99Req:
			if err := r.accumulate(byNodeId, byEdgeId, func(node *NodeStat, edge *EdgeStat, dataPoint *model.Sample) {
				edge.Latencyp99 = int64(math.Ceil(float64(dataPoint.Value)))
			}); err != nil {
				return nil, nil, r.err
			}
		case r := <-responseCodeReq:
			if err := r.accumulate(byNodeId, byEdgeId, func(node *NodeStat, edge *EdgeStat, dataPoint *model.Sample) {
				switch string(dataPoint.Metric["envoy_response_code_class"]) {
				case "2":
					node.Req2xx += int64(dataPoint.Value)
					edge.Req2xx += int64(dataPoint.Value)
				case "3":
					node.Req3xx += int64(dataPoint.Value)
					edge.Req3xx += int64(dataPoint.Value)
				case "4":
					node.Req4xx += int64(dataPoint.Value)
					edge.Req4xx += int64(dataPoint.Value)
				case "5":
					node.Req5xx += int64(dataPoint.Value)
					edge.Req5xx += int64(dataPoint.Value)
				}
			}); err != nil {
				return nil, nil, r.err
			}
		case r := <-rpsReq:
			if err := r.accumulate(byNodeId, byEdgeId, func(node *NodeStat, edge *EdgeStat, dataPoint *model.Sample) {
				node.Rps += float64(dataPoint.Value)
				edge.Rps += float64(dataPoint.Value)
			}); err != nil {
				return nil, nil, r.err
			}
		}
	}
	nodesStats := make([]NodeStat, 0, len(byNodeId))
	for _, n := range byNodeId {
		nodesStats = append(nodesStats, *n)
	}
	edgeStats := make([]EdgeStat, 0, len(byEdgeId))
	for _, n := range byEdgeId {
		edgeStats = append(edgeStats, *n)
	}
	return nodesStats, edgeStats, nil
}

type accumulatorFn func(node *NodeStat, edge *EdgeStat, dataPoint *model.Sample)

func (r promRes) accumulate(byNodeId map[string]*NodeStat, byEdgeId map[string]*EdgeStat, fn accumulatorFn) error {
	if r.err != nil {
		return r.err
	}
	for _, entry := range r.value.(model.Vector) {
		source := string(entry.Metric["kuma_io_service"])
		dest := string(entry.Metric["envoy_cluster_name"])
		edgeId := fmt.Sprintf("%s--%s", source, dest)
		if _, exists := byNodeId[dest]; !exists {
			byNodeId[dest] = &NodeStat{Name: dest}
		}
		if _, exists := byEdgeId[edgeId]; !exists {
			byEdgeId[edgeId] = &EdgeStat{Origin: source, Destination: dest}
		}
		fn(byNodeId[dest], byEdgeId[edgeId], entry)
	}
	return nil
}

type promRes struct {
	value    model.Value
	warnings api.Warnings
	err      error
}

func (d *prom) asyncQuery(ctx context.Context, query string, t time.Time) <-chan promRes {
	res := make(chan promRes)
	go func() {
		m, warns, err := api.NewAPI(d.client).Query(ctx, query, t)
		res <- promRes{value: m, warnings: warns, err: err}
	}()
	return res
}
