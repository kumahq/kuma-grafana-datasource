package client

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
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
	var res = ZoneListResponse{}
	if err := c.getWithClientURLPrefix(ctx, "/zones", &res); err != nil {
		return nil, err
	}
	return res.Items, nil
}

func (c *client) GetMeshes(ctx context.Context) ([]Mesh, error) {
	var res = MeshListResponse{}
	if err := c.getWithClientURLPrefix(ctx, "/meshes", &res); err != nil {
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
	var res = HelloResponse{}
	if err := c.getWithClientURLPrefix(ctx, "/", &res); err != nil {
		return nil, err
	}
	return &res, nil
}

func (c *client) GetServiceInsights(ctx context.Context, mesh string) ([]ServiceInsight, error) {
	var insights []ServiceInsight
	url := fmt.Sprintf("%s/meshes/%s/service-insights", c.url, mesh)
	next := &url

	for {
		if next == nil {
			break
		}

		var res = ServiceInsightResponse{}
		if err := c.get(ctx, *next, &res); err != nil {
			return nil, err
		}

		next = res.Next
		insights = append(insights, res.Items...)
	}

	return insights, nil
}

func (c *client) get(ctx context.Context, url string, out interface{}) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}

	res, err := c.client.Do(req.WithContext(ctx))
	if err != nil {
		return err
	}

	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return err
	}

	return nil
}

func (c *client) getWithClientURLPrefix(ctx context.Context, path string, out interface{}) error {
	return c.get(ctx, c.url+path, out)
}
