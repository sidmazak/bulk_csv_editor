'use client';

import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, X, File, Link as LinkIcon, Loader2, UploadCloud } from 'lucide-react';
import { parseCloudStorageLink, CloudStorageLink } from '@/lib/cloud-storage-client';
import Link from 'next/link';

interface UploadPanelProps {
  onFilesSelected: (files: Array<{ path: string; name: string; url?: string }>) => void;
}

export function UploadPanel({ onFilesSelected }: UploadPanelProps) {
  const [linkInput, setLinkInput] = useState('');
  const [selectedLinks, setSelectedLinks] = useState<CloudStorageLink[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; url: string; size: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Load files from sessionStorage on mount (from landing page)
  useEffect(() => {
    const stored = sessionStorage.getItem('uploadedFiles');
    if (stored) {
      try {
        const fileData = JSON.parse(stored);
        
        // Separate local files and cloud links
        const cloudFiles: CloudStorageLink[] = [];
        const localFiles: Array<{ name: string; url: string; size: number }> = [];
        
        fileData.forEach((file: any) => {
          if (file.type === 'cloud' && file.url) {
            // Parse cloud storage link - use the originalUrl if available, otherwise use url
            // The originalUrl preserves the shareable link format for proper parsing
            const urlToParse = file.originalUrl || file.url;
            const parsedLink = parseCloudStorageLink(urlToParse);
            cloudFiles.push(parsedLink);
          } else if (file.type === 'local') {
            // Local files that were already uploaded
            if (file.url) {
              localFiles.push({
                name: file.name,
                url: file.url,
                size: file.size || 0,
              });
            }
          }
        });
        
        if (cloudFiles.length > 0) {
          setSelectedLinks(cloudFiles);
        }
        if (localFiles.length > 0) {
          setUploadedFiles(localFiles);
        }
        
        sessionStorage.removeItem('uploadedFiles');
      } catch (e) {
        console.error('Failed to parse stored files:', e);
      }
    }
  }, []);

  const handleAddLink = async () => {
    if (!linkInput.trim()) {
      setError('Please enter a link');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const parsedLink = parseCloudStorageLink(linkInput.trim());
      
      if (parsedLink.provider === 'unknown') {
        setError('Unsupported cloud storage provider. Supported: Google Drive, Dropbox, Mega, TerraBox, OneDrive, Box, pCloud, or direct CSV links');
        setLoading(false);
        return;
      }

      if (parsedLink.isDirectory) {
        setError('Directory links are not yet supported. Please provide direct CSV file links.');
        setLoading(false);
        return;
      }

      if (parsedLink.isZip) {
        setError('ZIP files are not yet supported. Please provide direct CSV file links.');
        setLoading(false);
        return;
      }

      // For cloud storage providers, we can't always determine file type from URL
      // So we're more lenient - only check for direct links or if filename is explicitly not CSV
      // Cloud storage links will be validated during actual download
      const isDirectLink = parsedLink.provider === 'direct';
      const hasExplicitNonCsvExtension = parsedLink.filename && 
        !parsedLink.filename.toLowerCase().endsWith('.csv') && 
        parsedLink.filename.includes('.') &&
        parsedLink.filename !== 'file.csv'; // Allow our default filename
      
      if (isDirectLink && !parsedLink.filename?.toLowerCase().endsWith('.csv')) {
        setError('Please provide a link to a CSV file');
        setLoading(false);
        return;
      }
      
      // For cloud storage, we allow the link - validation happens during download
      // Only show warning for non-Google Drive providers with explicit non-CSV extensions
      if (hasExplicitNonCsvExtension && parsedLink.provider !== 'google-drive') {
        // Just proceed - the download will validate the actual file type
      }

      setSelectedLinks((prev) => {
        if (prev.some((link) => link.originalUrl === parsedLink.originalUrl)) {
          setError('This link is already added');
          return prev;
        }
        return [...prev, parsedLink];
      });

      setLinkInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse link');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLink = (index: number) => {
    setSelectedLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(
      (file) => file.name.toLowerCase().endsWith('.csv')
    );

    if (selectedFiles.length > 0) {
      setUploading(true);
      setError(null);
      
      try {
        const uploadPromises = selectedFiles.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`Failed to upload ${file.name}`);
          }
          
          const data = await response.json();
          return {
            name: file.name,
            url: data.url,
            size: file.size,
          };
        });
        
        const uploaded = await Promise.all(uploadPromises);
        setUploadedFiles((prev) => [...prev, ...uploaded]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload files');
      } finally {
        setUploading(false);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.name.toLowerCase().endsWith('.csv')
    );

    if (droppedFiles.length > 0) {
      setUploading(true);
      setError(null);
      
      try {
        const uploadPromises = droppedFiles.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          
          const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`Failed to upload ${file.name}`);
          }
          
          const data = await response.json();
          return {
            name: file.name,
            url: data.url,
            size: file.size,
          };
        });
        
        const uploaded = await Promise.all(uploadPromises);
        setUploadedFiles((prev) => [...prev, ...uploaded]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload files');
      } finally {
        setUploading(false);
      }
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Update selected files whenever links or uploaded files change
  useEffect(() => {
    const files: Array<{ path: string; name: string; url?: string }> = [];

    // Add cloud storage links
    selectedLinks.forEach((link) => {
      files.push({
        path: link.originalUrl, // Use originalUrl as path for identification
        name: link.filename || 'file.csv',
        url: link.directUrl, // Use directUrl for downloading
      });
    });

    // Add uploaded files
    uploadedFiles.forEach((file) => {
      files.push({
        path: file.name,
        name: file.name,
        url: file.url,
      });
    });

    onFilesSelected(files);
  }, [selectedLinks, uploadedFiles, onFilesSelected]);

  const totalFiles = selectedLinks.length + uploadedFiles.length;

  return (
    <div className="flex h-full flex-col border-r bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="border-b p-4 shrink-0">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Upload CSV Files</h2>
          </Link>
          {totalFiles > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {totalFiles} file{totalFiles !== 1 ? 's' : ''} selected
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedLinks([]);
                  setUploadedFiles([]);
                  onFilesSelected([]);
                }}
              >
                Clear
              </Button>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="upload" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <TabsList className="mx-4 mt-2 shrink-0">
          <TabsTrigger value="upload" className="flex-1">
            <UploadCloud className="mr-2 h-4 w-4" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="link" className="flex-1">
            <LinkIcon className="mr-2 h-4 w-4" />
            Cloud Link
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="flex-1 flex flex-col mt-0 p-4 min-h-0 overflow-y-auto">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`
              border-2 border-dashed rounded-lg p-8 transition-all mb-4
              ${isDragging 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600'
              }
            `}
          >
            <div className="flex flex-col items-center justify-center space-y-4">
              {uploading ? (
                <Loader2 className="h-12 w-12 text-blue-500 animate-spin" />
              ) : (
                <Upload className={`h-12 w-12 ${isDragging ? 'text-blue-500' : 'text-zinc-400'}`} />
              )}
              <div className="text-center space-y-2">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {uploading 
                    ? 'Uploading files...' 
                    : isDragging 
                    ? 'Drop your CSV files here' 
                    : 'Drag & drop your CSV files'}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  or click to browse
                </p>
              </div>
              <input
                type="file"
                accept=".csv"
                multiple
                onChange={handleFileInput}
                className="hidden"
                id="file-upload"
                disabled={uploading}
              />
              <label htmlFor="file-upload">
                <Button asChild variant="outline" size="sm" disabled={uploading}>
                  <span>{uploading ? 'Uploading...' : 'Select Files'}</span>
                </Button>
              </label>
            </div>
          </div>

          {/* Show all files - both uploaded and cloud links */}
          {(uploadedFiles.length > 0 || selectedLinks.length > 0) && (
            <div className="space-y-4">
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  <Label>Uploaded Files</Label>
                  <div className="space-y-2">
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-3 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <File className="h-4 w-4 text-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {(file.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedLinks.length > 0 && (
                <div className="space-y-2">
                  <Label>Cloud Storage Files</Label>
                  <div className="space-y-2">
                    {selectedLinks.map((link, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 p-3 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <File className="h-4 w-4 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {link.filename || 'file.csv'}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {link.provider.replace('-', ' ')}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveLink(index)}
                          className="shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="link" className="flex-1 flex flex-col mt-0 p-4 min-h-0 overflow-y-auto">
          <div className="space-y-2">
            <Label htmlFor="cloud-link">Cloud Storage Link</Label>
            <div className="flex gap-2">
              <Input
                id="cloud-link"
                type="text"
                placeholder="Paste Google Drive, Dropbox, Mega, TerraBox, or direct CSV link..."
                value={linkInput}
                onChange={(e) => {
                  setLinkInput(e.target.value);
                  setError(null);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddLink();
                  }
                }}
                className="flex-1"
              />
              <Button
                onClick={handleAddLink}
                disabled={loading || !linkInput.trim()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
              </Button>
            </div>
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <p className="text-xs text-zinc-500">
              Supported: Google Drive, Dropbox, Mega, TerraBox, OneDrive, Box, pCloud, or direct CSV file links
            </p>
          </div>

          {selectedLinks.length > 0 && (
            <div className="space-y-2 mt-4">
              <Label>Cloud Storage Files</Label>
              <div className="space-y-2">
                {selectedLinks.map((link, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 p-3 border rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <File className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {link.filename || 'file.csv'}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {link.provider.replace('-', ' ')}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveLink(index)}
                      className="shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

