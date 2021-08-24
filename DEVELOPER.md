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
