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

		this.logger.info('🚀 JupiterOne Query Node: Starting execution');
		this.logger.info(`📊 Input items count: ${items.length}`);

		for (let i = 0; i < items.length; i++) {
			try {
				this.logger.info(`🔄 Processing item ${i + 1}/${items.length}`);
				
				const credentials = await this.getCredentials('jupiteroneApi');
				this.logger.info('🔍 Raw credentials object:', { credentials: JSON.stringify(credentials, null, 2) });
				this.logger.info('🔍 Credentials type:', { type: typeof credentials });
				this.logger.info('🔍 Credentials keys:', { keys: Object.keys(credentials || {}) });
				
				const baseQuery = this.getNodeParameter('query', i) as string;
				const limit = this.getNodeParameter('limit', i) as number;

				// Validate limit value if specified
				if (limit && limit > 250) {
					this.logger.error(`❌ Limit value ${limit} exceeds maximum allowed value of 250`);
					throw new NodeApiError(this.getNode(), {
						message: `Limit value ${limit} exceeds maximum allowed value of 250. Please specify a limit between 1 and 250, or leave empty for all results.`,
						description: 'JupiterOne API has a maximum limit of 250 results per query.'
					});
				}

				// Handle LIMIT logic
				let finalQuery = baseQuery.trim();
				let appliedLimit: number | null = limit;
				
				if (!limit || limit <= 0) {
					// If no limit specified, remove any existing LIMIT clause
					finalQuery = finalQuery.replace(/LIMIT\s+\d+/i, '').trim();
					appliedLimit = null;
					this.logger.info(`🔍 No limit specified - removing LIMIT clause`);
				} else {
					// Apply the specified limit
					if (!finalQuery.toLowerCase().includes('limit')) {
						finalQuery += ` LIMIT ${limit}`;
					} else {
						// If LIMIT is already present, replace it with our limit
						finalQuery = finalQuery.replace(/LIMIT\s+\d+/i, `LIMIT ${limit}`);
					}
				}

				this.logger.info(`🔍 Base query: ${baseQuery}`);
				this.logger.info(`🔍 Limit: ${appliedLimit || 'none (all results)'}`);
				this.logger.info(`🔍 Final query: ${finalQuery}`);

				const accountId = credentials.accountId as string;
				const accessToken = credentials.accessToken as string;
				const apiBaseUrl = (credentials.apiBaseUrl as string) || 'https://api.us.jupiterone.io';
				const graphqlEndpoint = `${apiBaseUrl.replace(/\/$/, '')}/graphql`;

				this.logger.info('🔑 Credentials loaded:', {
					accountId: credentials.accountId,
					apiBaseUrl: credentials.apiBaseUrl,
					hasAccessToken: !!credentials.accessToken
				});
				this.logger.info('🔍 Individual credential values:', {
					accountId: credentials.accountId,
					accountIdType: typeof credentials.accountId,
					accessTokenPresent: !!credentials.accessToken,
					accessTokenType: typeof credentials.accessToken,
					apiBaseUrl: credentials.apiBaseUrl,
					apiBaseUrlType: typeof credentials.apiBaseUrl
				});
				
				this.logger.info(`🔍 Query to execute: ${finalQuery}`);
				this.logger.info(`🌐 GraphQL endpoint: ${graphqlEndpoint}`);

				// Validate credentials before proceeding
				if (!accountId || !accessToken) {
					this.logger.error('❌ Missing required credentials:');
					this.logger.error(`  - accountId: ${accountId ? 'present' : 'missing'}`);
					this.logger.error(`  - accessToken: ${accessToken ? 'present' : 'missing'}`);
					throw new NodeApiError(this.getNode(), {
						message: 'Missing required JupiterOne credentials. Please check your account ID and API token.',
						description: 'Both account ID and API token are required to authenticate with JupiterOne.'
					});
				}

				// Step 1: Send the J1QL query as a GraphQL request (using JupiterOne client logic)
				const graphqlQuery = {
					query: QUERY_V1,
					variables: {
						query: finalQuery,
						deferredResponse: 'FORCE',
						flags: { variableResultSize: true },
						cursor: null,
					},
				};

				this.logger.info(`📤 GraphQL query object: ${JSON.stringify(graphqlQuery, null, 2)}`);

				const headers = {
					'Authorization': `Bearer ${accessToken}`,
					'JupiterOne-Account': accountId,
					'content-type': 'application/json',
				};

				this.logger.info('📋 Request headers:', {
					'Authorization': 'Bearer [REDACTED]',
					'JupiterOne-Account': accountId,
					'content-type': 'application/json',
				});

				this.logger.info('📡 Making GraphQL request...');
				const graphqlRes = await this.helpers.httpRequest.call(this, {
					url: graphqlEndpoint,
					method: 'POST',
					headers,
					body: JSON.stringify(graphqlQuery),
					json: true,
				});

				this.logger.info(`📥 GraphQL response received: ${JSON.stringify(graphqlRes, null, 2)}`);

				if (graphqlRes.errors) {
					this.logger.error(`❌ GraphQL errors: ${JSON.stringify(graphqlRes.errors)}`);
					throw new NodeApiError(this.getNode(), { 
						message: `JupiterOne returned error(s) for query: '${finalQuery}'`,
						description: JSON.stringify(graphqlRes.errors)
					});
				}

				const deferredUrl = graphqlRes?.data?.queryV1?.url;
				this.logger.info(`🔗 Deferred URL: ${deferredUrl}`);
				
				if (!deferredUrl) {
					this.logger.error('❌ No deferred URL in response');
					throw new NodeApiError(this.getNode(), { 
						message: 'No deferred result URL returned from JupiterOne.',
						description: `Response: ${JSON.stringify(graphqlRes)}`
					});
				}

				// Step 2: Poll the deferred result URL until job is complete (using JupiterOne client logic)
				const pollInterval = 1000; // ms
				const startTime = Date.now();
				let statusFile: any; // JupiterOne result status file (dynamic shape)
				let status: string = JobStatus.IN_PROGRESS;
				let results: any[] = [];

				this.logger.info('⏳ Starting to poll for results...');

				while (status === JobStatus.IN_PROGRESS) {
					if (Date.now() - startTime > QUERY_RESULTS_TIMEOUT) {
						this.logger.error('⏰ Polling timeout exceeded');
						throw new NodeApiError(this.getNode(), { 
							message: `Exceeded request timeout of ${QUERY_RESULTS_TIMEOUT / 1000} seconds.`
						});
					}
					
					// Simple delay using busy wait (adapted from JupiterOne client)
					const delayStart = Date.now();
					while (Date.now() - delayStart < pollInterval) {
						// Wait for pollInterval milliseconds
					}
					
					this.logger.info('🔄 Polling for results...');
					const pollRes = await this.helpers.httpRequest.call(this, {
						url: deferredUrl,
						method: 'GET',
						headers,
						json: true,
					});
					statusFile = pollRes as any;
					status = statusFile.status;
					this.logger.info(`📊 Poll response status: ${status}`);
					this.logger.info(`📄 Poll response data: ${JSON.stringify(statusFile, null, 2)}`);
				}

				if (status === JobStatus.FAILED) {
					this.logger.error(`❌ Query failed: ${statusFile.error}`);
					throw new NodeApiError(this.getNode(), { 
						message: `JupiterOne returned error(s) for query: '${statusFile.error}'`
					});
				}

				results = statusFile?.data || [];
				this.logger.info('✅ Query completed successfully');
				this.logger.info(`📈 Results count: ${results.length}`);

				returnData.push({
					json: {
						query: finalQuery,
						baseQuery,
						limit: appliedLimit,
						results,
						timestamp: new Date().toISOString(),
					},
				});
				this.logger.info('✅ Item processed successfully');
			} catch (error) {
				this.logger.error('❌ Error in JupiterOne Query Node:', error);
				if (error instanceof Error) {
					this.logger.error(`❌ Error message: ${error.message}`);
					this.logger.error(`❌ Error stack: ${error.stack}`);
				}
				returnData.push({
					json: {
						error: error instanceof Error ? error.message : 'Unknown error occurred',
						query: this.getNodeParameter('query', i) as string,
						limit: this.getNodeParameter('limit', i) as number || null,
						timestamp: new Date().toISOString(),
					},
				});
			}
		}

		this.logger.info('🏁 JupiterOne Query Node: Execution completed');
		return [returnData];
	}
} 