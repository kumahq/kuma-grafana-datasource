import { DataQueryError } from '@grafana/data';
import { FetchError, FetchResponse, getBackendSrv } from '@grafana/runtime';
import { of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { InstantQueryParam, PromDataErrorResponse, PromDataSuccessResponse, PromScalarData, PromVectorData } from './types';

export class PrometheusDatasource {
  private instantQueryURL;

  constructor(uid?: string) {
    this.instantQueryURL = `/api/datasources/proxy/uid/${uid}/api/v1/query`;
  }

  async sendInstantQuery(data: InstantQueryParam) {
    return getBackendSrv()
      .fetch<PromDataSuccessResponse<PromVectorData | PromScalarData>>({
        url: this.instantQueryURL,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        data,
      }).pipe(
        catchError((err: FetchError<PromDataErrorResponse<PromVectorData | PromScalarData>>) => {
          if (err.cancelled) {
            return of(err);
          }
          return throwError(this.handleErrors(err));
        })
      )
      .toPromise()
      .then((res: FetchResponse<PromDataSuccessResponse<PromVectorData | PromScalarData>> | FetchError<PromDataErrorResponse<PromVectorData | PromScalarData>>) => {
        if (res.status === 200) {
          if (res.data.status === 'success') {
            return res.data.data.result;
          }
          throw new Error(`Prom query failed body: ${res.data}`);
        } else {
          throw new Error(`Failed with status ${res.status} body: ${res.data}`);
        }
      });
  }

  private handleErrors = (err: any): DataQueryError => {
    const error: DataQueryError = {
      message: (err && err.statusText) || 'Unknown error during query transaction. Please check JS console logs.',
    };

    if (err.data) {
      if (typeof err.data === 'string') {
        error.message = err.data;
      } else if (err.data.error) {
        error.message = this.safeStringifyValue(err.data.error);
      }
    } else if (err.message) {
      error.message = err.message;
    } else if (typeof err === 'string') {
      error.message = err;
    }

    error.status = err.status;
    error.statusText = err.statusText;

    return error;
  };

  private safeStringifyValue = (value: any): string => {
    if (!value) {
      return '';
    }

    try {
      return JSON.stringify(value, null);
    } catch (error) {
      console.error(error);
    }

    return '';
  };
}
