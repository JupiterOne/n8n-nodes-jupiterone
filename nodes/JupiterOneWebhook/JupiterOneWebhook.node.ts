import type {
  IWebhookFunctions,
  INodeType,
  INodeTypeDescription,
  IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionType } from 'n8n-workflow';

export class JupiterOneWebhook implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'JupiterOne Webhook',
    name: 'jupiterOneWebhook',
    icon: { light: 'file:jupiterone.svg', dark: 'file:jupiterone.svg' },
    group: ['trigger'],
    version: 1,
    description: 'Listen for JupiterOne rule alerts and security events',
    defaults: {
      name: 'JupiterOne Webhook',
    },
    inputs: [],
    outputs: [NodeConnectionType.Main],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        path: 'jupiterone-webhook',
        responseMode: 'responseNode',
      },
    ],
    properties: [
      {
        displayName: 'Authentication',
        name: 'authentication',
        type: 'options',
        options: [
          { name: 'None', value: 'none' },
          { name: 'Header Token', value: 'header' },
        ],
        default: 'none',
        description: 'How to authenticate incoming webhooks',
      },
      {
        displayName: 'Webhook Secret',
        name: 'webhookSecret',
        type: 'string',
        typeOptions: {
          password: true,
        },
        default: '',
        displayOptions: {
          show: {
            authentication: ['header'],
          },
        },
        description: 'Secret token to verify webhook authenticity',
      },
      {
        displayName: 'Header Name',
        name: 'headerName',
        type: 'string',
        default: 'X-JupiterOne-Signature',
        displayOptions: {
          show: {
            authentication: ['header'],
          },
        },
        description: 'Name of the header containing the authentication token',
      },
    ],
  };

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const authentication = this.getNodeParameter('authentication') as string;

    // Get the request body and headers
    const body = this.getBodyData();
    const headers = this.getHeaderData();

    // Handle authentication if enabled
    if (authentication === 'header') {
      const webhookSecret = this.getNodeParameter('webhookSecret') as string;
      const headerName = this.getNodeParameter('headerName') as string;

      const receivedToken = headers[headerName.toLowerCase()] as string;

      if (!receivedToken) {
        this.logger.error(`❌ Missing authentication header: ${headerName}`);
        return {
          webhookResponse: {
            statusCode: 401,
            body: { error: 'Missing authentication header' },
          },
        };
      }

      if (receivedToken !== webhookSecret) {
        this.logger.error('❌ Invalid authentication token');
        return {
          webhookResponse: {
            statusCode: 401,
            body: { error: 'Invalid authentication token' },
          },
        };
      }
    }

    // Validate webhook payload structure
    if (!body || typeof body !== 'object') {
      this.logger.error('❌ Invalid webhook payload: not an object');
      return {
        webhookResponse: {
          statusCode: 400,
          body: { error: 'Invalid webhook payload' },
        },
      };
    }

    // Extract and structure the data for downstream nodes
    // Extract common fields from JupiterOne webhook payload
    const { ruleName, severity, triggeredAt, queryData, queryResults, data, ...otherFields } = body;

    // Structure the output data for downstream nodes
    const webhookData: any = {
      ruleName: ruleName || 'Unknown Rule',
      severity: severity || 'UNKNOWN',
      triggeredAt: triggeredAt || new Date().toISOString(),
      timestamp: new Date().toISOString(),
    };

    // Handle different payload structures
    if (queryData) {
      webhookData.queryData = queryData;
    }

    if (queryResults) {
      webhookData.queryResults = queryResults;
      webhookData.totalResults = (queryResults as any)?.total || 0;
    }

    if (data && Array.isArray(data)) {
      webhookData.entities = data;
      webhookData.totalEntities = data.length;
    }

    // Include any other fields that might be present
    Object.assign(webhookData, otherFields);

    return {
      webhookResponse: {
        statusCode: 200,
        body: { status: 'ok' },
      },
      workflowData: [
        [
          {
            json: webhookData,
          },
        ],
      ],
    };
  }
}
