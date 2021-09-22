# Developer documentation

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

## Useful links to the Grafana docs

Here are a few links useful to read to understand how datasources and plugins work:

- [Build a datasource plugin](https://grafana.com/tutorials/build-a-data-source-backend-plugin/)
- [Datasource proxy calls](https://grafana.com/docs/grafana/latest/http_api/data_source/#data-source-proxy-calls)
- [NodeGraph data api](https://grafana.com/docs/grafana/latest/visualizations/node-graph/#data-api)
- [GoDoc for grafana plugin](https://pkg.go.dev/github.com/grafana/grafana-plugin-sdk-go)
- [TypeScript doc for grafana](https://grafana.com/docs/grafana/latest/packages_api/)

## Principle

This datasource does almost everything on the frontend.
The only thing that happens on the backend is the processing of requests that will go to the dataplane.

These query types are supported:

- meshes: Get the list of meshes straight from the control-plane (nothing is done on the frontend)
- zones: Get the list of zones straight from the control-plane (nothing is done on the frontend)
- mesh-graph: Get the list of services from service-insights from the control-plane and then calls prometheus to get the rest of the information.

## A note about `mesh-graph`

`mesh-graph` is a type of query for the datasource that requires special attention.
Because the [NodeGraph panel](https://grafana.com/docs/grafana/latest/visualizations/node-graph) requires data is a specific shape.
We send multiple prometheus queries to retrieve all the data and then transform it to what is needed.

We use the list of services from the `service-insights` as a source of truth to get the list of nodes.
`NodeGraph` only shows nodes that have edges coming in or out, therefore services that don't get any traffic won't be displayed.

## Troubleshooting

The best way to troubleshoot is to look at the responses in the browser.
When things don't seem to display correctly, it's very likely because we do not manage to merge data coming from prometheus with data from the serviceMap.
This can be the case when a service has multiple inbounds for example.

It can be useful to take the output of the request and use `stats.test.ts` to check assumptions.
