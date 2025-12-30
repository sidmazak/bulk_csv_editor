/**
 * Enhanced Cloud Storage Link Parser and Downloader
 * Supports multiple providers with directory and ZIP detection
 */

export type CloudStorageProvider = 
  | 'google-drive' 
  | 'dropbox' 
  | 'mega' 
  | 'terrabox'
  | 'onedrive'
  | 'box'
  | 'pcloud'
  | 'direct' 
  | 'unknown';

export interface CloudStorageLink {
  provider: CloudStorageProvider;
  originalUrl: string;
  directUrl: string;
  filename?: string;
  isDirectory?: boolean;
  isZip?: boolean;
  fileId?: string;
}

export function detectProvider(url: string): CloudStorageProvider {
  const normalizedUrl = url.toLowerCase().trim();
  
  if (normalizedUrl.includes('drive.google.com') || normalizedUrl.includes('docs.google.com')) {
    return 'google-drive';
  }
  if (normalizedUrl.includes('dropbox.com')) {
    return 'dropbox';
  }
  if (normalizedUrl.includes('mega.nz')) {
    return 'mega';
  }
  if (normalizedUrl.includes('terrabox.com') || normalizedUrl.includes('terabox.com')) {
    return 'terrabox';
  }
  if (normalizedUrl.includes('onedrive.live.com') || normalizedUrl.includes('1drv.ms')) {
    return 'onedrive';
  }
  if (normalizedUrl.includes('box.com')) {
    return 'box';
  }
  if (normalizedUrl.includes('pcloud.com')) {
    return 'pcloud';
  }
  if (normalizedUrl.endsWith('.csv') || normalizedUrl.includes('.csv')) {
    return 'direct';
  }
  
  return 'unknown';
}

// Helper functions to extract file IDs from different providers
function extractDropboxFileId(url: string): string | undefined {
  // Dropbox URLs: https://www.dropbox.com/s/xxxxx/filename.csv?dl=0
  const match = url.match(/\/s\/([a-zA-Z0-9]+)/);
  return match ? match[1] : undefined;
}

function extractMegaFileId(url: string): string | undefined {
  // Mega URLs: https://mega.nz/file/xxxxx#yyyyy
  const match = url.match(/\/file\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : undefined;
}

function extractOneDriveFileId(url: string): string | undefined {
  // OneDrive URLs: https://onedrive.live.com/embed?resid=xxxxx
  const match = url.match(/resid=([a-zA-Z0-9!_-]+)/) || url.match(/\/id=([a-zA-Z0-9!_-]+)/);
  return match ? match[1].substring(0, 20) : undefined; // Limit length
}

function extractBoxFileId(url: string): string | undefined {
  // Box URLs: https://app.box.com/s/xxxxx
  const match = url.match(/\/s\/([a-zA-Z0-9]+)/);
  return match ? match[1] : undefined;
}

function extractPCloudFileId(url: string): string | undefined {
  // pCloud URLs: https://u.pcloud.link/publink/show?code=xxxxx
  const match = url.match(/code=([a-zA-Z0-9_-]+)/);
  return match ? match[1].substring(0, 20) : undefined;
}

function extractTerraboxFileId(url: string): string | undefined {
  // TerraBox URLs: https://www.terabox.com/s/xxxxx
  const match = url.match(/\/s\/([a-zA-Z0-9]+)/);
  return match ? match[1] : undefined;
}

export function convertGoogleDriveLink(url: string): { directUrl: string; fileId?: string } {
  const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || 
                     url.match(/id=([a-zA-Z0-9_-]+)/) ||
                     url.match(/\/([a-zA-Z0-9_-]{25,})/);
  
  if (fileIdMatch && fileIdMatch[1]) {
    const fileId = fileIdMatch[1];
    return {
      directUrl: `https://drive.google.com/uc?export=download&id=${fileId}`,
      fileId,
    };
  }
  
  return { directUrl: url };
}

export function convertDropboxLink(url: string): string {
  if (url.includes('dropbox.com') && url.includes('?dl=0')) {
    return url.replace('?dl=0', '?dl=1');
  }
  if (url.includes('dropbox.com') && !url.includes('?dl=')) {
    return url + '?dl=1';
  }
  return url;
}

export function convertOneDriveLink(url: string): string {
  // OneDrive share links need conversion
  if (url.includes('1drv.ms')) {
    // Convert short link to direct download
    return url.replace('1drv.ms', 'onedrive.live.com/download');
  }
  if (url.includes('onedrive.live.com') && !url.includes('download')) {
    return url + '&download=1';
  }
  return url;
}

export function convertBoxLink(url: string): string {
  if (url.includes('box.com/s/')) {
    // Box share links
    return url.replace('/s/', '/s/').replace(/\/$/, '') + '/download';
  }
  return url;
}

export function convertPCloudLink(url: string): string {
  if (url.includes('pcloud.com') && !url.includes('download')) {
    return url + '&download=1';
  }
  return url;
}

export function convertMegaLink(url: string): string {
  return url;
}

export function convertTerraboxLink(url: string): string {
  return url;
}

export function parseCloudStorageLink(url: string): CloudStorageLink {
  const provider = detectProvider(url);
  let directUrl = url;
  let filename: string | undefined;
  let isDirectory = false;
  let isZip = false;
  let fileId: string | undefined;

  switch (provider) {
    case 'google-drive': {
      const result = convertGoogleDriveLink(url);
      directUrl = result.directUrl;
      fileId = result.fileId;
      // Use fileId.csv format if we have fileId
      filename = fileId ? `${fileId}.csv` : 'file.csv';
      // Check if it's a folder (directory) - folders have /folders/ in URL
      if (url.includes('/folders/') || url.includes('/folder/')) {
        isDirectory = true;
      }
      break;
    }
    case 'dropbox': {
      directUrl = convertDropboxLink(url);
      fileId = extractDropboxFileId(url);
      const urlFilename = url.match(/[^/]+\.(csv|zip)/)?.[0] || url.match(/[^/]+$/)?.[0];
      filename = (urlFilename && !urlFilename.includes('?') ? urlFilename : (fileId ? `${fileId}.csv` : 'file.csv'));
      isZip = filename.toLowerCase().endsWith('.zip');
      // Dropbox folders typically don't have file extensions
      if (!isZip && !filename.toLowerCase().endsWith('.csv') && !url.includes('?dl=')) {
        filename = fileId ? `${fileId}.csv` : 'file.csv';
      }
      break;
    }
    case 'mega': {
      directUrl = url;
      fileId = extractMegaFileId(url);
      const urlFilename = url.match(/[^/]+\.(csv|zip)/)?.[0];
      filename = urlFilename || (fileId ? `${fileId}.csv` : 'file.csv');
      isZip = filename.toLowerCase().endsWith('.zip');
      break;
    }
    case 'terrabox': {
      directUrl = url;
      fileId = extractTerraboxFileId(url);
      const urlFilename = url.match(/[^/]+\.(csv|zip)/)?.[0];
      filename = urlFilename || (fileId ? `${fileId}.csv` : 'file.csv');
      isZip = filename.toLowerCase().endsWith('.zip');
      break;
    }
    case 'onedrive': {
      directUrl = convertOneDriveLink(url);
      fileId = extractOneDriveFileId(url);
      const urlFilename = url.match(/[^/]+\.(csv|zip)/)?.[0];
      filename = urlFilename || (fileId ? `${fileId}.csv` : 'file.csv');
      isZip = filename.toLowerCase().endsWith('.zip');
      break;
    }
    case 'box': {
      directUrl = convertBoxLink(url);
      fileId = extractBoxFileId(url);
      const urlFilename = url.match(/[^/]+\.(csv|zip)/)?.[0];
      filename = urlFilename || (fileId ? `${fileId}.csv` : 'file.csv');
      isZip = filename.toLowerCase().endsWith('.zip');
      break;
    }
    case 'pcloud': {
      directUrl = convertPCloudLink(url);
      fileId = extractPCloudFileId(url);
      const urlFilename = url.match(/[^/]+\.(csv|zip)/)?.[0];
      filename = urlFilename || (fileId ? `${fileId}.csv` : 'file.csv');
      isZip = filename.toLowerCase().endsWith('.zip');
      break;
    }
    case 'direct': {
      directUrl = url;
      const urlFilename = url.match(/[^/]+\.(csv|zip)/)?.[0];
      filename = urlFilename || 'file.csv';
      isZip = filename.toLowerCase().endsWith('.zip');
      break;
    }
    default: {
      // For unknown providers, try to be flexible
      directUrl = url;
      const urlFilename = url.match(/[^/]+\.(csv|zip)/)?.[0];
      filename = urlFilename || 'file.csv';
      isZip = filename.toLowerCase().endsWith('.zip');
      // Don't mark as directory for unknown providers - let download attempt determine
    }
  }

  // Detect if it's a directory based on explicit folder indicators
  // Only mark as directory if we're certain (has folder indicators)
  if (url.includes('/folders/') || url.includes('/folder/') || url.includes('?folder=')) {
    isDirectory = true;
  }

  return {
    provider,
    originalUrl: url,
    directUrl,
    filename,
    isDirectory,
    isZip,
    fileId,
  };
}

/**
 * Extract filename from Content-Disposition header
 */
function extractFilenameFromHeader(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  
  // Try filename="..." or filename*=UTF-8''...
  const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  if (filenameMatch) {
    let filename = filenameMatch[1];
    // Remove quotes
    filename = filename.replace(/^["']|["']$/g, '');
    // Handle UTF-8 encoded filenames
    if (filename.startsWith("UTF-8''")) {
      filename = decodeURIComponent(filename.substring(7));
    }
    return filename;
  }
  return null;
}

export async function downloadFromCloudStorage(link: CloudStorageLink): Promise<{ blob: Blob; filename?: string }> {
  try {
    // For Google Drive, handle the virus scan warning page
    let downloadUrl = link.directUrl;
    
    if (link.provider === 'google-drive' && link.fileId) {
      // Use alternative download method that handles large files and virus warnings
      downloadUrl = `https://drive.google.com/uc?export=download&id=${link.fileId}&confirm=t`;
    }

    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Accept': link.isZip 
          ? 'application/zip,application/octet-stream,*/*'
          : 'text/csv,application/csv,text/plain,*/*',
      },
      redirect: 'follow', // Follow redirects for cloud storage providers
    });

    // Handle Google Drive virus scan warning (returns HTML instead of file)
    if (link.provider === 'google-drive') {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        // Try alternative method without confirm parameter
        const altUrl = `https://drive.google.com/uc?export=download&id=${link.fileId}`;
        const altResponse = await fetch(altUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/csv,application/csv,text/plain,*/*',
          },
          redirect: 'follow',
        });
        
        if (!altResponse.ok) {
          throw new Error(`Failed to download from Google Drive: ${altResponse.status} ${altResponse.statusText}. Make sure the file is publicly accessible.`);
        }
        
        const altContentType = altResponse.headers.get('content-type') || '';
        if (altContentType.includes('text/html')) {
          throw new Error('Google Drive file requires confirmation. Please ensure the file is set to "Anyone with the link can view" and try again.');
        }
        
        const blob = await altResponse.blob();
        const filename = extractFilenameFromHeader(altResponse.headers.get('content-disposition'));
        
        // Validate that we got actual content (not an error page)
        if (blob.size === 0) {
          throw new Error(`Empty file received from Google Drive. Please check the link.`);
        }
        
        return { blob, filename: filename || undefined };
      }
    }

    if (!response.ok) {
      // Provide more helpful error messages
      if (response.status === 403) {
        throw new Error(`Access denied. Please ensure the file is publicly accessible (${link.provider}).`);
      }
      if (response.status === 404) {
        throw new Error(`File not found. Please check the link (${link.provider}).`);
      }
      throw new Error(`Failed to download from ${link.provider}: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    const filename = extractFilenameFromHeader(response.headers.get('content-disposition'));
    
    // Validate that we got actual content (not an error page)
    if (blob.size === 0) {
      throw new Error(`Empty file received from ${link.provider}. Please check the link.`);
    }

    return { blob, filename: filename || undefined };
  } catch (error) {
    throw new Error(`Error downloading from ${link.provider}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Extract CSV files from ZIP
export async function extractCSVFromZip(blob: Blob): Promise<File[]> {
  // This would require JSZip library
  // For now, return empty array - implement with JSZip if needed
  return [];
}
