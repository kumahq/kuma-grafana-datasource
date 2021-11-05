import { defaults, map } from 'lodash';

import React, { ChangeEvent } from 'react';
import { AsyncSelect, InlineField, InlineFieldRow, Input, Select } from '@grafana/ui';

import { QueryEditorProps, SelectableValue } from '@grafana/data';

import { DataSource } from './datasource';
import { defaultQuery, KumaDataSourceOptions, KumaQuery, MeshGraphQType, queryTypes, ServicesQType } from './types';

type Props = QueryEditorProps<DataSource, KumaQuery, KumaDataSourceOptions>;

export function QueryEditor(props: Props) {
  const query = defaults(props.query, defaultQuery);
  const { mesh, zone, queryType } = query;
  let metaPromise = props.datasource.postResource('metadata');
  let loadAsyncOptions = (type: 'zones' | 'meshes') => (): Promise<Array<SelectableValue<string>>> => {
    return new Promise<Array<SelectableValue<string>>>((resolve, reject) => {
      return metaPromise
        .then((r) => {
          resolve(
            map(r[type], (e) => {
              return { label: e, value: e, text: e };
            })
          );
        })
        .catch((reason) => reject(reason));
    });
  };
  let fields = [
    <InlineField key="queryType" label="query-type" tooltip="The type of query to run">
      <Select
        onChange={(entry: SelectableValue<string>) => {
          props.onChange({ ...query, queryType: entry.value });
        }}
        options={map(queryTypes, (e) => {
          return { label: e, value: e, text: e };
        })}
        value={query.queryType}
      />
    </InlineField>,
  ];
  if (queryType === MeshGraphQType || queryType === ServicesQType) {
    fields.push(
      <InlineField key="meshes" label="meshes" tooltip="select the mesh to display">
        <AsyncSelect
          loadOptions={loadAsyncOptions('meshes')}
          defaultOptions
          value={{ label: mesh, value: mesh, text: mesh }}
          onChange={(entry: SelectableValue<string>) => {
            props.onChange({ ...query, mesh: entry.value || '' });
          }}
        />
      </InlineField>
    );
  }
  if (queryType === MeshGraphQType) {
    fields.push(
      <InlineField key="zones" label="zones" tooltip="filter the meshGraph by a zone">
        <AsyncSelect
          loadOptions={loadAsyncOptions('zones')}
          defaultOptions
          value={zone ? { label: zone, value: zone, text: zone } : undefined}
          onChange={(entry: SelectableValue<string>) => {
            props.onChange({ ...query, zone: entry.value || '' });
          }}
        />
      </InlineField>,
      <InlineField
        key="rollupRegexp"
        label="rollupRegexp"
        tooltip={`a regular expression to rollup all services of the same name, all matching services will be rolled up in the first regular expression group. For example the default value: ${defaultQuery.rollupRegEx} rolls all <service>_<namespace>_svc_<port> into <service>_<namespace>`}
      >
        <Input
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            props.onChange({ ...props.query, rollupRegEx: event.target.value });
          }}
          css=""
          value={props.query.rollupRegEx || ''}
        />
      </InlineField>
    );
  }
  return <InlineFieldRow className="gf-form">{fields}</InlineFieldRow>;
}
