package client

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"net/http"
)

type Client interface {
	Hello(ctx context.Context) (*HelloResponse, error)
	GetServiceInsights(ctx context.Context, mesh string) ([]ServiceInsight, error)
	GetZones(ctx context.Context) ([]Zone, error)
	GetMeshes(ctx context.Context) ([]Mesh, error)
}

type client struct {
	url    string
	client *http.Client
}

func (c *client) GetZones(ctx context.Context) ([]Zone, error) {
	res := ZoneListResponse{}
	if err := c.get(ctx, "/zones", &res); err != nil {
		return nil, err
	}
	return res.Items, nil
}

func (c *client) GetMeshes(ctx context.Context) ([]Mesh, error) {
	res := MeshListResponse{}
	if err := c.get(ctx, "/meshes", &res); err != nil {
		return nil, err
	}
	return res.Items, nil
}

func NewClient(url string, opts map[string]string) (Client, error) {
	var options []httpclient.Options
	if _, ok := opts["clientCertificate"]; ok {
		options = append(options, httpclient.Options{
			TLS: &httpclient.TLSOptions{
				ClientKey:         opts["clientKey"],
				ClientCertificate: opts["clientCertificate"],
				CACertificate:     opts["CACertificate"],
			},
		})
	}

	cl, err := httpclient.New(options...)
	if err != nil {
		return nil, err
	}
	return &client{
		client: cl,
		url:    url,
	}, err
}

func (c *client) Hello(ctx context.Context) (*HelloResponse, error) {
	res := HelloResponse{}
	if err := c.get(ctx, "/", &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *client) GetServiceInsights(ctx context.Context, mesh string) ([]ServiceInsight, error) {
	res := ServiceInsightResponse{}
	if err := c.get(ctx, fmt.Sprintf("/meshes/%s/service-insights", mesh), &res); err != nil {
		return nil, err
	}
	// TODO pagination
	return res.Items, nil
}

func (c *client) get(ctx context.Context, path string, out interface{}) error {
	r, err := http.NewRequest("GET", c.url+path, nil)
	if err != nil {
		return err
	}
	r.WithContext(ctx)
	res, err := c.client.Do(r)
	if err != nil {
		return err
	}
	d := json.NewDecoder(res.Body)
	err = d.Decode(&out)
	if err != nil {
		return err
	}
	return nil
}
