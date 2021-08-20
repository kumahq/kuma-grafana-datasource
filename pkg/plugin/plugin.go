package plugin

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/kumahq/kuma-grafana-datasource/pkg/plugin/client"
	"net/http"
)

// Make sure KumaDatasource implements required interfaces. This is important to do
// since otherwise we will only get a not implemented error response from plugin in
// runtime. In this example datasource instance implements backend.QueryDataHandler,
// backend.CheckHealthHandler, backend.StreamHandler interfaces. Plugin should not
// implement all these interfaces - only those which are required for a particular task.
// For example if plugin does not need streaming functionality then you are free to remove
// methods that implement backend.StreamHandler. Implementing instancemgmt.InstanceDisposer
// is useful to clean up resources used by previous datasource instance when a new datasource
// instance created upon datasource settings changed.
var (
	_ backend.QueryDataHandler      = (*KumaDatasource)(nil)
	_ backend.CheckHealthHandler    = (*KumaDatasource)(nil)
	_ instancemgmt.InstanceDisposer = (*KumaDatasource)(nil)
)

// NewSampleDatasource creates a new datasource instance.
func NewSampleDatasource(instanceSettings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	cl, err := client.NewClient(instanceSettings.URL, instanceSettings.DecryptedSecureJSONData)
	if err != nil {
		return nil, err
	}
	ds := &KumaDatasource{
		kongMeshClient: cl,
	}
	return ds, nil
}

// KumaDatasource is an example datasource which can respond to data queries, reports
// its health and has streaming skills.
type KumaDatasource struct {
	kongMeshClient client.Client
}

// Dispose here tells plugin SDK that plugin wants to clean up resources when a new instance
// created. As soon as datasource settings change detected by SDK old datasource instance will
// be disposed and a new one will be created using NewSampleDatasource factory function.
func (d *KumaDatasource) Dispose() {
	// Clean up datasource instance resources.
}

type KongMeshQueryType string

const (
	MeshGraphQueryType KongMeshQueryType = "mesh-graph"
	MeshesQueryType    KongMeshQueryType = "meshes"
	ZonesQueryType     KongMeshQueryType = "zones"
)

type KumaQueryModel struct {
	DatasourceId  int               `json:"datasourceId,omitempty"`
	IntervalMs    int               `json:"intervalMs,omitempty"`
	Key           string            `json:"key"`
	MaxDataPoints int               `json:"maxDataPoints"`
	Mesh          string            `json:"mesh"`
	Zone          string            `json:"zone"`
	QueryType     KongMeshQueryType `json:"queryType"`
	RefId         string            `json:"refId"`
}

// QueryData handles multiple queries and returns multiple responses.
// req contains the queries []DataQuery (where each query contains RefID as a unique identifier).
// The QueryDataResponse contains a map of RefID to the response for each query, and each response
// contains Frames ([]*Frame).
func (d *KumaDatasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	log.DefaultLogger.Info("QueryData called", "request", req)

	// create response struct
	response := backend.NewQueryDataResponse()

	// loop over queries and execute them individually.
	for _, q := range req.Queries {
		response.Responses[q.RefID] = d.query(ctx, req.PluginContext, q)
	}

	return response, nil
}

func (d *KumaDatasource) query(ctx context.Context, pCtx backend.PluginContext, query backend.DataQuery) backend.DataResponse {
	var qm KumaQueryModel
	if err := json.Unmarshal(query.JSON, &qm); err != nil {
		return backend.DataResponse{Error: err}
	}
	switch qm.QueryType {
	case MeshesQueryType:
		r, err := d.kongMeshClient.GetMeshes(ctx)
		if err != nil {
			return backend.DataResponse{Error: err}
		}
		var names []string
		for _, m := range r {
			names = append(names, m.Name)
		}
		meshes := data.NewFrame("meshes")
		meshes.SetMeta(&data.FrameMeta{PreferredVisualization: data.VisTypeTable})
		meshes.Fields = append(meshes.Fields, data.NewField("title", nil, names).SetConfig(&data.FieldConfig{
			DisplayName: "Name",
		}))
		return backend.DataResponse{Frames: data.Frames{meshes}}
	case ZonesQueryType:
		r, err := d.kongMeshClient.GetZones(ctx)
		if err != nil {
			return backend.DataResponse{Error: err}
		}
		var names []string
		for _, m := range r {
			names = append(names, m.Name)
		}
		zones := data.NewFrame("zones")
		zones.SetMeta(&data.FrameMeta{PreferredVisualization: data.VisTypeTable})
		zones.Fields = append(zones.Fields, data.NewField("title", nil, names).SetConfig(&data.FieldConfig{
			DisplayName: "Name",
		}))
		return backend.DataResponse{Frames: data.Frames{zones}}
	default:
		return backend.DataResponse{Error: errors.New("unknown query type")}
	}
}

type MetadataResponse struct {
	Meshes []string `json:"meshes"`
	Zones  []string `json:"zones"`
}

type ServiceRequest struct {
	Mesh string `json:"mesh"`
}

type Service struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Online  int    `json:"online"`
	Offline int    `json:"offline"`
	Total   int    `json:"total"`
}

type ServicesResponse struct {
	Services []Service `json:"services"`
}

func (d *KumaDatasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	log.DefaultLogger.Info("Resource called", "request", req)
	if req.Method != http.MethodPost {
		return sender.Send(&backend.CallResourceResponse{Status: http.StatusMethodNotAllowed, Body: []byte("Only post is supported")})
	}
	switch req.Path {
	case "metadata":
		meshesObj, err := d.kongMeshClient.GetMeshes(ctx)
		if err != nil {
			return err
		}
		meshes := []string{}
		for _, z := range meshesObj {
			meshes = append(meshes, z.Name)
		}
		zonesObj, err := d.kongMeshClient.GetZones(ctx)
		if err != nil {
			return err
		}
		zones := []string{}
		for _, z := range zonesObj {
			zones = append(zones, z.Name)
		}
		b, err := json.Marshal(MetadataResponse{Meshes: meshes, Zones: zones})
		if err != nil {
			return err
		}
		return sender.Send(&backend.CallResourceResponse{Status: http.StatusOK, Body: b})
	case "services":
		sReq := ServiceRequest{}
		err := json.Unmarshal(req.Body, &sReq)
		if err != nil {
			return sender.Send(&backend.CallResourceResponse{Status: http.StatusBadRequest, Body: []byte("Failed reading body" + err.Error())})
		}
		res, err := d.kongMeshClient.GetServiceInsights(ctx)
		if err != nil {
			return err
		}
		response := ServicesResponse{Services: []Service{}}
		for _, r := range res {
			response.Services = append(response.Services, Service{Name: r.Name, Status: r.Status, Online: r.Dataplanes.Online, Offline: r.Dataplanes.Offline, Total: r.Dataplanes.Total})
		}
		b, err := json.Marshal(response)
		if err != nil {
			return err
		}
		return sender.Send(&backend.CallResourceResponse{Status: http.StatusOK, Body: b})
	default:
		return sender.Send(&backend.CallResourceResponse{Status: http.StatusNotFound, Body: []byte("Not found")})
	}

}

func (d *KumaDatasource) CheckHealth(ctx context.Context, _ *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	r, err := d.kongMeshClient.Hello(ctx)
	if err != nil {
		return &backend.CheckHealthResult{Status: backend.HealthStatusError, Message: err.Error()}, nil
	}
	return &backend.CheckHealthResult{Status: backend.HealthStatusOk, Message: r.Version}, nil
}
