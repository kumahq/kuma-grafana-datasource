import { defaults } from 'lodash';

import React, { ChangeEvent, PureComponent } from 'react';
import { LegacyForms, Select } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
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

const { FormField } = LegacyForms;

type Props = QueryEditorProps<DataSource, KumaQuery, KumaDataSourceOptions>;

export class QueryEditor extends PureComponent<Props> {
  onMeshChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, mesh: event.target.value });
    // executes the query
    onRunQuery();
  };

  onZoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { onChange, query, onRunQuery } = this.props;
    onChange({ ...query, zone: event.target.value });
    // executes the query
    onRunQuery();
  };

  onTypeChange = (entry: SelectableValue<string>) => {
    const { onChange, query } = this.props;
    onChange({
      ...query,
      queryType: entry.value,
    });
  };

  render() {
    const query = defaults(this.props.query, defaultQuery);
    const { mesh, zone, queryType } = query;

    const allOptions = [];
    let cur;
    for (const v of queryTypes) {
      const elt = { label: v, value: v, text: v };
      if (v === queryType) {
        cur = elt;
      }
      allOptions.push(elt);
    }
    let fields;
    if (queryType === MeshGraphQType) {
      fields = (
        <div>
          // TODO this should be a drop down
          <FormField
            labelWidth={4}
            onChange={this.onMeshChange}
            value={mesh}
            type="string"
            label="Mesh"
            tooltip="The name of the mesh to query"
          />
          // TODO this should be a drop down
          <FormField
            labelWidth={4}
            onChange={this.onZoneChange}
            value={zone}
            type="string"
            label="Zone"
            tooltip="The optional name of the zone to query"
          />
        </div>
      );
    } else if (queryType === ZonesQType) {
      fields = <div></div>;
    } else if (queryType === MeshesQType) {
      fields = <div></div>;
    }
    return (
      <div className="gf-form">
        <Select options={allOptions} value={cur} onChange={this.onTypeChange} />
        {fields}
      </div>
    );
  }
}
