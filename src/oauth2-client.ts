import express from 'express';
import http from 'http';
import { randomBytes, createHash } from 'crypto';
import open from 'open';
import { CredentialStorage, StoredCredentials } from './credential-storage.js';

interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  grant_types_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export class OAuth2Client {
  private credentialStorage: CredentialStorage;
  private redirectUri = 'http://localhost:3000/callback';
  private callbackServer?: http.Server;

  constructor() {
    this.credentialStorage = new CredentialStorage();
  }

  /**
   * Discover OAuth2 metadata from the MCP server
   */
  async discoverMetadata(mcpServerUrl: string): Promise<OAuthMetadata> {
    try {
      // Try to fetch OAuth metadata from well-known endpoint
      const metadataUrl = new URL('/.well-known/oauth-authorization-server', mcpServerUrl);
      const response = await fetch(metadataUrl.toString());

      if (!response.ok) {
        throw new Error(`Failed to fetch OAuth metadata: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error discovering OAuth metadata:', error);
      throw error;
    }
  }

  /**
   * Register a new OAuth2 client dynamically (RFC 7591)
   */
  async registerClient(registrationEndpoint: string): Promise<any> {
    try {
      const registrationRequest = {
        client_name: 'Linear MCP Client',
        redirect_uris: [this.redirectUri],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none', // Public client (no client secret)
        application_type: 'native'
      };

      const response = await fetch(registrationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Client registration failed: ${response.statusText} - ${errorText}`);
      }

      const registration = await response.json();
      console.log('✓ Client registered successfully');
      console.log('  Client ID:', registration.client_id);

      return registration;
    } catch (error) {
      console.error('Error registering client:', error);
      throw error;
    }
  }

  /**
   * Generate PKCE challenge
   */
  private generatePKCE() {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256')
      .update(verifier)
      .digest('base64url');

    return {
      codeVerifier: verifier,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256'
    };
  }

  /**
   * Perform OAuth2 authorization code flow with PKCE
   */
  async authorize(
    authorizationEndpoint: string,
    tokenEndpoint: string,
    clientId: string,
    clientSecret?: string
  ): Promise<StoredCredentials> {
    const pkce = this.generatePKCE();
    const state = randomBytes(16).toString('hex');

    // Build authorization URL
    const authUrl = new URL(authorizationEndpoint);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', this.redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
    authUrl.searchParams.set('code_challenge_method', pkce.codeChallengeMethod);
    authUrl.searchParams.set('scope', 'read write');

    console.log('\n🔐 Opening browser for authorization...');
    console.log('If the browser does not open, visit this URL:');
    console.log(authUrl.toString());
    console.log('');

    // Start callback server
    const authCode = await this.startCallbackServer(state, authUrl.toString());

    // Exchange authorization code for tokens
    const tokenResponse = await this.exchangeCodeForToken(
      tokenEndpoint,
      authCode,
      clientId,
      clientSecret,
      pkce.codeVerifier
    );

    // Calculate expiration time
    const expiresAt = tokenResponse.expires_in
      ? Date.now() + tokenResponse.expires_in * 1000
      : undefined;

    const credentials: StoredCredentials = {
      clientId,
      clientSecret,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenType: tokenResponse.token_type,
      expiresAt,
    };

    await this.credentialStorage.saveCredentials(credentials);

    return credentials;
  }

  /**
   * Start local server to handle OAuth callback
   */
  private async startCallbackServer(expectedState: string, authUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const app = express();

      app.get('/callback', (req, res) => {
        const { code, state, error, error_description } = req.query;

        if (error) {
          res.send(`<h1>Authorization failed</h1><p>${error}: ${error_description}</p>`);
          this.callbackServer?.close();
          reject(new Error(`Authorization failed: ${error} - ${error_description}`));
          return;
        }

        if (state !== expectedState) {
          res.send('<h1>Invalid state parameter</h1>');
          this.callbackServer?.close();
          reject(new Error('State parameter mismatch'));
          return;
        }

        if (typeof code !== 'string') {
          res.send('<h1>Missing authorization code</h1>');
          this.callbackServer?.close();
          reject(new Error('Missing authorization code'));
          return;
        }

        res.send('<h1>Authorization successful!</h1><p>You can close this window and return to the terminal.</p>');

        // Close server after a short delay
        setTimeout(() => {
          this.callbackServer?.close();
        }, 1000);

        resolve(code);
      });

      this.callbackServer = app.listen(3000, () => {
        console.log('✓ Callback server started on http://localhost:3000');
      });

      // Open browser
      open(authUrl).catch(err => {
        console.error('Failed to open browser:', err);
      });
    });
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(
    tokenEndpoint: string,
    code: string,
    clientId: string,
    clientSecret?: string,
    codeVerifier?: string
  ): Promise<any> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: clientId,
    });

    if (codeVerifier) {
      body.set('code_verifier', codeVerifier);
    }

    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.statusText} - ${errorText}`);
    }

    const tokenData = await response.json();
    console.log('✓ Access token obtained');

    return tokenData;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    tokenEndpoint: string,
    refreshToken: string,
    clientId: string,
    clientSecret?: string
  ): Promise<StoredCredentials> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    });

    if (clientSecret) {
      body.set('client_secret', clientSecret);
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.statusText} - ${errorText}`);
    }

    const tokenData = await response.json();
    console.log('✓ Access token refreshed');

    const expiresAt = tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : undefined;

    const credentials: StoredCredentials = {
      clientId,
      clientSecret,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken,
      tokenType: tokenData.token_type,
      expiresAt,
    };

    await this.credentialStorage.saveCredentials(credentials);

    return credentials;
  }

  async getStoredCredentials(): Promise<StoredCredentials | null> {
    return this.credentialStorage.loadCredentials();
  }

  async clearCredentials(): Promise<void> {
    return this.credentialStorage.clearCredentials();
  }
}
