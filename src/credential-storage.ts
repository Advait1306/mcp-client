import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StoredCredentials {
  clientId: string;
  clientSecret?: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number;
  registrationResponse?: any;
}

const CREDENTIALS_FILE = path.join(__dirname, '..', 'auth-credentials.json');

export class CredentialStorage {
  async saveCredentials(credentials: StoredCredentials): Promise<void> {
    try {
      await fs.writeFile(
        CREDENTIALS_FILE,
        JSON.stringify(credentials, null, 2),
        'utf-8'
      );
      console.log('✓ Credentials saved successfully');
    } catch (error) {
      console.error('Failed to save credentials:', error);
      throw error;
    }
  }

  async loadCredentials(): Promise<StoredCredentials | null> {
    try {
      const data = await fs.readFile(CREDENTIALS_FILE, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      console.error('Failed to load credentials:', error);
      throw error;
    }
  }

  async clearCredentials(): Promise<void> {
    try {
      await fs.unlink(CREDENTIALS_FILE);
      console.log('✓ Credentials cleared');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to clear credentials:', error);
        throw error;
      }
    }
  }

  async hasValidCredentials(): Promise<boolean> {
    const credentials = await this.loadCredentials();
    if (!credentials) return false;

    // Check if token is expired
    if (credentials.expiresAt && credentials.expiresAt < Date.now()) {
      return false;
    }

    return true;
  }
}
