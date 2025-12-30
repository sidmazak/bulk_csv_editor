/**
 * Filebrowser API Client
 * Handles all interactions with the filebrowser API
 */

import { env } from './env';

const FILEBROWSER_URL = env.FILEBROWSER_URL;
const FILEBROWSER_API_KEY = env.FILEBROWSER_API_KEY;
const FILEBROWSER_SOURCE = env.FILEBROWSER_SOURCE;

export interface FileInfo {
  name: string;
  path: string;
  type: 'directory' | string;
  size: number;
  modified: string;
  hidden: boolean;
  hasPreview: boolean;
}

export interface FileBrowserResponse {
  files: FileInfo[];
  folders: FileInfo[];
  name: string;
  path: string;
  size: number;
  type: string;
  modified: string;
}

class FileBrowserClient {
  private baseUrl: string;
  private apiKey: string;
  private source: string;

  constructor() {
    this.baseUrl = FILEBROWSER_URL;
    this.apiKey = FILEBROWSER_API_KEY;
    // Ensure source is never undefined or empty
    this.source = FILEBROWSER_SOURCE || 'default';
    
    // Don't throw on instantiation - throw when methods are called instead
    // This allows the module to load during build even if FILEBROWSER_URL is not set
  }

  private ensureConfigured() {
    if (!this.baseUrl) {
      throw new Error('FILEBROWSER_URL environment variable is not set');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    this.ensureConfigured(); // Check here instead of constructor
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Filebrowser API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * List files and directories at a given path
   */
  async listResources(path: string = '/'): Promise<FileBrowserResponse> {
    this.ensureConfigured(); // Check here
    // Ensure path starts with / and normalize it
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const sourceParam = encodeURIComponent(this.source);
    const pathParam = encodeURIComponent(normalizedPath);
    
    const endpoint = `/api/resources?path=${pathParam}&source=${sourceParam}`;
    return this.request<FileBrowserResponse>(endpoint);
  }

  /**
   * Download a file
   */
  async downloadFile(path: string): Promise<Blob> {
    this.ensureConfigured(); // Check here
    const url = `${this.baseUrl}/api/raw?files=${this.source}::${encodeURIComponent(path)}`;
    const headers: HeadersInit = {};

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    return response.blob();
  }

  /**
   * Upload a file
   */
  async uploadFile(
    file: File | Blob,
    destinationPath: string,
    override: boolean = false
  ): Promise<void> {
    this.ensureConfigured(); // Check here
    const url = `${this.baseUrl}/api/resources?path=${encodeURIComponent(destinationPath)}&source=${this.source}${override ? '&override=true' : ''}`;
    const headers: Record<string, string> = {
      'Content-Type': file.type || 'text/plain',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    // Send the file content directly as the request body (not multipart)
    // This prevents multipart boundaries from being written into the file
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: file,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upload file: ${response.status} - ${error}`);
    }
  }

  /**
   * Get all CSV files in a directory recursively
   */
  async getAllCSVFiles(path: string = '/'): Promise<FileInfo[]> {
    this.ensureConfigured(); // Check here
    const csvFiles: FileInfo[] = [];
    
    const list = await this.listResources(path);
    
    // Add CSV files from current directory with full paths
    list.files
      .filter((file) => file.name.toLowerCase().endsWith('.csv'))
      .forEach((file) => {
        const filePath = path === '/' ? `/${file.name}` : `${path}/${file.name}`;
        csvFiles.push({
          ...file,
          path: filePath,
        });
      });

    // Recursively get CSV files from subdirectories
    for (const folder of list.folders) {
      // Construct subdirectory path using current path
      const subPath = path === '/' ? `/${folder.name}` : `${path}/${folder.name}`;
      const subFiles = await this.getAllCSVFiles(subPath);
      csvFiles.push(...subFiles);
    }

    return csvFiles;
  }
}

// Make it lazy - only instantiate when accessed
let _filebrowserClient: FileBrowserClient | null = null;

function getFilebrowserClient(): FileBrowserClient {
  if (!_filebrowserClient) {
    _filebrowserClient = new FileBrowserClient();
  }
  return _filebrowserClient;
}

// Keep the export for backwards compatibility, but make it lazy using a Proxy
export const filebrowserClient = new Proxy({} as FileBrowserClient, {
  get(_target, prop) {
    const client = getFilebrowserClient();
    const value = client[prop as keyof FileBrowserClient];
    // If it's a function, bind it to the client instance
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});

