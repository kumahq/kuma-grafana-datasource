# kuma-grafana-datasource
A grafana datasource plugin for Kuma

[![Build](https://github.com/grafana/grafana-starter-datasource-backend/workflows/CI/badge.svg)](https://github.com/grafana/grafana-datasource-backend/actions?query=workflow%3A%22CI%22)

This datasource will enable you to do some queries to inspect Kuma.
It also has a `mesh-graph` query type which will render a [NodeGraph panel](https://grafana.com/docs/grafana/latest/panels/visualizations/node-graph/) similar to what [Kiali](https://kiali.io) provides.

## How to install

- Download the latest release from [the release page](https://github.com/kumahq/kuma-grafana-datasource/releases).
- Follow the instructions to install a packaged plugin from [the grafana docs](https://grafana.com/docs/grafana/latest/plugins/installation/#install-a-packaged-plugin).
- Because we are [still pending approval from grafana](https://github.com/grafana/grafana-plugin-repository/pull/1043), the plugin isn't signed. You will need to add this to your grafana configuration:
```
[plugins]
allow_loading_unsigned_plugins = "kumahq-kuma-datasource"
```

## How to configure

### Manually

It's as easy as any datasource, you can follow the instructions on the [Grafana docs](https://grafana.com/docs/grafana/latest/datasources/add-a-data-source/).

The configuration for the datasource will look like:

![Kuma datasource configuration](./img/configuration.png)

You'll have to set the url to your global control plane api and pick an already configured prometheus datasource in the dropdown.

Once this is done you can go in `explore` and pick the kuma-datasource with the `mesh-graph` query type:

![Mesh graph example](./img/mesh-graph.png)

### With provisioner

Add to the datasource configuration:

```yaml
    datasources:
      - name: Prometheus
        type: prometheus
        access: proxy
        url: http://prometheus-server.kuma-metrics
      - name: Kuma
        type: kumahq-kuma-datasource
        url: http://kuma-control-plane.kuma-system:5681
        jsonData:
          prometheusDataSourceId: "1"
```

### With `kumactl`

If you use `kumactl install metrics` with a version of kumactl >= 1.3.0 the plugin will be setup automatically.

## Future features

- Add links for logs and traces.
- Add possibility to filter services.
- Add query type for services/dataplane inspection.
- Support non HTTP services.

File an issue if you want something :).

## Development

A data source backend plugin consists of both frontend and backend components.

The easiest way to develop is using the grafana docker image:

You can start it:

```
docker run  -p 3000:3000 -d  -e GF_DEFAULT_APP_MODE=development -v /Users/cmolter/code/kuma-datasource/dist:/var/lib/grafana/plugins --name=grafana grafana/grafana:8.0.0
```

then rebuild with:

```
mage -v && yarn dev && docker restart grafana && docker logs grafana -f
```

## Releasing

- Change the version in `package.json`.
- Update the [CHANGELOG](./CHANGELOG.md).
- Add a tag and push.
- The github `release` job should run.
