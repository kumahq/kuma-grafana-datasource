import { defaults } from 'lodash';

import React from 'react';
import { Select, Spinner } from '@grafana/ui';

import { QueryEditorProps, SelectableValue } from '@grafana/data';
import useAsync from 'react-use/lib/useAsync';

import { DataSource } from './datasource';
import {
  defaultQuery,
  KumaDataSourceOptions,
  KumaQuery,
  MeshesQType,
  MeshGraphQType,
  queryTypes,
  ZonesQType,
} from './types';
import { getTemplateSrv } from '@grafana/runtime';

interface MetadataResponse {
  meshes?: string[];
  zones?: string[];
}

type Props = QueryEditorProps<DataSource, KumaQuery, KumaDataSourceOptions>;

export function QueryEditor(props: Props) {
  const query = defaults(props.query, defaultQuery);
  const { mesh, zone, queryType } = query;

  const r = useAsync(async (): Promise<MetadataResponse> => {
    if (queryType !== MeshGraphQType) {
      return {};
    }
    return props.datasource.postResource('metadata', {});
  }, [props.datasource]);
  if (r.error) {
    // TODO error handling
  }
  let fields;
  if (queryType === MeshGraphQType) {
    if (!r.value) {
      return <Spinner />;
    } else {
      fields = (
        <span>
          {buildSelect(r.value.meshes || ['default'], mesh, (entry: SelectableValue<string>) => {
            props.onChange({ ...query, mesh: entry.value || 'default' });
            props.onRunQuery();
          })}
          {buildSelect(r.value.zones || [], zone || '', (entry: SelectableValue<string>) => {
            props.onChange({ ...query, zone: entry.value });
            props.onRunQuery();
          })}
        </span>
      );
    }
  } else if (queryType === ZonesQType) {
    fields = <div />;
  } else if (queryType === MeshesQType) {
    fields = <div />;
  }
  return (
    <div className="gf-form">
      {buildSelect(queryTypes, queryType || MeshGraphQType, (entry: SelectableValue<string>) => {
        props.onChange({ ...query, queryType: entry.value });
        if (entry.value !== MeshGraphQType) {
          props.onRunQuery();
        }
      })}
      {fields}
    </div>
  );
}

function buildSelect(entries: string[], value: string, cb: (entry: SelectableValue<string>) => void) {
  const dashVars = getTemplateSrv().getVariables();
  const allOptions = [];
  let cur;
  for (const v of entries) {
    const elt = { label: v, value: v, text: v };
    if (v === value) {
      cur = elt;
    }
    allOptions.push(elt);
  }
  for (const v of dashVars) {
    const elt = { label: `$${v.name}`, value: `$${v.name}`, text: `${v.name}` };
    if (v.name === value) {
      cur = elt;
    }
    allOptions.push(elt);
  }
  return <Select options={allOptions} value={cur} onChange={cb} />;
}
