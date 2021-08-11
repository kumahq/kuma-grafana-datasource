package plugin

import (
	"context"
	"fmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/kumahq/kuma-grafana-datasource/pkg/plugin/client"
	"github.com/kumahq/kuma-grafana-datasource/pkg/plugin/prometheus"
	"sort"
	"time"
)

type nodeInfo struct {
	insight client.ServiceInsight
	stats   prometheus.NodeStat
}

type edgeInfo struct {
	stats prometheus.EdgeStat
}

// MeshGraphQuery retrieve data from Prometheus and Kuma to respond to NodeGraph query (zone is optional).
func (d *KumaDatasource) MeshGraphQuery(ctx context.Context, zone string, mesh string, interval time.Duration, timeRange backend.TimeRange) backend.DataResponse {
	serviceInsights, err := d.kongMeshClient.GetServiceInsights(ctx)
	if err != nil {
		return backend.DataResponse{Error: err}
	}
	insightsByName := map[string]client.ServiceInsight{}
	for _, serviceInsight := range serviceInsights {
		if serviceInsight.Mesh == mesh {
			insightsByName[serviceInsight.Name] = serviceInsight
		}
	}

	nodes, edges, err := d.promClient.QueryNodeGraph(ctx, zone, mesh, interval, timeRange.To)
	if err != nil {
		return backend.DataResponse{Error: err}
	}

	var nodeInfos []nodeInfo
	byNode := map[string]prometheus.NodeStat{}
	for _, node := range nodes {
		byNode[node.Name] = node
	}

	for name := range insightsByName {
		stats, exist := byNode[name]
		if !exist {
			stats = prometheus.EmptyNode(name)
		}
		nodeInfos = append(nodeInfos, nodeInfo{insight: insightsByName[name], stats: stats})
	}
	var edgeInfos []edgeInfo
	for _, edge := range edges {
		if _, exists := insightsByName[edge.Origin]; !exists {
			continue
		}
		if _, exists := insightsByName[edge.Destination]; !exists {
			continue
		}
		edgeInfos = append(edgeInfos, edgeInfo{stats: edge})
	}

	return backend.DataResponse{
		Frames: data.Frames{toNodeFrame(nodeInfos), toEdgeFrame(edgeInfos)},
	}
}

// toNodeFrame create a data.Frame from the info retrieved
func toNodeFrame(nodeInfos []nodeInfo) *data.Frame {
	nodes := data.NewFrame("nodes")
	nodes.SetMeta(&data.FrameMeta{PreferredVisualization: data.VisTypeNodeGraph})
	nodes.Fields = append(nodes.Fields,
		data.NewField("id", nil, []string{}),
		data.NewField("title", nil, []string{}).SetConfig(&data.FieldConfig{
			DisplayName: "Name",
		}),
		data.NewField("arc__2xx", nil, []float64{}).SetConfig(&data.FieldConfig{
			DisplayName: "2xx",
			Color:       map[string]interface{}{"fixedColor": "green", "mode": "fixed"},
		}),
		data.NewField("arc__3xx", nil, []float64{}).SetConfig(&data.FieldConfig{
			DisplayName: "3xx",
			Color:       map[string]interface{}{"fixedColor": "yellow", "mode": "fixed"},
		}),
		data.NewField("arc__4xx", nil, []float64{}).SetConfig(&data.FieldConfig{
			DisplayName: "4xx",
			Color:       map[string]interface{}{"fixedColor": "orange", "mode": "fixed"},
		}),
		data.NewField("arc__5xx", nil, []float64{}).SetConfig(&data.FieldConfig{
			DisplayName: "5xx",
			Color:       map[string]interface{}{"fixedColor": "red", "mode": "fixed"},
		}),
		data.NewField("mainStat", nil, []float64{}).SetConfig(&data.FieldConfig{
			DisplayName: "Requests per sec",
			Unit:        "req/s",
		}),
		data.NewField("secondaryStat", nil, []int64{}).SetConfig(&data.FieldConfig{
			DisplayName: "SLO ((all-5xx)/all) * 100",
			Unit:        "%",
		}),
		data.NewField("detail__status", nil, []string{}).SetConfig(&data.FieldConfig{
			DisplayName: "status",
		}),
		data.NewField("detail__stats", nil, []string{}).SetConfig(&data.FieldConfig{
			DisplayName: "dataplane online/offline/total",
		}),
		data.NewField("detail__requests", nil, []string{}).SetConfig(&data.FieldConfig{
			DisplayName: "requests count 2xx/3xx/4xx/5xx/total",
			Unit:        "req",
			NoValue:     "0/0/0/0/0",
		}),
		data.NewField("detail__p50", nil, []int64{}).SetConfig(&data.FieldConfig{
			DisplayName: "latency p50",
			Unit:        "ms",
			NoValue:     "0",
		}),
		data.NewField("detail__p99", nil, []int64{}).SetConfig(&data.FieldConfig{
			DisplayName: "latency p99",
			Unit:        "ms",
			NoValue:     "0",
		}),
	)
	sort.Slice(nodeInfos, func(i, j int) bool {
		return nodeInfos[i].insight.Name < nodeInfos[j].insight.Name
	})
	for _, info := range nodeInfos {
		serviceInsight := info.insight
		nodeStat := info.stats
		nodes.AppendRow(
			serviceInsight.Name,
			serviceInsight.Name,
			nodeStat.Ratio2xx(),
			nodeStat.Ratio3xx(),
			nodeStat.Ratio4xx(),
			nodeStat.Ratio5xx(),
			nodeStat.Rps,
			nodeStat.SLO(),
			serviceInsight.Status,
			serviceInsight.Dataplanes.String(),
			fmt.Sprintf("%d/%d/%d/%d/%d", nodeStat.Req2xx, nodeStat.Req3xx, nodeStat.Req4xx, nodeStat.Req5xx, nodeStat.Total()),
			nodeStat.Latencyp50,
			nodeStat.Latencyp99,
		)
	}
	return nodes
}

// toEdgeFrame create a data.Frame from the info retrieved
func toEdgeFrame(edgeInfos []edgeInfo) *data.Frame {
	edges := data.NewFrame("edges")
	edges.SetMeta(&data.FrameMeta{PreferredVisualization: data.VisTypeNodeGraph})
	edges.Fields = append(edges.Fields,
		data.NewField("id", nil, []string{}),
		data.NewField("source", nil, []string{}),
		data.NewField("target", nil, []string{}),
		data.NewField("mainStat", nil, []float64{}).SetConfig(&data.FieldConfig{
			DisplayName: "Requests per sec",
			Unit:        "req/s",
		}),
		data.NewField("secondaryStat", nil, []int64{}).SetConfig(&data.FieldConfig{
			DisplayName: "SLO ((all-5xx)/all) * 100",
			Unit:        "%",
		}),
		data.NewField("detail__requests", nil, []string{}).SetConfig(&data.FieldConfig{
			DisplayName: "requests count 2xx/3xx/4xx/5xx",
			Unit:        "req/s",
			NoValue:     "N/A",
		}),
		data.NewField("detail__p50", nil, []int64{}).SetConfig(&data.FieldConfig{
			DisplayName: "latency p50",
			Unit:        "ms",
			NoValue:     "N/A",
		}),
		data.NewField("detail__p99", nil, []int64{}).SetConfig(&data.FieldConfig{
			DisplayName: "latency p99",
			Unit:        "ms",
			NoValue:     "N/A",
		}),
	)
	sort.Slice(edgeInfos, func(i, j int) bool {
		return edgeInfos[i].stats.Id() < edgeInfos[j].stats.Id()
	})
	for _, edge := range edgeInfos {
		edgeStat := edge.stats
		edges.AppendRow(
			edgeStat.Id(),
			edgeStat.Origin,
			edgeStat.Destination,
			edgeStat.Rps,
			edgeStat.SLO(),
			fmt.Sprintf("%d/%d/%d/%d", edgeStat.Req2xx, edgeStat.Req3xx, edgeStat.Req4xx, edgeStat.Req5xx),
			edgeStat.Latencyp50,
			edgeStat.Latencyp99,
		)
	}
	return edges
}

// CheckHealth handles health checks sent from Grafana to the plugin.
// The main use case for these health checks is the test button on the
// datasource configuration page which allows users to verify that
// a datasource is working as expected.
func (d *KumaDatasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	log.DefaultLogger.Info("CheckHealth called", "request", req)
	res, err := d.kongMeshClient.Hello(ctx)
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: fmt.Sprintf("received from: '%s' tagLine:%s version:%s", res.Hostname, res.TagLine, res.Version),
	}, nil
}
