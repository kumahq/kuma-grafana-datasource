import React, { ChangeEvent } from 'react';
import { FieldSet, InlineField, Input, Select } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps, SelectableValue } from '@grafana/data';
import { KumaDataSourceOptions } from './types';
import { getDataSourceSrv } from '@grafana/runtime';

interface Props extends DataSourcePluginOptionsEditorProps<KumaDataSourceOptions> {}

export function ConfigEditor(props: Props) {
  const { options } = props;

  const all = getDataSourceSrv().getList({ type: 'prometheus' });
  const allDatasources = [];
  let curDatasource;
  for (let v of all || []) {
    if (!v.id) {
      continue;
    }
    const elt = { label: v.name, value: v.id.toString(), text: v.name };
    if (v.id.toString() === props.options.jsonData.prometheusDataSourceId) {
      curDatasource = elt;
    }
    allDatasources.push(elt);
  }
  return (
    <>
      <FieldSet label="Dataplane">
        <InlineField label="Dataplane url" tooltip="The url to your global dataplane api">
          <Input
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              props.onOptionsChange({ ...props.options, url: event.target.value });
            }}
            css=""
            value={options.url || ''}
            placeholder="url to your service"
            required={true}
          />
        </InlineField>
      </FieldSet>
      <FieldSet label="Secondary datasource">
        <InlineField
          label="Prometheus datasource"
          tooltip="The prometheus datasource to extract stats from (this datasource will proxy some requests through this datasource)"
        >
          <Select
            options={allDatasources}
            value={curDatasource}
            onChange={(entry: SelectableValue<string>) => {
              const { onOptionsChange, options } = props;
              onOptionsChange({ ...options, jsonData: { prometheusDataSourceId: entry.value } });
            }}
          />
        </InlineField>
      </FieldSet>
    </>
  );
}
