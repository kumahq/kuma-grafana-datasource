package client

import (
	"fmt"
	"time"
)

type ServiceInsightResponse struct {
	Items []ServiceInsight `json:"items"`
	Total int              `json:"total"`
	Next  *string          `json:"next"`
}

type ServiceInsight struct {
	Type             string                    `json:"type"`
	Mesh             string                    `json:"mesh"`
	Name             string                    `json:"name"`
	CreationTime     time.Time                 `json:"creation_time"`
	ModificationTime time.Time                 `json:"modificationtime"`
	Status           string                    `json:"status"`
	Dataplanes       ServiceInsightsDpStatuses `json:"dataplanes"`
}

func (i ServiceInsightsDpStatuses) OnlinePercent() int {
	if i.Total == 0 {
		return 0
	}
	return (i.Online * 100) / i.Total
}

func (i ServiceInsightsDpStatuses) String() string {
	return fmt.Sprintf("%d/%d/%d", i.Online, i.Online, i.Total)
}

type ServiceInsightsDpStatuses struct {
	Online  int `json:"online"`
	Offline int `json:"offline"`
	Total   int `json:"total"`
}

type HelloResponse struct {
	Hostname string `json:"hostname"`
	TagLine  string `json:"tagline"`
	Version  string `json:"version"`
}

type Meta struct {
	Type             string    `json:"type"`
	Name             string    `json:"name"`
	CreationTime     time.Time `json:"creationTime"`
	ModificationTime time.Time `json:"modificationTime"`
}

type Zone struct {
	Meta
	Ingress ZoneIngressInfo `json:"ingress"`
}

type Mesh struct {
	Meta
	// TODO add other configs
}

type MeshListResponse struct {
	Items []Mesh  `json:"items"`
	Total int     `json:"total"`
	Next  *string `json:"next"`
}

type ZoneIngressInfo struct {
	Address string `json:"address"`
}

type ZoneListResponse struct {
	Items []Zone  `json:"items"`
	Total int     `json:"total"`
	Next  *string `json:"next"`
}
