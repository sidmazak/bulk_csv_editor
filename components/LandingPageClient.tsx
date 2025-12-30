'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, File, X, Link as LinkIcon, Cloud, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { parseCloudStorageLink } from '@/lib/cloud-storage-client';
import { toast } from 'sonner';

interface FileItem {
  id: string;
  name: string;
  size?: number;
  type: 'local' | 'cloud';
  url?: string;
  provider?: string;
}

export function LandingPageClient() {
  const router = useRouter();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingLink, setIsProcessingLink] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [linkInput, setLinkInput] = useState('');

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
      setIsUploading(true);
      
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
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: 'local' as const,
            url: data.url,
          };
        });
        
        const uploadedFiles = await Promise.all(uploadPromises);
        setFiles((prev) => [...prev, ...uploadedFiles]);
        toast.success(`${droppedFiles.length} file(s) uploaded successfully`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to upload files');
      } finally {
        setIsUploading(false);
      }
    }
  }, []);

  const handleFileInput = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(
      (file) => file.name.toLowerCase().endsWith('.csv')
    );

    if (selectedFiles.length > 0) {
      setIsUploading(true);
      
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
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            type: 'local' as const,
            url: data.url,
          };
        });
        
        const uploadedFiles = await Promise.all(uploadPromises);
        setFiles((prev) => [...prev, ...uploadedFiles]);
        toast.success(`${selectedFiles.length} file(s) uploaded successfully`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to upload files');
      } finally {
        setIsUploading(false);
      }
    }
  }, []);

  const handleAddLink = useCallback(async (link?: string) => {
    const linkToProcess = link || linkInput.trim();
    if (!linkToProcess) {
      toast.error('Please enter a link');
      return;
    }

    setIsProcessingLink(true);

    try {
      const parsedLink = parseCloudStorageLink(linkToProcess);
      
      if (parsedLink.provider === 'unknown') {
        toast.error('Unsupported cloud storage provider. Supported: Google Drive, Dropbox, Mega, TerraBox, OneDrive, Box, pCloud, or direct CSV links');
        setIsProcessingLink(false);
        return;
      }

      if (parsedLink.isDirectory) {
        toast.error('Directory links are not yet supported. Please provide direct CSV file links.');
        setIsProcessingLink(false);
        return;
      }

      if (parsedLink.isZip) {
        toast.error('ZIP files are not yet supported. Please provide direct CSV file links.');
        setIsProcessingLink(false);
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
        toast.error('Please provide a link to a CSV file');
        setIsProcessingLink(false);
        return;
      }
      
      // For cloud storage, warn but allow if filename suggests it might not be CSV
      // The actual validation will happen during download
      if (hasExplicitNonCsvExtension && parsedLink.provider !== 'google-drive') {
        toast.warning('The link may not point to a CSV file. Processing will attempt to download anyway.');
      }

      const newFile: FileItem = {
        id: crypto.randomUUID(),
        name: parsedLink.filename || 'file.csv',
        type: 'cloud',
        url: parsedLink.directUrl,
        provider: parsedLink.provider.replace('-', ' '),
      };

      setFiles((prev) => {
        if (prev.some((f) => f.url === parsedLink.originalUrl)) {
          toast.error('This link is already added');
          return prev;
        }
        return [...prev, newFile];
      });

      setLinkInput('');
      toast.success('Link added successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse link');
    } finally {
      setIsProcessingLink(false);
    }
  }, [linkInput]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && (pastedText.startsWith('http://') || pastedText.startsWith('https://'))) {
      e.preventDefault();
      await handleAddLink(pastedText);
    }
  }, [handleAddLink]);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleContinue = useCallback(() => {
    if (files.length === 0) {
      toast.error('Please add at least one CSV file or link');
      return;
    }
    
    // Store files in sessionStorage
    // For cloud files, also store the originalUrl so UploadPanel can parse it correctly
    const fileData = files.map((file) => {
      const data: any = {
        name: file.name,
        size: file.size,
        type: file.type,
        url: file.url,
        provider: file.provider,
      };
      // For cloud files, if we have the original URL, store it
      if (file.type === 'cloud' && file.url) {
        // Try to get originalUrl from the parsed link
        try {
          const parsedLink = parseCloudStorageLink(file.url);
          data.originalUrl = parsedLink.originalUrl;
        } catch (e) {
          // If parsing fails, just use the url
          data.originalUrl = file.url;
        }
      }
      return data;
    });
    
    sessionStorage.setItem('uploadedFiles', JSON.stringify(fileData));
    router.push('/app');
  }, [files, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b bg-gradient-to-r from-primary/5 via-background to-primary/5">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">Bulk CSV Processing Made Easy</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              CSV Bulk Search & Replace
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powerful tool for bulk CSV editing. Search, replace, and process multiple CSV files from any cloud storage or your computer.
            </p>
          </div>
        </div>
      </section>

      {/* Unified Upload Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-4xl space-y-8">
          {/* Unified Upload Zone */}
          <Card className="border-2 shadow-xl">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl flex items-center justify-center gap-2">
                {/* <Cloud className="h-6 w-6 text-primary" /> */}
                Upload CSV Files or Add Cloud Links
              </CardTitle>
              <CardDescription className="text-base">
                Drag & drop files, select from your computer, or paste a cloud storage link
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onPaste={handlePaste}
                className={`
                  border-2 border-dashed rounded-xl p-12 transition-all cursor-pointer
                  ${isDragging 
                    ? 'border-primary bg-primary/10 scale-[1.02] shadow-lg' 
                    : 'border-border hover:border-primary/50 hover:bg-muted/30'
                  }
                `}
              >
                <div className="flex flex-col items-center justify-center space-y-4">
                  {isUploading ? (
                    <Loader2 className="h-16 w-16 text-primary animate-spin" />
                  ) : (
                    <div className="relative">
                      <Upload className={`h-16 w-16 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                      {/* <Cloud className="h-8 w-8 text-primary absolute -top-2 -right-2" /> */}
                    </div>
                  )}
                  <div className="text-center space-y-2">
                    <p className="text-lg font-semibold">
                      {isUploading 
                        ? 'Uploading files...' 
                        : isDragging 
                        ? 'Drop your CSV files here' 
                        : 'Drag & drop your CSV files'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      or click to browse • or paste a cloud storage link below
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    multiple
                    onChange={handleFileInput}
                    className="hidden"
                    id="file-upload"
                    disabled={isUploading}
                  />
                  <label htmlFor="file-upload">
                    <Button asChild variant="outline" size="lg" disabled={isUploading} className="mt-2">
                      <span>{isUploading ? 'Uploading...' : 'Select Files'}</span>
                    </Button>
                  </label>
                </div>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              {/* Cloud Storage Link Input */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    placeholder="Paste cloud storage link here (Google Drive, Dropbox, Mega, etc.)..."
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleAddLink();
                      }
                    }}
                    onPaste={handlePaste}
                    className="flex-1 h-12 text-base"
                  />
                  <Button
                    onClick={() => handleAddLink()}
                    disabled={isProcessingLink || !linkInput.trim()}
                    size="lg"
                    className="px-6"
                  >
                    {isProcessingLink ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <LinkIcon className="h-4 w-4 mr-2" />
                        Add Link
                      </>
                    )}
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground justify-center pt-2">
                  <span className="px-3 py-1.5 bg-muted rounded-full font-medium">Google Drive</span>
                  <span className="px-3 py-1.5 bg-muted rounded-full font-medium">Dropbox</span>
                  <span className="px-3 py-1.5 bg-muted rounded-full font-medium">Mega</span>
                  <span className="px-3 py-1.5 bg-muted rounded-full font-medium">TerraBox</span>
                  <span className="px-3 py-1.5 bg-muted rounded-full font-medium">OneDrive</span>
                  <span className="px-3 py-1.5 bg-muted rounded-full font-medium">Box</span>
                  <span className="px-3 py-1.5 bg-muted rounded-full font-medium">pCloud</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Selected Files List */}
          {files.length > 0 && (
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Selected Files ({files.length})</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiles([])}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    Clear All
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-4 bg-card border rounded-lg hover:bg-accent transition-all hover:shadow-md"
                    >
                      {file.type === 'cloud' ? (
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Cloud className="h-5 w-5 text-primary shrink-0" />
                        </div>
                      ) : (
                        <div className="p-2 rounded-lg bg-primary/10">
                          <File className="h-5 w-5 text-primary shrink-0" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {file.name}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          {file.size && (
                            <span>{(file.size / 1024).toFixed(2)} KB</span>
                          )}
                          {file.provider && (
                            <>
                              <span>•</span>
                              <span className="capitalize px-2 py-0.5 bg-muted rounded-full">{file.provider}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(file.id)}
                        className="shrink-0 hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CTA Button */}
          <div className="flex justify-center pt-4">
            <Button
              onClick={handleContinue}
              disabled={files.length === 0}
              size="lg"
              className="px-12 py-6 text-lg h-auto font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              Continue to Editor
              <Sparkles className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-12 border-t">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-center mb-8">Features</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Advanced Search</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Powerful search with multiple conditions, regex support, and flexible logic
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Bulk Replace</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Replace values across multiple files and fields simultaneously
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Cloud Integration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Works with Google Drive, Dropbox, Mega, and many more cloud storage services
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}

