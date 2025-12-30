/**
 * Environment variables configuration
 */

export const env = {
  FILEBROWSER_URL: process.env.FILEBROWSER_URL || '',
  FILEBROWSER_API_KEY: process.env.FILEBROWSER_API_KEY || '',
  FILEBROWSER_SOURCE: process.env.FILEBROWSER_SOURCE || 'default',
} as const;

export function validateEnv() {
  if (!env.FILEBROWSER_URL) {
    throw new Error('FILEBROWSER_URL is required');
  }
}

