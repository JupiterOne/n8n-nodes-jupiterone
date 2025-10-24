import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeApiError } from 'n8n-workflow';

// Constants from JupiterOne client
const QUERY_RESULTS_TIMEOUT = 1000 * 60 * 5; // 5 minutes
const JobStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
};

// GraphQL query from JupiterOne client
const QUERY_V1 = `query QueryLanguageV1(
  $query: String!
  $variables: JSON
  $includeDeleted: Boolean
  $deferredResponse: DeferredResponseOption
  $deferredFormat: DeferredResponseFormat
  $cursor: String
  $flags: QueryV1Flags
) {
  queryV1(
    query: $query
    variables: $variables
    includeDeleted: $includeDeleted
    deferredResponse: $deferredResponse
    deferredFormat: $deferredFormat
    cursor: $cursor
    flags: $flags
  ) {
    type
    data
    url
  }
}`;

export class JupiterOneQuery implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'JupiterOne Query',
    name: 'jupiterOneQuery',
    icon: { light: 'file:jupiterone.svg', dark: 'file:jupiterone.svg' },
    group: ['transform'],
    version: 1,
    description: 'Run J1QL queries against your JupiterOne account',
    defaults: {
      name: 'JupiterOne Query',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    properties: [
      {
        displayName: 'J1QL Query',
        name: 'query',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        required: true,
        description: 'The J1QL query to execute (LIMIT will be automatically appended)',
        placeholder: 'FIND jupiterone_account',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        typeOptions: {
          minValue: 1,
        },
        default: 50,
        description: 'Max number of results to return',
      },
    ],
    credentials: [
      {
        name: 'jupiteroneApi',
        required: true,
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const MAX_LIMIT = 10000;

    for (let i = 0; i < items.length; i++) {
      try {
        const credentials = await this.getCredentials('jupiteroneApi');
        const accountId = credentials.accountId as string;
        const accessToken = credentials.accessToken as string;
        const apiBaseUrl = (credentials.apiBaseUrl as string) || 'https://api.us.jupiterone.io';
        const graphqlEndpoint = `${apiBaseUrl.replace(/\/$/, '')}/graphql`;

        let baseQuery = this.getNodeParameter('query', i) as string;
        let limit = this.getNodeParameter('limit', i) as number | undefined;
        if (!limit || isNaN(limit)) {
          limit = MAX_LIMIT;
        }
        if (limit > MAX_LIMIT) {
          throw new NodeApiError(this.getNode(), {
            message: `Limit value ${limit} exceeds maximum allowed value of ${MAX_LIMIT}. Please specify a limit between 1 and ${MAX_LIMIT}, or leave empty for all results.`,
            description: `JupiterOne n8n node has a maximum limit of ${MAX_LIMIT} results per query.`,
          });
        }
        // Remove any LIMIT clause from the query
        baseQuery = baseQuery.replace(/LIMIT\s+\d+/i, '').trim();
        let results: any[] = [];
        let cursor: string | null = null;
        let page = 0;
        while (results.length < limit) {
          page++;

          // Prepare GraphQL query
          const graphqlQuery = {
            query: QUERY_V1,
            variables: {
              query: baseQuery,
              deferredResponse: 'FORCE',
              cursor,
            },
          };

          const headers = {
            Authorization: `Bearer ${accessToken}`,
            'JupiterOne-Account': accountId,
            'content-type': 'application/json',
          };

          const graphqlRes = await this.helpers.httpRequest.call(this, {
            url: graphqlEndpoint,
            method: 'POST',
            headers,
            body: JSON.stringify(graphqlQuery),
            json: true,
          });

          if (graphqlRes.errors) {
            this.logger.error(`❌ GraphQL errors: ${JSON.stringify(graphqlRes.errors)}`);
            throw new NodeApiError(this.getNode(), {
              message: `JupiterOne returned error(s) for query: '${baseQuery}'`,
              description: JSON.stringify(graphqlRes.errors),
            });
          }

          const deferredUrl = graphqlRes?.data?.queryV1?.url;
          if (!deferredUrl) {
            throw new NodeApiError(this.getNode(), {
              message: 'No deferred result URL returned from JupiterOne.',
              description: `Response: ${JSON.stringify(graphqlRes)}`,
            });
          }
          // Poll for results
          const pollInterval = 1000; // ms
          const startTime = Date.now();
          let statusFile: any;
          let status: string = JobStatus.IN_PROGRESS;
          while (status === JobStatus.IN_PROGRESS) {
            if (Date.now() - startTime > QUERY_RESULTS_TIMEOUT) {
              throw new NodeApiError(this.getNode(), {
                message: `Exceeded request timeout of ${QUERY_RESULTS_TIMEOUT / 1000} seconds.`,
              });
            }
            const delayStart = Date.now();
            while (Date.now() - delayStart < pollInterval) {}
            const pollRes = await this.helpers.httpRequest.call(this, {
              url: deferredUrl,
              method: 'GET',
              headers,
              json: true,
            });
            statusFile = pollRes as any;
            status = statusFile.status;
          }
          if (status === JobStatus.FAILED) {
            throw new NodeApiError(this.getNode(), {
              message: `JupiterOne returned error(s) for query: '${statusFile.error}'`,
            });
          }
          const pageResults = statusFile?.data || [];
          results = results.concat(pageResults);
          cursor = statusFile?.cursor || null;

          // Stop if no more results or we've reached the limit or no cursor
          if (!cursor || pageResults.length === 0 || results.length >= limit) {
            returnData.push({
              json: { results: results.slice(0, limit), limit, baseQuery },
              pairedItem: { item: i },
            });
            break;
          }
        }
      } catch (err) {
        this.logger.error('❌ Error in JupiterOne Query Node:', err);
        if (err instanceof Error) {
          this.logger.error(`❌ Error message: ${err.message}`);
          this.logger.error(`❌ Error stack: ${err.stack}`);
        }

        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: err.message,
              limit: (this.getNodeParameter('limit', i) as number) || null,
            },
            pairedItem: { item: i },
          });
        } else {
          throw err;
        }
      }
    }
    return [returnData];
  }
}
