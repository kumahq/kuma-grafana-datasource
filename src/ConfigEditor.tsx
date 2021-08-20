import React, { ChangeEvent } from 'react';
import { LegacyForms, Select } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps, SelectableValue } from '@grafana/data';
import { KumaDataSourceOptions } from './types';
import { getDataSourceSrv } from '@grafana/runtime';

const { FormField } = LegacyForms;

interface Props extends DataSourcePluginOptionsEditorProps<KumaDataSourceOptions> {}

export function ConfigEditor(props: Props) {
  const { options } = props;

  const all = getDataSourceSrv().getList({ type: 'prometheus' });
  console.log('ds', all);
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
    <div className="gf-form">
      <div className="gf-form-group">
        <div className="gf-form">
          <FormField
            label="Url"
            labelWidth={6}
            inputWidth={20}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const { onOptionsChange, options } = props;
              onOptionsChange({ ...options, url: event.target.value });
            }}
            value={options.url || ''}
            placeholder="url to your service"
          />
          <Select
            options={allDatasources}
            value={curDatasource}
            onChange={(entry: SelectableValue<string>) => {
              const { onOptionsChange, options } = props;
              onOptionsChange({ ...options, jsonData: { prometheusDataSourceId: entry.value } });
            }}
          />
        </div>
      </div>
    </div>
  );
}
