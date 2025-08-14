import {
  IAuthenticateGeneric,
  ICredentialType,
  INodeProperties,
  Icon,
  ICredentialTestRequest,
} from 'n8n-workflow';

export class JupiterOneApi implements ICredentialType {
  name = 'jupiteroneApi';
  displayName = 'JupiterOne API';
  icon = 'file:jupiterone.svg' as Icon;
  documentationUrl =
    'https://docs.jupiterone.io/integrations/outbound-directory/n8n-community-node';

  properties: INodeProperties[] = [
    {
      displayName: 'Account ID',
      name: 'accountId',
      type: 'string',
      default: '',
      required: true,
      description: 'Your JupiterOne account ID',
    },
    {
      displayName: 'API Token',
      name: 'accessToken',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'Your JupiterOne API access token',
    },
    {
      displayName: 'API Base URL',
      name: 'apiBaseUrl',
      type: 'string',
      default: 'https://api.us.jupiterone.io',
      required: false,
      description: 'JupiterOne API base URL (optional, defaults to US region)',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: `=Bearer {{ $credentials.accessToken }}`,
        'Content-Type': 'application/json',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      method: 'POST',
      url: '={{ $credentials.apiBaseUrl }}/graphql',
      headers: {
        'JupiterOne-Account': '={{ $credentials.accountId }}',
        'Content-Type': 'application/json',
      },
      body: '{"query":"query TestQuery { __typename }","variables":{}}',
    },
  };
}
