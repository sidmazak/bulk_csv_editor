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
    
    // Validate configuration
    if (!this.baseUrl) {
      throw new Error('FILEBROWSER_URL environment variable is not set');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
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

export const filebrowserClient = new FileBrowserClient();

