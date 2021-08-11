package prometheus

import "fmt"

type NodeStat struct {
	Name       string
	Req2xx     int64
	Req3xx     int64
	Req4xx     int64
	Req5xx     int64
	Rps        float64
	Latencyp99 int64
	Latencyp50 int64
}

func (s NodeStat) SLO() int64 {
	all := s.Total()
	if all == 0 {
		return 100
	}
	return ((all - s.Req5xx) * 100) / all
}

func (s NodeStat) Total() int64 {
	return s.Req2xx + s.Req3xx + s.Req4xx + s.Req5xx
}

func (s NodeStat) Ratio2xx() float64 {
	all := s.Total()
	if all == 0 {
		return 1
	}
	return float64(s.Req2xx) / float64(all)
}

func (s NodeStat) Ratio3xx() float64 {
	all := s.Total()
	if all == 0 {
		return 1
	}
	return float64(s.Req3xx) / float64(all)
}

func (s NodeStat) Ratio4xx() float64 {
	all := s.Total()
	if all == 0 {
		return 1
	}
	return float64(s.Req4xx) / float64(all)
}

func (s NodeStat) Ratio5xx() float64 {
	all := s.Total()
	if all == 0 {
		return 1
	}
	return float64(s.Req5xx) / float64(all)
}

func EmptyNode(name string) NodeStat {
	return NodeStat{
		Name:       name,
		Req2xx:     0,
		Req3xx:     0,
		Req5xx:     0,
		Req4xx:     0,
		Rps:        0,
		Latencyp50: 0,
		Latencyp99: 0,
	}
}

type EdgeStat struct {
	Origin      string
	Destination string
	Req2xx      int64
	Req3xx      int64
	Req4xx      int64
	Req5xx      int64
	Rps         float64
	Latencyp99  int64
	Latencyp50  int64
}

func (s EdgeStat) Id() string {
	return fmt.Sprintf("%s__%s", s.Origin, s.Destination)
}

func (s EdgeStat) SLO() int64 {
	all := s.Req2xx + s.Req3xx + s.Req4xx + s.Req5xx
	if all == 0 {
		return 100
	}
	return ((all - s.Req5xx) * 100) / all
}
